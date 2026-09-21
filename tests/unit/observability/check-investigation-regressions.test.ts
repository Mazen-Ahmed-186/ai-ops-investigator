import { describe, expect, it } from "vitest";

import { checkInvestigationRegressions } from "../../../src/observability/check-investigation-regressions.js";
import type { InvestigationTelemetrySummary } from "../../../src/observability/summarize-investigation-telemetry.js";

function createSummary(
  overrides: Partial<InvestigationTelemetrySummary> = {},
): InvestigationTelemetrySummary {
  return {
    outcome: "COMPLETED",

    totalDurationMs: 14_000,

    modelSteps: 8,
    toolCalls: 7,

    modelDurationMs: 13_900,
    toolDurationMs: 0,
    overheadDurationMs: 100,

    modelDurationShare: 0.99,

    averageModelStepMs: 1737.5,
    maxModelStepMs: 3000,

    inputTokens: 12_000,
    outputTokens: 700,
    totalTokens: 12_700,

    firstInputTokens: 1000,
    lastInputTokens: 2500,
    inputTokenGrowthRatio: 2.5,

    failedToolCalls: 0,

    toolCallCounts: {
      get_order: 1,
    },

    ...overrides,
  };
}

const budget = {
  minimumSuccessRate: 0.8,

  maximumAverageToolCalls: 8,

  maximumAverageModelSteps: 9,

  maximumAverageTotalTokens: 16_000,

  maximumP95DurationMs: 22_000,

  minimumRunsForP95Duration: 20,

  maximumFailedToolCalls: 0,
};

describe("checkInvestigationRegressions", () => {
  it("passes behavioral checks and skips p95 with insufficient samples", () => {
    const result = checkInvestigationRegressions(
      [
        createSummary(),
        createSummary({
          totalDurationMs: 28_000,
        }),
      ],
      budget,
    );

    expect(result.passed).toBe(true);

    const p95Check = result.checks.find(
      (check) => check.name === "p95 duration",
    );

    expect(p95Check?.status).toBe("SKIP");
  });

  it("fails when investigation behavior regresses", () => {
    const result = checkInvestigationRegressions(
      [
        createSummary({
          toolCalls: 9,

          totalTokens: 18_000,

          failedToolCalls: 1,
        }),
      ],
      budget,
    );

    expect(result.passed).toBe(false);

    expect(result.checks.some((check) => check.status === "FAIL")).toBe(true);
  });

  it("fails p95 latency when enough samples exist", () => {
    const summaries = Array.from(
      {
        length: 20,
      },
      (_, index) =>
        createSummary({
          totalDurationMs: index >= 18 ? 25_000 : 14_000,
        }),
    );

    const result = checkInvestigationRegressions(summaries, budget);

    const p95Check = result.checks.find(
      (check) => check.name === "p95 duration",
    );

    expect(p95Check?.status).toBe("FAIL");

    expect(result.passed).toBe(false);
  });
});
