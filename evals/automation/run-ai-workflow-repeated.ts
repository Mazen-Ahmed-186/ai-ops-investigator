import { evaluateAiWorkflow } from "./evaluate-ai-workflow.js";

const trials = 5;

type TrialResult =
  | {
      trial: number;
      passed: true;
      diagnosis: string;
      toolCalls: number;
      primaryAction: string;
      approvalCount: number;
      executionCount: number;
      effect: string;
      automationStatus: string;
    }
  | {
      trial: number;
      passed: false;
      error: string;
    };

const results: TrialResult[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(`\n=== AI workflow trial ${trial}/${trials} ===\n`);

  try {
    const result = await evaluateAiWorkflow();

    results.push({
      trial,
      passed: true,

      diagnosis: result.diagnosis,

      toolCalls: result.toolCalls,

      primaryAction: result.primaryAction,

      approvalCount: result.approvalCount,

      executionCount: result.executionCount,

      effect: result.effect,

      automationStatus: result.automationStatus,
    });
  } catch (error) {
    results.push({
      trial,
      passed: false,

      error:
        error instanceof Error
          ? error.message
          : "Unknown workflow evaluation failure.",
    });
  }
}

const successful = results.filter(
  (result): result is Extract<TrialResult, { passed: true }> => result.passed,
);

const failed = results.filter(
  (result): result is Extract<TrialResult, { passed: false }> => !result.passed,
);

const rootCauseCounts = successful.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.diagnosis] = (counts[result.diagnosis] ?? 0) + 1;

    return counts;
  },
  {},
);

const primaryActionCounts = successful.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.primaryAction] = (counts[result.primaryAction] ?? 0) + 1;

    return counts;
  },
  {},
);

const totalToolCalls = successful.reduce(
  (total, result) => total + result.toolCalls,
  0,
);

const averageToolCalls =
  successful.length > 0 ? totalToolCalls / successful.length : 0;

const unexpectedApprovals = successful.filter(
  (result) => result.approvalCount !== 0,
).length;

const incorrectExecutionCounts = successful.filter(
  (result) => result.executionCount !== 1,
).length;

const incorrectEffects = successful.filter(
  (result) => result.effect !== "ORDER_STATE_RECONCILED",
).length;

const incompleteAutomations = successful.filter(
  (result) => result.automationStatus !== "COMPLETED",
).length;

console.log("\n=== Repeated AI workflow evaluation ===\n");

console.table(
  results.map((result) =>
    result.passed
      ? {
          trial: result.trial,

          passed: true,

          diagnosis: result.diagnosis,

          tools: result.toolCalls,

          action: result.primaryAction,

          approvals: result.approvalCount,

          executions: result.executionCount,

          effect: result.effect,

          automation: result.automationStatus,
        }
      : {
          trial: result.trial,

          passed: false,

          diagnosis: "-",

          tools: "-",

          action: "-",

          approvals: "-",

          executions: "-",

          effect: "-",

          automation: result.error,
        },
  ),
);

console.log({
  trials,
  passed: successful.length,
  failed: failed.length,

  passRate: successful.length / trials,

  averageToolCalls,

  rootCauseCounts,

  primaryActionCounts,

  unexpectedApprovals,

  incorrectExecutionCounts,

  incorrectEffects,

  incompleteAutomations,
});

const regressionPassed =
  successful.length === trials &&
  rootCauseCounts.INFRASTRUCTURE === trials &&
  primaryActionCounts.RECONCILE_ORDER_STATE === trials &&
  unexpectedApprovals === 0 &&
  incorrectExecutionCounts === 0 &&
  incorrectEffects === 0 &&
  incompleteAutomations === 0;

if (!regressionPassed) {
  throw new Error(
    "Repeated AI workflow evaluation failed its safety or reliability invariants.",
  );
}

console.log(
  `\n${successful.length}/${trials} repeated AI workflow trials passed`,
);
