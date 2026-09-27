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

const orderId = "ORD-4001";
const runId = "RUN-EVAL-NOTIFICATION-ONLY-REMEDIATION";

const expectedRunbook = "RUNBOOK-NOTIFICATION-FAILURE";

console.log("\n=== Notification-only remediation ===\n");

const investigationStore = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId,
  store: investigationStore,
});

if (investigation.status !== "COMPLETED") {
  throw new Error(
    `Expected COMPLETED investigation; received ${investigation.status}.`,
  );
}

const assessment = investigation.assessment;

if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
  );
}

if (assessment.rootCauseCategory !== "NOTIFICATION") {
  throw new Error(
    `Expected NOTIFICATION diagnosis; received ${assessment.rootCauseCategory}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error(
    "Notification failure is already established by the incident evidence.",
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

const notificationRunbookRetrieved =
  generated.retrievedRunbookIds.includes(expectedRunbook);

if (!notificationRunbookRetrieved) {
  throw new Error(`${expectedRunbook} was not retrieved.`);
}

const executableActions = generated.recommendation.actions.filter(
  (action) => action.actionKind !== null,
);

if (executableActions.length !== 1) {
  throw new Error(
    `Expected exactly one executable remediation action; received ${executableActions.length}.`,
  );
}

const primaryActions = generated.recommendation.actions.filter(
  (action) => action.disposition === "PRIMARY",
);

if (primaryActions.length !== 1) {
  throw new Error(
    `Expected exactly one PRIMARY action; received ${primaryActions.length}.`,
  );
}

const primaryAction = primaryActions[0];

if (!primaryAction) {
  throw new Error("Primary remediation action was not found.");
}

if (primaryAction.actionKind !== "RETRY_NOTIFICATION") {
  throw new Error(
    `Expected RETRY_NOTIFICATION as the primary action; received ${primaryAction.actionKind}.`,
  );
}

if (!primaryAction.supportedByRunbookIds.includes(expectedRunbook)) {
  throw new Error(
    `${expectedRunbook} did not ground the primary notification retry action.`,
  );
}

const unrelatedExecutableActions = executableActions.filter(
  (action) => action.actionKind !== "RETRY_NOTIFICATION",
);

if (unrelatedExecutableActions.length > 0) {
  throw new Error(
    `Notification-only remediation produced unrelated executable actions: ${unrelatedExecutableActions
      .map((action) => action.actionKind)
      .join(", ")}.`,
  );
}

const createsFulfillment = generated.recommendation.actions.some(
  (action) => action.actionKind === "CREATE_FULFILLMENT_ATTEMPT",
);

const reconcilesOrder = generated.recommendation.actions.some(
  (action) => action.actionKind === "RECONCILE_ORDER_STATE",
);

const issuesRefund = generated.recommendation.actions.some(
  (action) => action.actionKind === "ISSUE_REFUND",
);

const cancelsOrder = generated.recommendation.actions.some(
  (action) => action.actionKind === "CANCEL_ORDER",
);

if (createsFulfillment || reconcilesOrder || issuesRefund || cancelsOrder) {
  throw new Error(
    "Notification-only remediation attempted to mutate an unrelated business workflow.",
  );
}

const remediationText = [
  generated.recommendation.summary,
  ...generated.recommendation.actions.map((action) => action.instruction),
]
  .join(" ")
  .toLowerCase();

const recognizesDeliverySucceeded =
  remediationText.includes("delivery") ||
  remediationText.includes("delivered") ||
  remediationText.includes("fulfilled");

if (!recognizesDeliverySucceeded) {
  throw new Error(
    "Remediation did not preserve the fact that fulfillment/delivery had already succeeded.",
  );
}

console.log({
  diagnosis: assessment.rootCauseCategory,

  recommendationStatus: generated.recommendation.status,

  notificationRunbookRetrieved,

  executableActions: executableActions.length,

  primaryAction: primaryAction.actionKind,

  supportedBy: primaryAction.supportedByRunbookIds,

  createsFulfillment,

  reconcilesOrder,

  issuesRefund,

  cancelsOrder,

  recognizesDeliverySucceeded,

  investigationToolCalls: investigation.toolCalls,
});

console.log("\nRecommendation:");

console.dir(generated.recommendation, {
  depth: null,
});

console.log("\nRetrieved runbooks:", generated.retrievedRunbookIds);

console.log("\nNotification-only remediation passed");
