import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInput } from "openai/resources/responses/responses";

import { env } from "../config/env.js";
import { buildReconstructedInvestigationInput } from "../investigations/build-model-context.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import { projectWorkingMemory } from "../investigations/project-working-memory.js";
import type { InvestigationStore } from "../investigations/store.js";
import type { InvestigationRunState } from "../investigations/types.js";
import type { TelemetrySink } from "../observability/events.js";
import {
  createInvestigationTelemetry,
  durationSince,
  occurredAt,
} from "../observability/investigation-telemetry.js";
import { executeRegisteredTool, modelTools } from "../tools/registry.js";
import { openai } from "./client.js";
import {
  IncidentAssessmentSchema,
  type IncidentAssessment,
} from "./schemas.js";

type InvestigationExecutionMode = "NEW" | "RESUME";

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

type InvestigationExecutionOptions = {
  store?: InvestigationStore;
  simulateCrashAfterToolCalls?: number;
  telemetry?: TelemetrySink;
};

type RunAgentInvestigationOptions = InvestigationExecutionOptions & {
  runId?: string;
};

class SimulatedCrashError extends Error {
  constructor(toolCalls: number) {
    super(`Simulated process crash after ${toolCalls} tool calls.`);

    this.name = "SimulatedCrashError";
  }
}

const investigationLimits = {
  maxToolCalls: 8,
  maxDurationMs: 30_000,
} as const;

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
    store: true,
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

async function executeInvestigation(
  state: InvestigationRunState,
  store: InvestigationStore,
  options: InvestigationExecutionOptions,
  mode: InvestigationExecutionMode,
): Promise<InvestigationRunResult> {
  if (!state.continuation) {
    throw new Error(`Investigation ${state.id} has no continuation state.`);
  }

  const telemetry = createInvestigationTelemetry(options.telemetry);

  telemetry.sink?.record({
    type: "INVESTIGATION_STARTED",
    runId: state.id,
    orderId: state.orderId,
    occurredAt: occurredAt(),
  });

  let previousResponseId: string | null;

  let input: string | ResponseInput;

  if (mode === "RESUME") {
    previousResponseId = null;

    input = buildReconstructedInvestigationInput(state);

    console.log(
      `Resuming ${state.id} from ${state.toolCalls} persisted tool observations.`,
    );
  } else {
    if (!state.continuation) {
      throw new Error(`Investigation ${state.id} has no continuation state.`);
    }

    if (state.continuation.kind === "INITIAL") {
      previousResponseId = null;

      input = state.continuation.prompt;
    } else {
      previousResponseId = state.continuation.previousResponseId;

      input = [
        {
          type: "function_call_output",
          call_id: state.continuation.callId,
          output: state.continuation.output,
        },
      ];
    }
  }

  const executedToolCalls = new Set(state.executedToolCallSignatures);

  const executionStartedAt = Date.now();

  try {
    while (true) {
      if (
        Date.now() - executionStartedAt >=
        investigationLimits.maxDurationMs
      ) {
        state.status = "TIME_BUDGET_EXHAUSTED";

        state.failureReason =
          "Investigation exceeded its maximum active execution duration.";

        await persistState(store, state);

        telemetry.sink?.record({
          type: "INVESTIGATION_FINISHED",
          runId: state.id,
          occurredAt: occurredAt(),
          durationMs: durationSince(telemetry.startedAtMs),
          toolCalls: state.toolCalls,
          status: "TIME_BUDGET_EXHAUSTED",
        });

        return {
          status: "TIME_BUDGET_EXHAUSTED",
          runId: state.id,
          toolCalls: state.toolCalls,
        };
      }

      const modelStep = state.toolCalls + 1;

      const modelStartedAt = performance.now();

      const response = await requestInvestigationStep({
        instructions,
        input,
        previousResponseId,
      });

      telemetry.sink?.record({
        type: "MODEL_STEP_COMPLETED",
        runId: state.id,
        occurredAt: occurredAt(),
        step: modelStep,
        durationMs: durationSince(modelStartedAt),
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,

          outputTokens: response.usage?.output_tokens ?? null,

          totalTokens: response.usage?.total_tokens ?? null,
        },
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

        state.continuation = null;

        await persistState(store, state);

        telemetry.sink?.record({
          type: "INVESTIGATION_FINISHED",
          runId: state.id,
          occurredAt: occurredAt(),
          durationMs: durationSince(telemetry.startedAtMs),
          toolCalls: state.toolCalls,
          status: "COMPLETED",
        });

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

        telemetry.sink?.record({
          type: "INVESTIGATION_FINISHED",
          runId: state.id,
          occurredAt: occurredAt(),
          durationMs: durationSince(telemetry.startedAtMs),
          toolCalls: state.toolCalls,
          status: "TOOL_BUDGET_EXHAUSTED",
        });

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

        telemetry.sink?.record({
          type: "INVESTIGATION_FINISHED",
          runId: state.id,
          occurredAt: occurredAt(),
          durationMs: durationSince(telemetry.startedAtMs),
          toolCalls: state.toolCalls,
          status: "REPEATED_TOOL_CALL",
        });

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

      const toolStartedAt = performance.now();

      const toolResult = executeRegisteredTool(
        toolCall.name,
        toolCall.parsed_arguments,
      );

      telemetry.sink?.record({
        type: "TOOL_EXECUTION_COMPLETED",
        runId: state.id,
        occurredAt: occurredAt(),
        step: sequence,
        toolName: toolCall.name,
        durationMs: durationSince(toolStartedAt),
        ok: toolResult.ok,
        errorCategory: toolResult.ok ? null : toolResult.error.category,
      });

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

      state.workingMemory = projectWorkingMemory(state);

      state.continuation = {
        kind: "TOOL_OUTPUT",
        previousResponseId: response.id,
        callId: toolCall.call_id,
        output: serializedResult,
      };

      await persistState(store, state);

      if (options.simulateCrashAfterToolCalls === state.toolCalls) {
        throw new SimulatedCrashError(state.toolCalls);
      }

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
    if (error instanceof SimulatedCrashError) {
      throw error;
    }

    state.status = "FAILED";

    state.failureReason =
      error instanceof Error ? error.message : "Unknown investigation failure.";

    await persistState(store, state);

    telemetry.sink?.record({
      type: "INVESTIGATION_FAILED",
      runId: state.id,
      occurredAt: occurredAt(),
      durationMs: durationSince(telemetry.startedAtMs),
      reason: state.failureReason,
    });

    throw error;
  }
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

    workingMemory: {
      facts: [],
      unresolvedQuestions: [],
    },

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

  return executeInvestigation(state, store, options, "NEW");
}

export async function resumeAgentInvestigation(
  runId: string,
  options: InvestigationExecutionOptions = {},
): Promise<InvestigationRunResult> {
  const store = options.store ?? new FileInvestigationStore();

  const state = await store.get(runId);

  if (!state) {
    throw new Error(`Investigation ${runId} was not found.`);
  }

  if (state.status === "COMPLETED" && state.assessment) {
    return {
      status: "COMPLETED",
      runId: state.id,
      assessment: state.assessment,
      toolCalls: state.toolCalls,
    };
  }

  if (state.status !== "RUNNING") {
    throw new Error(
      `Investigation ${runId} cannot be resumed from status ${state.status}.`,
    );
  }

  return executeInvestigation(state, store, options, "RESUME");
}
