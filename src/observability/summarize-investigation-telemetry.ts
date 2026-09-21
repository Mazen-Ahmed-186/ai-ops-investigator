import type { InvestigationTelemetryEvent } from "./events.js";

export function summarizeInvestigationTelemetry(
  events: InvestigationTelemetryEvent[],
) {
  const modelEvents = events.filter(
    (event) => event.type === "MODEL_STEP_COMPLETED",
  );

  const toolEvents = events.filter(
    (event) => event.type === "TOOL_EXECUTION_COMPLETED",
  );

  const terminalEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "INVESTIGATION_FINISHED" ||
        event.type === "INVESTIGATION_FAILED",
    );

  const modelDurationMs = modelEvents.reduce(
    (sum, event) => sum + event.durationMs,
    0,
  );

  const toolDurationMs = toolEvents.reduce(
    (sum, event) => sum + event.durationMs,
    0,
  );

  const totalDurationMs = terminalEvent?.durationMs ?? null;

  const overheadDurationMs =
    totalDurationMs === null
      ? null
      : Math.max(0, totalDurationMs - modelDurationMs - toolDurationMs);

  const modelDurationShare =
    totalDurationMs && totalDurationMs > 0
      ? modelDurationMs / totalDurationMs
      : null;

  const averageModelStepMs =
    modelEvents.length === 0 ? null : modelDurationMs / modelEvents.length;

  const maxModelStepMs =
    modelEvents.length === 0
      ? null
      : Math.max(...modelEvents.map((event) => event.durationMs));

  const firstInputTokens = modelEvents[0]?.usage.inputTokens ?? null;

  const lastInputTokens = modelEvents.at(-1)?.usage.inputTokens ?? null;

  const inputTokenGrowthRatio =
    firstInputTokens && lastInputTokens
      ? lastInputTokens / firstInputTokens
      : null;

  const toolCallCounts = toolEvents.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.toolName] = (counts[event.toolName] ?? 0) + 1;

      return counts;
    },
    {},
  );

  const outcome =
    terminalEvent?.type === "INVESTIGATION_FINISHED"
      ? terminalEvent.status
      : terminalEvent?.type === "INVESTIGATION_FAILED"
        ? "FAILED"
        : null;

  return {
    outcome,

    totalDurationMs,

    modelSteps: modelEvents.length,

    toolCalls: toolEvents.length,

    modelDurationMs,

    toolDurationMs,

    overheadDurationMs,

    modelDurationShare,

    averageModelStepMs,

    maxModelStepMs,

    inputTokens: modelEvents.reduce(
      (sum, event) => sum + (event.usage.inputTokens ?? 0),
      0,
    ),

    outputTokens: modelEvents.reduce(
      (sum, event) => sum + (event.usage.outputTokens ?? 0),
      0,
    ),

    totalTokens: modelEvents.reduce(
      (sum, event) => sum + (event.usage.totalTokens ?? 0),
      0,
    ),

    firstInputTokens,

    lastInputTokens,

    inputTokenGrowthRatio,

    failedToolCalls: toolEvents.filter((event) => !event.ok).length,

    toolCallCounts,
  };
}

export type InvestigationTelemetrySummary = ReturnType<
  typeof summarizeInvestigationTelemetry
>;
