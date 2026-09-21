import type { InvestigationRegressionBudget } from "./check-investigation-regressions.js";

export const investigationRegressionBudget: InvestigationRegressionBudget = {
  minimumSuccessRate: 0.8,
  maximumAverageToolCalls: 8,
  maximumAverageModelSteps: 9,
  maximumAverageTotalTokens: 16_000,
  maximumP95DurationMs: 22_000,
  minimumRunsForP95Duration: 20,
  maximumFailedToolCalls: 0,
};
