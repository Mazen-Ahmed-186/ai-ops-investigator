import type { InvestigationTelemetrySummary } from "./summarize-investigation-telemetry.js";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );

  return sorted[index] ?? null;
}

export function aggregateInvestigationMetrics(
  summaries: InvestigationTelemetrySummary[],
) {
  const durations = summaries
    .map((summary) => summary.totalDurationMs)
    .filter((duration): duration is number => duration !== null);

  const modelDurationShares = summaries
    .map((summary) => summary.modelDurationShare)
    .filter((share): share is number => share !== null);

  const inputTokenGrowthRatios = summaries
    .map((summary) => summary.inputTokenGrowthRatio)
    .filter((ratio): ratio is number => ratio !== null);

  const completedRuns = summaries.filter(
    (summary) => summary.outcome === "COMPLETED",
  ).length;

  const outcomeCounts = summaries.reduce<Record<string, number>>(
    (counts, summary) => {
      const outcome = summary.outcome ?? "UNKNOWN";

      counts[outcome] = (counts[outcome] ?? 0) + 1;

      return counts;
    },
    {},
  );

  const toolCallCounts = summaries.reduce<Record<string, number>>(
    (counts, summary) => {
      for (const [toolName, count] of Object.entries(summary.toolCallCounts)) {
        counts[toolName] = (counts[toolName] ?? 0) + count;
      }

      return counts;
    },
    {},
  );

  return {
    runs: summaries.length,

    completedRuns,

    successRate:
      summaries.length === 0 ? null : completedRuns / summaries.length,

    averageDurationMs: average(durations),

    p50DurationMs: percentile(durations, 0.5),

    p95DurationMs: percentile(durations, 0.95),

    averageModelSteps: average(summaries.map((summary) => summary.modelSteps)),

    averageToolCalls: average(summaries.map((summary) => summary.toolCalls)),

    averageTotalTokens: average(
      summaries.map((summary) => summary.totalTokens),
    ),

    averageInputTokens: average(
      summaries.map((summary) => summary.inputTokens),
    ),

    averageOutputTokens: average(
      summaries.map((summary) => summary.outputTokens),
    ),

    averageModelDurationShare: average(modelDurationShares),

    averageInputTokenGrowthRatio: average(inputTokenGrowthRatios),

    failedToolCalls: summaries.reduce(
      (sum, summary) => sum + summary.failedToolCalls,
      0,
    ),

    outcomeCounts,

    toolCallCounts,
  };
}
