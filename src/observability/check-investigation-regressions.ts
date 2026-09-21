import { aggregateInvestigationMetrics } from "./aggregate-investigation-metrics.js";
import type { InvestigationTelemetrySummary } from "./summarize-investigation-telemetry.js";

export type InvestigationRegressionBudget = {
  minimumSuccessRate: number;
  maximumAverageToolCalls: number;
  maximumAverageModelSteps: number;
  maximumAverageTotalTokens: number;
  maximumP95DurationMs: number;
  minimumRunsForP95Duration: number;
  maximumFailedToolCalls: number;
};

export type InvestigationRegressionCheckStatus = "PASS" | "FAIL" | "SKIP";

export type InvestigationRegressionCheck = {
  name: string;
  status: InvestigationRegressionCheckStatus;
  actual: number | null;
  expected: string;
  reason: string | null;
};

function status(condition: boolean): InvestigationRegressionCheckStatus {
  return condition ? "PASS" : "FAIL";
}

export function checkInvestigationRegressions(
  summaries: InvestigationTelemetrySummary[],
  budget: InvestigationRegressionBudget,
) {
  const metrics = aggregateInvestigationMetrics(summaries);

  const hasEnoughRunsForP95 = metrics.runs >= budget.minimumRunsForP95Duration;

  const checks: InvestigationRegressionCheck[] = [
    {
      name: "success rate",
      status: status(
        metrics.successRate !== null &&
          metrics.successRate >= budget.minimumSuccessRate,
      ),
      actual: metrics.successRate,
      expected: `>= ${budget.minimumSuccessRate}`,
      reason: null,
    },

    {
      name: "average tool calls",
      status: status(
        metrics.averageToolCalls !== null &&
          metrics.averageToolCalls <= budget.maximumAverageToolCalls,
      ),
      actual: metrics.averageToolCalls,
      expected: `<= ${budget.maximumAverageToolCalls}`,
      reason: null,
    },

    {
      name: "average model steps",
      status: status(
        metrics.averageModelSteps !== null &&
          metrics.averageModelSteps <= budget.maximumAverageModelSteps,
      ),
      actual: metrics.averageModelSteps,
      expected: `<= ${budget.maximumAverageModelSteps}`,
      reason: null,
    },

    {
      name: "average total tokens",
      status: status(
        metrics.averageTotalTokens !== null &&
          metrics.averageTotalTokens <= budget.maximumAverageTotalTokens,
      ),
      actual: metrics.averageTotalTokens,
      expected: `<= ${budget.maximumAverageTotalTokens}`,
      reason: null,
    },

    {
      name: "p95 duration",
      status: !hasEnoughRunsForP95
        ? "SKIP"
        : status(
            metrics.p95DurationMs !== null &&
              metrics.p95DurationMs <= budget.maximumP95DurationMs,
          ),
      actual: metrics.p95DurationMs,
      expected: `<= ${budget.maximumP95DurationMs}`,
      reason: hasEnoughRunsForP95
        ? null
        : `Requires at least ${budget.minimumRunsForP95Duration} runs; received ${metrics.runs}.`,
    },

    {
      name: "failed tool calls",
      status: status(metrics.failedToolCalls <= budget.maximumFailedToolCalls),
      actual: metrics.failedToolCalls,
      expected: `<= ${budget.maximumFailedToolCalls}`,
      reason: null,
    },
  ];

  return {
    passed: checks.every((check) => check.status !== "FAIL"),
    checks,
    metrics,
  };
}
