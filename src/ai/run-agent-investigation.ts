import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInput } from "openai/resources/responses/responses";

import { env } from "../config/env.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import type { InvestigationStore } from "../investigations/store.js";
import type { InvestigationRunState } from "../investigations/types.js";
import { executeRegisteredTool, modelTools } from "../tools/registry.js";
import { openai } from "./client.js";
import {
  IncidentAssessmentSchema,
  type IncidentAssessment,
} from "./schemas.js";

type InvestigationRunResult =
  | {
      status: "COMPLETED";
      runId: string;
      assessment: IncidentAssessment;
      toolCalls: number;
    }
  | {
      status: "TOOL_BUDGET_EXHAUSTED";
      runId: string;
      toolCalls: number;
    }
  | {
      status: "TIME_BUDGET_EXHAUSTED";
      runId: string;
      toolCalls: number;
    }
  | {
      status: "REPEATED_TOOL_CALL";
      runId: string;
      toolCalls: number;
      tool: string;
    };

type InvestigationStepInput = {
  instructions: string;
  input: string | ResponseInput;
  previousResponseId: string | null;
};

type RunAgentInvestigationOptions = {
  store?: InvestigationStore;
  runId?: string;
};

const investigationLimits = {
  maxToolCalls: 8,
  maxDurationMs: 30_000,
} as const;

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

async function persistState(
  store: InvestigationStore,
  state: InvestigationRunState,
) {
  state.updatedAt = new Date().toISOString();

  await store.save(state);
}

export async function runAgentInvestigation(
  orderId: string,
  options: RunAgentInvestigationOptions = {},
): Promise<InvestigationRunResult> {
  const store = options.store ?? new FileInvestigationStore();

  const prompt = `Why is order ${orderId} stuck?`;
  const now = new Date().toISOString();

  const state: InvestigationRunState = {
    id: options.runId ?? `RUN-${randomUUID()}`,

    orderId,

    goal: `Determine why order ${orderId} is stuck.`,

    status: "RUNNING",

    startedAt: now,
    updatedAt: now,

    toolCalls: 0,

    executedToolCallSignatures: [],

    toolExecutions: [],

    continuation: {
      kind: "INITIAL",
      prompt,
    },

    assessment: null,

    failureReason: null,
  };

  await store.save(state);

  const instructions = [
    "You are an operations investigator.",
    "Use only information provided by the user or returned by tools.",
    "Do not invent application state.",
    "Use available tools when application state is required.",
    "Prefer gathering relevant evidence before reaching a diagnosis.",
    "If another available unqueried tool can materially reduce uncertainty, use it.",
    "Do not repeat the same tool call with the same arguments unless its prior result explicitly indicates that retrying is appropriate.",
    "Distinguish observed issues from root cause.",
    "Do not claim that one observed failure caused another unless the evidence establishes that causal relationship.",
    "A notification failure does not by itself explain an order-state transition failure.",
    "Classify each finding as either ISSUE or EVIDENCE.",
    "Use historical evidence when current state shows an inconsistency that current-state tools cannot explain.",
    "Use technical execution evidence when business history establishes that an expected transition did not occur but does not explain why.",
    "If available evidence remains insufficient to establish root cause, mark the diagnosis as needing more evidence.",
  ].join(" ");

  let previousResponseId: string | null = null;
  let input: string | ResponseInput = prompt;

  const executedToolCalls = new Set<string>();

  try {
    while (true) {
      if (
        Date.now() - new Date(state.startedAt).getTime() >=
        investigationLimits.maxDurationMs
      ) {
        state.status = "TIME_BUDGET_EXHAUSTED";

        state.failureReason = "Investigation exceeded its maximum duration.";

        await persistState(store, state);

        return {
          status: "TIME_BUDGET_EXHAUSTED",
          runId: state.id,
          toolCalls: state.toolCalls,
        };
      }

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

        state.status = "COMPLETED";
        state.assessment = response.output_parsed;
        state.failureReason = null;

        await persistState(store, state);

        return {
          status: "COMPLETED",
          runId: state.id,
          assessment: response.output_parsed,
          toolCalls: state.toolCalls,
        };
      }

      if (state.toolCalls >= investigationLimits.maxToolCalls) {
        state.status = "TOOL_BUDGET_EXHAUSTED";

        state.failureReason =
          "Investigation exceeded its maximum tool-call budget.";

        await persistState(store, state);

        return {
          status: "TOOL_BUDGET_EXHAUSTED",
          runId: state.id,
          toolCalls: state.toolCalls,
        };
      }

      const toolCallSignature = JSON.stringify({
        name: toolCall.name,
        arguments: toolCall.parsed_arguments,
      });

      if (executedToolCalls.has(toolCallSignature)) {
        state.status = "REPEATED_TOOL_CALL";

        state.failureReason = `Model attempted to repeat ${toolCall.name} with identical arguments.`;

        await persistState(store, state);

        return {
          status: "REPEATED_TOOL_CALL",
          runId: state.id,
          toolCalls: state.toolCalls,
          tool: toolCall.name,
        };
      }

      executedToolCalls.add(toolCallSignature);

      const sequence = state.toolCalls + 1;

      console.log(`Step ${sequence} — model requested:`, {
        name: toolCall.name,
        arguments: toolCall.parsed_arguments,
      });

      const toolResult = executeRegisteredTool(
        toolCall.name,
        toolCall.parsed_arguments,
      );

      console.log(`Step ${sequence} — tool result:`, toolResult);

      const serializedResult = JSON.stringify(toolResult);

      state.toolCalls = sequence;

      state.executedToolCallSignatures.push(toolCallSignature);

      state.toolExecutions.push({
        sequence,
        tool: toolCall.name,
        arguments: toolCall.parsed_arguments,
        result: toolResult,
        executedAt: new Date().toISOString(),
      });

      state.continuation = {
        kind: "TOOL_OUTPUT",
        previousResponseId: response.id,
        callId: toolCall.call_id,
        output: serializedResult,
      };

      await persistState(store, state);

      previousResponseId = response.id;

      input = [
        {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: serializedResult,
        },
      ];
    }
  } catch (error) {
    state.status = "FAILED";

    state.failureReason =
      error instanceof Error ? error.message : "Unknown investigation failure.";

    await persistState(store, state);

    throw error;
  }
}
