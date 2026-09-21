import { describe, expect, it } from "vitest";

import type { InvestigationTelemetrySummary } from "../../../src/observability/summarize-investigation-telemetry.js";
import { aggregateInvestigationMetrics } from "../../../src/observability/aggregate-investigation-metrics.js";

function createSummary(
  overrides: Partial<InvestigationTelemetrySummary> = {},
): InvestigationTelemetrySummary {
  return {
    outcome: "COMPLETED",

    totalDurationMs: 10_000,

    modelSteps: 8,
    toolCalls: 7,

    modelDurationMs: 9_900,
    toolDurationMs: 10,
    overheadDurationMs: 90,

    modelDurationShare: 0.99,

    averageModelStepMs: 1237.5,
    maxModelStepMs: 2000,

    inputTokens: 10_000,
    outputTokens: 500,
    totalTokens: 10_500,

    firstInputTokens: 1000,
    lastInputTokens: 2000,
    inputTokenGrowthRatio: 2,

    failedToolCalls: 0,

    toolCallCounts: {
      get_order: 1,
    },

    ...overrides,
  };
}

describe("aggregateInvestigationMetrics", () => {
  it("aggregates investigation performance across runs", () => {
    const summaries = [
      createSummary({
        totalDurationMs: 10_000,
        totalTokens: 10_000,
        toolCalls: 6,
      }),

      createSummary({
        totalDurationMs: 12_000,
        totalTokens: 12_000,
        toolCalls: 7,
      }),

      createSummary({
        outcome: "TIME_BUDGET_EXHAUSTED",

        totalDurationMs: 30_000,
        totalTokens: 14_000,
        toolCalls: 8,

        failedToolCalls: 1,

        toolCallCounts: {
          get_order: 1,
          get_payment_state: 1,
        },
      }),
    ];

    const result = aggregateInvestigationMetrics(summaries);

    expect(result).toMatchObject({
      runs: 3,

      completedRuns: 2,

      averageDurationMs: 52_000 / 3,

      p50DurationMs: 12_000,

      p95DurationMs: 30_000,

      averageToolCalls: 7,

      averageTotalTokens: 12_000,

      failedToolCalls: 1,

      outcomeCounts: {
        COMPLETED: 2,
        TIME_BUDGET_EXHAUSTED: 1,
      },

      toolCallCounts: {
        get_order: 3,
        get_payment_state: 1,
      },
    });

    expect(result.successRate).toBeCloseTo(2 / 3);
  });
});
