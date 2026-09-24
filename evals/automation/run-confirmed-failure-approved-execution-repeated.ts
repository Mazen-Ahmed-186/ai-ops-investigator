import {
  evaluateConfirmedFailureApprovedExecution,
  type ConfirmedFailureApprovedExecutionEvaluation,
} from "./evaluate-confirmed-failure-approved-execution.js";

const trials = 5;

const results: ConfirmedFailureApprovedExecutionEvaluation[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(`\n=== Approved execution trial ${trial}/${trials} ===\n`);

  const result = await evaluateConfirmedFailureApprovedExecution(trial);

  results.push(result);

  console.log({
    trial: result.trial,

    passed: result.passed,

    safetyViolation: result.safetyViolation,

    diagnosis: result.rootCauseCategory,

    primaryAction: result.primaryAction,

    approval: result.approvalStatus,

    execution: result.executionStatus,

    effect: result.effect,

    createdAttempt: result.createdAttemptStatus,

    executions: result.executionCount,

    verification: result.verificationStatus,

    automation: result.automationStatus,

    toolCalls: result.toolCalls,
  });

  if (result.failure) {
    console.error("Failure:", result.failure);
  }
}

console.log("\n=== Approved execution reliability ===\n");

console.table(
  results.map((result) => ({
    trial: result.trial,

    passed: result.passed,

    safetyViolation: result.safetyViolation,

    diagnosis: result.rootCauseCategory,

    action: result.primaryAction,

    approval: result.approvalStatus,

    executions: result.executionCount,

    effect: result.effect,

    attempt: result.createdAttemptStatus,

    verification: result.verificationStatus,

    automation: result.automationStatus,

    toolCalls: result.toolCalls,
  })),
);

const passed = results.filter((result) => result.passed).length;

const safetyViolations = results.filter(
  (result) => result.safetyViolation,
).length;

const diagnosisCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.rootCauseCategory] =
      (counts[result.rootCauseCategory] ?? 0) + 1;

    return counts;
  },
  {},
);

const actionCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.primaryAction] = (counts[result.primaryAction] ?? 0) + 1;

    return counts;
  },
  {},
);

const approvalCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.approvalStatus] = (counts[result.approvalStatus] ?? 0) + 1;

    return counts;
  },
  {},
);

const effectCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.effect] = (counts[result.effect] ?? 0) + 1;

    return counts;
  },
  {},
);

const averageToolCalls =
  results.reduce((total, result) => total + result.toolCalls, 0) / trials;

console.log({
  trials,

  passed,

  failed: trials - passed,

  taskPassRate: passed / trials,

  safetyViolations,

  safetyViolationRate: safetyViolations / trials,

  averageToolCalls,

  diagnosisCounts,

  actionCounts,

  approvalCounts,

  effectCounts,
});

if (safetyViolations > 0) {
  throw new Error(
    `${safetyViolations} safety violation(s) occurred during repeated approved execution evaluation.`,
  );
}

if (passed !== trials) {
  throw new Error(
    `${trials - passed} approved execution trial(s) failed without violating the safety boundary.`,
  );
}

console.log(
  `\n${passed}/${trials} approved execution trials passed with 0 safety violations`,
);
