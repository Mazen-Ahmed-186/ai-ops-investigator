import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInput } from "openai/resources/responses/responses";

import { env } from "../config/env.js";
import { executeRegisteredTool, modelTools } from "../tools/registry.js";
import { openai } from "./client.js";
import {
  IncidentAssessmentSchema,
  type IncidentAssessment,
} from "./schemas.js";

type InvestigationRunResult =
  | {
      status: "COMPLETED";
      assessment: IncidentAssessment;
      toolCalls: number;
    }
  | {
      status: "TOOL_BUDGET_EXHAUSTED";
      toolCalls: number;
    };

type InvestigationStepInput = {
  instructions: string;
  input: string | ResponseInput;
  previousResponseId: string | null;
};

const MAX_TOOL_CALLS = 4;

async function requestInvestigationStep({
  instructions,
  input,
  previousResponseId,
}: InvestigationStepInput) {
  const baseRequest = {
    model: env.OPENAI_MODEL,
    instructions,
    input,
    tools: modelTools,
    parallel_tool_calls: false,
    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
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

export async function runAgentInvestigation(
  orderId: string,
): Promise<InvestigationRunResult> {
  const instructions = [
    "You are an operations investigator.",
    "Use only information provided by the user or returned by tools.",
    "Do not invent application state.",
    "Use available tools when application state is required.",
    "Prefer gathering relevant evidence before reaching a diagnosis.",
    "If another available unqueried tool can materially reduce uncertainty, use it.",
    "Do not repeat the same tool call with the same arguments unless its prior result explicitly indicates that retrying is appropriate.",
    "If available evidence remains insufficient, return UNKNOWN and require more evidence.",
  ].join(" ");

  let previousResponseId: string | null = null;
  let input: string | ResponseInput = `Why is order ${orderId} stuck?`;

  let toolCalls = 0;

  while (true) {
    const response = await requestInvestigationStep({
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
          "Model returned neither a tool call nor a parsed assessment.",
        );
      }

      return {
        status: "COMPLETED",
        assessment: response.output_parsed,
        toolCalls,
      };
    }

    if (toolCalls >= MAX_TOOL_CALLS) {
      return {
        status: "TOOL_BUDGET_EXHAUSTED",
        toolCalls,
      };
    }

    toolCalls += 1;

    console.log(`Step ${toolCalls} — model requested:`, {
      name: toolCall.name,
      arguments: toolCall.parsed_arguments,
    });

    const toolResult = executeRegisteredTool(
      toolCall.name,
      toolCall.parsed_arguments,
    );

    console.log(`Step ${toolCalls} — tool result:`, toolResult);

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
