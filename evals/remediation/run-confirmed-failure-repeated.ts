import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import type { InvestigationStore } from "../../src/investigations/store.js";
import type { InvestigationRunState } from "../../src/investigations/types.js";

class EvalInvestigationStore implements InvestigationStore {
  private readonly runs = new Map<string, InvestigationRunState>();

  async save(run: InvestigationRunState) {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(runId: string) {
    const run = this.runs.get(runId);

    return run ? structuredClone(run) : null;
  }
}

const trials = 5;

type TrialResult = {
  trial: number;
  passed: boolean;
  diagnosis: string;
  action: string;
  runbookGrounded: boolean;
  runbookRetrieved: boolean;
  toolCalls: number;
};

const results: TrialResult[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Confirmed failure remediation trial ${trial}/${trials} ===\n`,
  );

  const store = new EvalInvestigationStore();

  const investigation = await runAgentInvestigation("ORD-2001", {
    runId: `RUN-EVAL-CONFIRMED-FAILURE-REMEDIATION-${trial}`,
    store,
  });

  if (investigation.status !== "COMPLETED") {
    results.push({
      trial,
      passed: false,
      diagnosis: investigation.status,
      action: "-",
      runbookGrounded: false,
      runbookRetrieved: false,
      toolCalls: investigation.toolCalls,
    });

    continue;
  }

  const generator = createAgenticRemediationGenerator();

  const remediation = await generator({
    orderId: "ORD-2001",
    investigationRunId: investigation.runId,
    assessment: investigation.assessment,
  });

  const primary = remediation.recommendation.actions.find(
    (action) => action.disposition === "PRIMARY",
  );

  const expectedRunbook = "RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE";

  const runbookGrounded =
    primary?.supportedByRunbookIds.includes(expectedRunbook) ?? false;

  const runbookRetrieved =
    remediation.retrievedRunbookIds.includes(expectedRunbook);

  const passed =
    investigation.assessment.diagnosisStatus === "DIAGNOSIS_READY" &&
    investigation.assessment.rootCauseCategory === "FULFILLMENT" &&
    investigation.assessment.requiresMoreEvidence === false &&
    remediation.recommendation.status === "RECOMMENDATION_READY" &&
    primary?.actionKind === "CREATE_FULFILLMENT_ATTEMPT" &&
    runbookGrounded &&
    runbookRetrieved;

  results.push({
    trial,
    passed,
    diagnosis: investigation.assessment.rootCauseCategory,
    action: primary?.actionKind ?? "NONE",
    runbookGrounded,
    runbookRetrieved,
    toolCalls: investigation.toolCalls,
  });
}

console.log("\n=== Confirmed failure remediation stability ===\n");

console.table(results);

const passed = results.filter((result) => result.passed).length;

const actionCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.action] = (counts[result.action] ?? 0) + 1;

    return counts;
  },
  {},
);

console.log({
  trials,
  passed,
  failed: trials - passed,
  passRate: passed / trials,
  actionCounts,
});

if (passed !== trials) {
  throw new Error(
    "Confirmed fulfillment failure remediation is not stable across repeated trials.",
  );
}

console.log(
  `\n${passed}/${trials} confirmed failure remediation trials passed`,
);
