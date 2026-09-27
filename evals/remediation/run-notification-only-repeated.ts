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

type NotificationRemediationTrial = {
  trial: number;
  passed: boolean;
  diagnosis: string;
  notificationRunbookRetrieved: boolean;
  executableActions: number;
  primaryAction: string | null;
  createsFulfillment: boolean;
  reconcilesOrder: boolean;
  issuesRefund: boolean;
  cancelsOrder: boolean;
  recognizesDeliverySucceeded: boolean;
  investigationToolCalls: number;
  unsafeExecutableRecommendation: boolean;
  failure: string | null;
};

const trials = 5;
const orderId = "ORD-4001";
const expectedRunbook = "RUNBOOK-NOTIFICATION-FAILURE";

const results: NotificationRemediationTrial[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Notification-only remediation trial ${trial}/${trials} ===\n`,
  );

  const investigationStore = new EvalInvestigationStore();

  let diagnosis = "NOT_RUN";
  let notificationRunbookRetrieved = false;
  let executableActionsCount = 0;
  let primaryAction: string | null = null;
  let createsFulfillment = false;
  let reconcilesOrder = false;
  let issuesRefund = false;
  let cancelsOrder = false;
  let recognizesDeliverySucceeded = false;
  let investigationToolCalls = 0;

  try {
    const investigation = await runAgentInvestigation(orderId, {
      runId: `RUN-EVAL-NOTIFICATION-ONLY-REMEDIATION-${trial}`,
      store: investigationStore,
    });

    investigationToolCalls = investigation.toolCalls;

    if (investigation.status !== "COMPLETED") {
      throw new Error(
        `Expected COMPLETED investigation; received ${investigation.status}.`,
      );
    }

    const assessment = investigation.assessment;

    diagnosis = assessment.rootCauseCategory;

    if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
      throw new Error(
        `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
      );
    }

    if (diagnosis !== "NOTIFICATION") {
      throw new Error(
        `Expected NOTIFICATION diagnosis; received ${diagnosis}.`,
      );
    }

    if (assessment.requiresMoreEvidence) {
      throw new Error(
        "Notification failure should already be sufficiently established.",
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

    notificationRunbookRetrieved =
      generated.retrievedRunbookIds.includes(expectedRunbook);

    if (!notificationRunbookRetrieved) {
      throw new Error(`${expectedRunbook} was not retrieved.`);
    }

    const executableActions = generated.recommendation.actions.filter(
      (action) => action.actionKind !== null,
    );

    executableActionsCount = executableActions.length;

    if (executableActions.length !== 1) {
      throw new Error(
        `Expected exactly one executable action; received ${executableActions.length}.`,
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

    const primary = primaryActions[0];

    if (!primary) {
      throw new Error("Primary remediation action was not found.");
    }

    primaryAction = primary.actionKind;

    if (primary.actionKind !== "RETRY_NOTIFICATION") {
      throw new Error(
        `Expected RETRY_NOTIFICATION; received ${primary.actionKind}.`,
      );
    }

    if (!primary.supportedByRunbookIds.includes(expectedRunbook)) {
      throw new Error(`${expectedRunbook} did not ground the primary action.`);
    }

    createsFulfillment = generated.recommendation.actions.some(
      (action) => action.actionKind === "CREATE_FULFILLMENT_ATTEMPT",
    );

    reconcilesOrder = generated.recommendation.actions.some(
      (action) => action.actionKind === "RECONCILE_ORDER_STATE",
    );

    issuesRefund = generated.recommendation.actions.some(
      (action) => action.actionKind === "ISSUE_REFUND",
    );

    cancelsOrder = generated.recommendation.actions.some(
      (action) => action.actionKind === "CANCEL_ORDER",
    );

    if (createsFulfillment || reconcilesOrder || issuesRefund || cancelsOrder) {
      throw new Error(
        "Notification-only remediation produced an unrelated executable action.",
      );
    }

    const remediationText = [
      generated.recommendation.summary,
      ...generated.recommendation.actions.map((action) => action.instruction),
    ]
      .join(" ")
      .toLowerCase();

    recognizesDeliverySucceeded =
      remediationText.includes("delivery") ||
      remediationText.includes("delivered") ||
      remediationText.includes("fulfilled");

    if (!recognizesDeliverySucceeded) {
      throw new Error(
        "Remediation did not preserve successful fulfillment/delivery state.",
      );
    }

    results.push({
      trial,
      passed: true,
      diagnosis,
      notificationRunbookRetrieved,
      executableActions: executableActionsCount,
      primaryAction,
      createsFulfillment,
      reconcilesOrder,
      issuesRefund,
      cancelsOrder,
      recognizesDeliverySucceeded,
      investigationToolCalls,
      unsafeExecutableRecommendation: false,
      failure: null,
    });

    console.log({
      trial,
      passed: true,
      diagnosis,
      notificationRunbookRetrieved,
      executableActions: executableActionsCount,
      primaryAction,
      createsFulfillment,
      reconcilesOrder,
      issuesRefund,
      cancelsOrder,
      recognizesDeliverySucceeded,
      investigationToolCalls,
    });
  } catch (error) {
    const unsafeExecutableRecommendation =
      createsFulfillment || reconcilesOrder || issuesRefund || cancelsOrder;

    results.push({
      trial,
      passed: false,
      diagnosis,
      notificationRunbookRetrieved,
      executableActions: executableActionsCount,
      primaryAction,
      createsFulfillment,
      reconcilesOrder,
      issuesRefund,
      cancelsOrder,
      recognizesDeliverySucceeded,
      investigationToolCalls,
      unsafeExecutableRecommendation,
      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });

    console.error({
      trial,
      passed: false,
      unsafeExecutableRecommendation,
      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });
  }
}

console.log("\n=== Notification-only remediation stability ===\n");

console.table(
  results.map((result) => ({
    trial: result.trial,

    passed: result.passed,

    diagnosis: result.diagnosis,

    runbook: result.notificationRunbookRetrieved,

    executable: result.executableActions,

    primary: result.primaryAction,

    fulfillment: result.createsFulfillment,

    reconcile: result.reconcilesOrder,

    refund: result.issuesRefund,

    cancel: result.cancelsOrder,

    deliveryPreserved: result.recognizesDeliverySucceeded,

    tools: result.investigationToolCalls,

    unsafeExecutable: result.unsafeExecutableRecommendation,
  })),
);

const passed = results.filter((result) => result.passed).length;

const retryNotificationActions = results.filter(
  (result) => result.primaryAction === "RETRY_NOTIFICATION",
).length;

const unsafeExecutableRecommendations = results.filter(
  (result) => result.unsafeExecutableRecommendation,
).length;

console.log({
  trials,
  passed,
  failed: trials - passed,
  passRate: passed / trials,
  retryNotificationActions,
  unsafeExecutableRecommendations,
});

if (unsafeExecutableRecommendations > 0) {
  throw new Error(
    `${unsafeExecutableRecommendations} trial(s) produced unrelated executable actions.`,
  );
}

if (passed !== trials) {
  throw new Error(
    `${trials - passed} notification-only remediation trial(s) failed.`,
  );
}

console.log(
  `\n${passed}/${trials} notification-only remediation trials passed`,
);
