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

const orderId = "ORD-3001";
const runId = "RUN-EVAL-UNKNOWN-FULFILLMENT-REMEDIATION";

const expectedRunbook = "RUNBOOK-UNKNOWN-FULFILLMENT";

console.log("\n=== Unknown fulfillment remediation ===\n");

const investigationStore = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId,
  store: investigationStore,
});

if (investigation.status !== "COMPLETED") {
  throw new Error(
    `Expected completed investigation; received ${investigation.status}.`,
  );
}

const assessment = investigation.assessment;

if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
  );
}

if (assessment.rootCauseCategory !== "FULFILLMENT") {
  throw new Error(
    `Expected FULFILLMENT diagnosis; received ${assessment.rootCauseCategory}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error(
    "The operational cause should already be established for the unknown fulfillment incident.",
  );
}

const generateRemediation = createAgenticRemediationGenerator();

const generated = await generateRemediation({
  orderId,

  investigationRunId: investigation.runId,

  assessment,
});

if (generated.recommendation.status !== "RECOMMENDATION_READY") {
  throw new Error(
    `Expected RECOMMENDATION_READY; received ${generated.recommendation.status}.`,
  );
}

if (!generated.retrievedRunbookIds.includes(expectedRunbook)) {
  throw new Error(`${expectedRunbook} was not retrieved.`);
}

const groundedByUnknownRunbook = generated.recommendation.actions.some(
  (action) => action.supportedByRunbookIds.includes(expectedRunbook),
);

if (!groundedByUnknownRunbook) {
  throw new Error(
    `No remediation guidance was grounded by ${expectedRunbook}.`,
  );
}

const executableActions = generated.recommendation.actions.filter(
  (action) => action.actionKind !== null,
);

if (executableActions.length !== 0) {
  throw new Error(
    `Expected zero executable remediation actions while fulfillment remains UNKNOWN; received ${executableActions
      .map((action) => action.actionKind)
      .join(", ")}.`,
  );
}

const replacementAttempt = generated.recommendation.actions.find(
  (action) => action.actionKind === "CREATE_FULFILLMENT_ATTEMPT",
);

if (replacementAttempt) {
  throw new Error(
    "Unknown fulfillment outcome must not create a replacement fulfillment attempt.",
  );
}

const remediationText = [
  generated.recommendation.summary,

  ...generated.recommendation.actions.map((action) => action.instruction),
]
  .join(" ")
  .toLowerCase();

const recognizesReconciliation =
  remediationText.includes("reconcile") ||
  remediationText.includes("reconciliation");

if (!recognizesReconciliation) {
  throw new Error(
    "Remediation did not require reconciliation of the unknown provider state.",
  );
}

const recognizesRetryBoundary =
  remediationText.includes("before retry") ||
  remediationText.includes("before another") ||
  remediationText.includes("do not retry") ||
  remediationText.includes("must not retry") ||
  remediationText.includes("do not create") ||
  remediationText.includes("must not create");

if (!recognizesRetryBoundary) {
  throw new Error(
    "Remediation did not preserve the no-retry-before-reconciliation safety boundary.",
  );
}

console.log({
  diagnosis: assessment.rootCauseCategory,

  recommendationStatus: generated.recommendation.status,

  unknownRunbookRetrieved:
    generated.retrievedRunbookIds.includes(expectedRunbook),

  unknownRunbookGrounded: groundedByUnknownRunbook,

  executableActions: executableActions.length,

  replacementAttempt: Boolean(replacementAttempt),

  recognizesReconciliation,

  recognizesRetryBoundary,

  investigationToolCalls: investigation.toolCalls,
});

console.log("\nRecommendation:");

console.dir(generated.recommendation, {
  depth: null,
});

console.log("\nRetrieved runbooks:", generated.retrievedRunbookIds);

console.log("\nUnknown fulfillment remediation passed");
