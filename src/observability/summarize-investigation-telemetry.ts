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

  return {
    modelSteps: modelEvents.length,

    toolCalls: toolEvents.length,

    modelDurationMs: modelEvents.reduce(
      (sum, event) => sum + event.durationMs,
      0,
    ),

    toolDurationMs: toolEvents.reduce(
      (sum, event) => sum + event.durationMs,
      0,
    ),

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

    failedToolCalls: toolEvents.filter((event) => !event.ok).length,
  };
}
