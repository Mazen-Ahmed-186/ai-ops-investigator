import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { aggregateInvestigationMetrics } from "../../src/observability/aggregate-investigation-metrics.js";
import { InMemoryTelemetrySink } from "../../src/observability/in-memory-telemetry.js";
import { summarizeInvestigationTelemetry } from "../../src/observability/summarize-investigation-telemetry.js";
import { checkInvestigationRegressions } from "../../src/observability/check-investigation-regressions.js";
import { investigationRegressionBudget } from "../../src/observability/investigation-regression-budget.js";

const RUNS = 5;

async function evaluate() {
  const summaries = [];

  for (let run = 1; run <= RUNS; run += 1) {
    console.log(`\n=== Observability run ${run}/${RUNS} ===`);

    const telemetry = new InMemoryTelemetrySink();

    const result = await runAgentInvestigation("ORD-1001", {
      telemetry,
    });

    const summary = summarizeInvestigationTelemetry(telemetry.getEvents());

    summaries.push(summary);

    console.log({
      status: result.status,

      durationMs: summary.totalDurationMs,

      modelSteps: summary.modelSteps,

      toolCalls: summary.toolCalls,

      totalTokens: summary.totalTokens,

      modelDurationShare: summary.modelDurationShare,
    });
  }

  console.log("\nAggregated investigation metrics:");

  console.dir(aggregateInvestigationMetrics(summaries), {
    depth: null,
  });

  const regression = checkInvestigationRegressions(
    summaries,
    investigationRegressionBudget,
  );

  console.log("\nRegression checks:");

  console.table(regression.checks);

  console.log({
    passed: regression.passed,
  });

  if (!regression.passed) {
    process.exitCode = 1;
  }
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
