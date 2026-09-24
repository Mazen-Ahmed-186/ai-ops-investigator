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

const orderId = "ORD-2001";

console.log("\n=== Confirmed failure → remediation ===\n");

const investigationStore = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId: "RUN-EVAL-CONFIRMED-FAILURE-REMEDIATION",

  store: investigationStore,
});

if (investigation.status !== "COMPLETED") {
  throw new Error(
    `Expected completed investigation; received ${investigation.status}.`,
  );
}

if (investigation.assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${investigation.assessment.diagnosisStatus}.`,
  );
}

if (investigation.assessment.rootCauseCategory !== "FULFILLMENT") {
  throw new Error(
    `Expected FULFILLMENT diagnosis; received ${investigation.assessment.rootCauseCategory}.`,
  );
}

if (investigation.assessment.requiresMoreEvidence) {
  throw new Error(
    "Confirmed fulfillment failure unexpectedly requires more evidence.",
  );
}

console.log("Investigation:", {
  diagnosisStatus: investigation.assessment.diagnosisStatus,

  rootCauseCategory: investigation.assessment.rootCauseCategory,

  confidence: investigation.assessment.confidence,

  toolCalls: investigation.toolCalls,
});

const generateRemediation = createAgenticRemediationGenerator();

const remediation = await generateRemediation({
  orderId,

  investigationRunId: investigation.runId,

  assessment: investigation.assessment,
});

const primaryAction = remediation.recommendation.actions.find(
  (action) => action.disposition === "PRIMARY",
);

if (!primaryAction) {
  throw new Error("Remediation produced no PRIMARY action.");
}

console.log("Remediation:", {
  status: remediation.recommendation.status,

  primaryAction: primaryAction.actionKind,

  supportedBy: primaryAction.supportedByRunbookIds,

  retrievedRunbooks: remediation.retrievedRunbookIds,
});

if (remediation.recommendation.status !== "RECOMMENDATION_READY") {
  throw new Error(
    `Expected RECOMMENDATION_READY; received ${remediation.recommendation.status}.`,
  );
}

if (primaryAction.actionKind !== "CREATE_FULFILLMENT_ATTEMPT") {
  throw new Error(
    `Expected CREATE_FULFILLMENT_ATTEMPT; received ${primaryAction.actionKind}.`,
  );
}

const expectedRunbook = "RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE";

if (!primaryAction.supportedByRunbookIds.includes(expectedRunbook)) {
  throw new Error(`PRIMARY action is not grounded by ${expectedRunbook}.`);
}

if (!remediation.retrievedRunbookIds.includes(expectedRunbook)) {
  throw new Error(`${expectedRunbook} was not retrieved.`);
}

console.log("\nConfirmed failure → remediation passed");
