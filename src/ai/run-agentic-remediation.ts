import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInput } from "openai/resources/responses/responses";

import { env } from "../config/env.js";
import { createOpenAIRegisteredCapability } from "../tools/openai-adapter.js";
import { searchRunbooksCapability } from "../tools/search-runbooks.tool.js";
import { openai } from "./client.js";
import {
  RemediationRecommendationSchema,
  type RemediationRecommendation,
} from "./remediation-schema.js";
import type { IncidentAssessment } from "./schemas.js";
import { validateRemediationGrounding } from "./validate-remediation-grounding.js";

const registeredSearchRunbooks = createOpenAIRegisteredCapability(
  searchRunbooksCapability,
);

const remediationLimits = {
  maxToolCalls: 3,
} as const;

export type AgenticRemediationResult = {
  recommendation: RemediationRecommendation;
  toolCalls: number;
  retrievedRunbooks: Array<{
    id: string;
    title: string;
    content: string;
    score: number;
  }>;
};

type RemediationStepInput = {
  instructions: string;
  input: string | ResponseInput;
  previousResponseId: string | null;
};

async function requestRemediationStep({
  instructions,
  input,
  previousResponseId,
}: RemediationStepInput) {
  const baseRequest = {
    model: env.OPENAI_MODEL,
    instructions,
    input,

    tools: [registeredSearchRunbooks.definition],

    parallel_tool_calls: false,

    text: {
      format: zodTextFormat(
        RemediationRecommendationSchema,
        "remediation_recommendation",
      ),
    },
  };

  if (previousResponseId) {
    return openai.responses.parse({
      ...baseRequest,
      previous_response_id: previousResponseId,
    });
  }

  return openai.responses.parse(baseRequest);
}

export async function runAgenticRemediation(
  assessment: IncidentAssessment,
): Promise<AgenticRemediationResult> {
  let input: string | ResponseInput = JSON.stringify({
    incidentAssessment: assessment,
    task: "Determine the supported remediation for this incident.",
  });

  let previousResponseId: string | null = null;

  let toolCalls = 0;

  const executedSearches = new Set<string>();

  const retrievedRunbooks = new Map<
    string,
    {
      id: string;
      title: string;
      content: string;
      score: number;
    }
  >();

  const instructions = [
    "You are an operations remediation assistant.",
    "The incident assessment has already been produced; do not re-diagnose the incident.",
    "Use search_runbooks when operational knowledge is needed to determine remediation.",
    "Choose search queries based on the diagnosed incident and unresolved remediation question.",
    "Use only the incident assessment and runbook results returned by the tool.",
    "Do not invent remediation steps.",
    "Every recommended action must cite at least one runbook that was actually retrieved.",
    "Do not repeat an identical runbook search.",
    "If no retrieved runbook supports remediation, return NO_APPLICABLE_RUNBOOK.",
    "Classify each remediation action as PRIMARY, FOLLOW_UP, or CONSTRAINT.",
    "Use PRIMARY only for the single next executable action that directly addresses the diagnosed incident.",
    "Use FOLLOW_UP for executable work that is valid but secondary to resolving the diagnosed incident.",
    "Use CONSTRAINT for prohibitions, warnings, or instructions describing what must not be done.",
    "PRIMARY and FOLLOW_UP actions must use one of the provided action kinds.",
    "CONSTRAINT actions must use a null actionKind.",
    "Do not invent an executable action kind when the retrieved runbooks only support investigation, reconciliation, or escalation outside the available action set.",
  ].join(" ");

  while (true) {
    const baseRequest = {
      model: env.OPENAI_MODEL,

      instructions,

      input,

      tools: [registeredSearchRunbooks.definition],

      parallel_tool_calls: false,

      text: {
        format: zodTextFormat(
          RemediationRecommendationSchema,
          "remediation_recommendation",
        ),
      },
    };

    const response = await requestRemediationStep({
      instructions,
      input,
      previousResponseId,
    });

    if (response.status !== "completed") {
      throw new Error(`Model response did not complete: ${response.status}`);
    }

    const toolCall = response.output.find(
      (item) => item.type === "function_call",
    );

    if (!toolCall) {
      if (!response.output_parsed) {
        throw new Error(
          "Model returned neither a tool call nor a remediation recommendation.",
        );
      }

      const availableRunbooks = [...retrievedRunbooks.values()];

      validateRemediationGrounding(response.output_parsed, availableRunbooks);

      return {
        recommendation: response.output_parsed,

        toolCalls,

        retrievedRunbooks: availableRunbooks,
      };
    }

    if (toolCalls >= remediationLimits.maxToolCalls) {
      throw new Error(
        "Agentic remediation exceeded its runbook-search budget.",
      );
    }

    const signature = JSON.stringify({
      name: toolCall.name,
      arguments: toolCall.parsed_arguments,
    });

    if (executedSearches.has(signature)) {
      throw new Error(
        "Agentic remediation repeated an identical runbook search.",
      );
    }

    executedSearches.add(signature);
    toolCalls += 1;

    console.log(`Remediation search ${toolCalls}:`, toolCall.parsed_arguments);

    const toolResult = registeredSearchRunbooks.execute(
      toolCall.parsed_arguments,
    );

    console.log(`Remediation search ${toolCalls} result:`, toolResult);

    if (toolResult.ok) {
      const data = toolResult.data as {
        results: Array<{
          id: string;
          title: string;
          content: string;
          score: number;
        }>;
      };

      for (const result of data.results) {
        retrievedRunbooks.set(result.id, result);
      }
    }

    previousResponseId = response.id;

    input = [
      {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(toolResult),
      },
    ];
  }
}
