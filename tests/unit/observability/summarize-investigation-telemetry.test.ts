import { describe, expect, it } from "vitest";

import type { InvestigationTelemetryEvent } from "../../../src/observability/events.js";
import { summarizeInvestigationTelemetry } from "../../../src/observability/summarize-investigation-telemetry.js";

describe("summarizeInvestigationTelemetry", () => {
  it("summarizes operational investigation metrics", () => {
    const events: InvestigationTelemetryEvent[] = [
      {
        type: "INVESTIGATION_STARTED",
        runId: "RUN-1",
        orderId: "ORD-1001",
        occurredAt: "2026-09-21T11:00:00.000Z",
      },
      {
        type: "MODEL_STEP_COMPLETED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:01.000Z",
        step: 1,
        durationMs: 900,
        usage: {
          inputTokens: 500,
          outputTokens: 50,
          totalTokens: 550,
        },
      },
      {
        type: "TOOL_EXECUTION_COMPLETED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:01.010Z",
        step: 1,
        toolName: "get_order",
        durationMs: 10,
        ok: true,
        errorCategory: null,
      },
      {
        type: "MODEL_STEP_COMPLETED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:02.000Z",
        step: 2,
        durationMs: 700,
        usage: {
          inputTokens: 600,
          outputTokens: 100,
          totalTokens: 700,
        },
      },
      {
        type: "TOOL_EXECUTION_COMPLETED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:02.020Z",
        step: 2,
        toolName: "get_payment_state",
        durationMs: 20,
        ok: false,
        errorCategory: "TRANSIENT_DEPENDENCY",
      },
      {
        type: "INVESTIGATION_FINISHED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:03.000Z",
        durationMs: 3000,
        toolCalls: 2,
        status: "COMPLETED",
      },
    ];

    const summary = summarizeInvestigationTelemetry(events);

    expect(summary).toMatchObject({
      outcome: "COMPLETED",

      totalDurationMs: 3000,

      modelSteps: 2,
      toolCalls: 2,

      modelDurationMs: 1600,
      toolDurationMs: 30,

      overheadDurationMs: 1370,

      averageModelStepMs: 800,
      maxModelStepMs: 900,

      inputTokens: 1100,
      outputTokens: 150,
      totalTokens: 1250,

      firstInputTokens: 500,
      lastInputTokens: 600,

      failedToolCalls: 1,

      toolCallCounts: {
        get_order: 1,
        get_payment_state: 1,
      },
    });

    expect(summary.modelDurationShare).toBeCloseTo(1600 / 3000);

    expect(summary.inputTokenGrowthRatio).toBeCloseTo(1.2);
  });
});
