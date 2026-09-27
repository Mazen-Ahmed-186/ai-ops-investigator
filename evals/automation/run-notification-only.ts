import type { ActionApproval } from "../../src/actions/approval.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../src/automation/verify-automation-action.js";
import type { InvestigationStore } from "../../src/investigations/store.js";
import type { InvestigationRunState } from "../../src/investigations/types.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../src/remediations/types.js";

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

class EvalApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ActionApproval>();

  async save(approval: ActionApproval) {
    this.approvals.set(approval.id, structuredClone(approval));
  }

  async get(approvalId: string) {
    const approval = this.approvals.get(approvalId);

    return approval ? structuredClone(approval) : null;
  }

  async listByOrderId(orderId: string) {
    return [...this.approvals.values()]
      .filter((approval) => approval.action.orderId === orderId)
      .map((approval) => structuredClone(approval));
  }
}

const orderId = "ORD-4001";

const investigationRunId = "RUN-EVAL-NOTIFICATION-ONLY-AUTOMATION";

const automationRunId = "AUTO-EVAL-NOTIFICATION-ONLY";

const remediationRunId = "REM-EVAL-NOTIFICATION-ONLY";

const expectedRunbook = "RUNBOOK-NOTIFICATION-FAILURE";

console.log("\n=== Notification-only AI → safe action ===\n");

const investigationStore = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId: investigationRunId,
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

if (assessment.rootCauseCategory !== "NOTIFICATION") {
  throw new Error(
    `Expected NOTIFICATION diagnosis; received ${assessment.rootCauseCategory}.`,
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

if (!generated.retrievedRunbookIds.includes(expectedRunbook)) {
  throw new Error(`${expectedRunbook} was not retrieved.`);
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
    `Expected RETRY_NOTIFICATION; received ${primaryAction.actionKind}.`,
  );
}

if (!primaryAction.supportedByRunbookIds.includes(expectedRunbook)) {
  throw new Error(`${expectedRunbook} did not ground RETRY_NOTIFICATION.`);
}

const automationStore = new InMemoryAutomationStore();

const remediationStore = new InMemoryRemediationStore();

const approvalStore = new EvalApprovalStore();

const auditStore = new InMemoryActionExecutionAuditStore();

let automation = createAutomationRun({
  id: automationRunId,
  orderId,
});

automation = transitionAutomationRun(automation, "INVESTIGATING");

automation = {
  ...automation,
  investigationRunId: investigation.runId,
};

automation = transitionAutomationRun(automation, "PLANNING_REMEDIATION");

automation = {
  ...automation,
  remediationRunId,
};

await automationStore.save(automation);

const now = new Date().toISOString();

const remediationRun: RemediationRun = {
  id: remediationRunId,
  orderId,
  automationRunId,
  investigationRunId: investigation.runId,
  status: "COMPLETED",
  recommendation: generated.recommendation,
  retrievedRunbookIds: generated.retrievedRunbookIds,
  startedAt: now,
  updatedAt: now,
  failureReason: null,
};

await remediationStore.save(remediationRun);

const routing = await routeAutomationRemediationAction({
  automationRunId,
  automationStore,
  remediationStore,
  approvalStore,
});

if (routing.status !== "EXECUTION_READY") {
  throw new Error(
    `Expected EXECUTION_READY routing; received ${routing.status}.`,
  );
}

const approvalsAfterRouting = await approvalStore.listByOrderId(orderId);

if (approvalsAfterRouting.length !== 0) {
  throw new Error(
    `RETRY_NOTIFICATION unexpectedly created ${approvalsAfterRouting.length} approval(s).`,
  );
}

const repository = new InMemoryActionExecutionRepository([
  {
    order: {
      id: orderId,
      status: "FULFILLED",
    },

    payments: [
      {
        status: "CAPTURED",
      },
    ],

    fulfillmentAttempts: [
      {
        id: "FUL-4001",
        status: "SUCCEEDED",
      },
    ],

    entitlements: [
      {
        status: "ACTIVE",
      },
    ],

    accountDeliveries: [
      {
        status: "DELIVERED",
      },
    ],

    notifications: [
      {
        id: "NOT-4001",
        status: "FAILED",
      },
    ],

    refunds: [],

    refundAllowedByBusinessPolicy: true,
  },
]);

const execution = await executeAutomationAction({
  automationRunId,
  automationStore,
  remediationStore,
  repository,
  auditStore,
  approvalStore,
});

if (execution.status !== "VERIFYING") {
  throw new Error(
    `Expected VERIFYING after notification retry; received ${execution.status}.`,
  );
}

const executions = await auditStore.listByOrderId(orderId);

if (executions.length !== 1) {
  throw new Error(
    `Expected exactly one action execution; received ${executions.length}.`,
  );
}

const actionExecution = executions[0];

if (!actionExecution) {
  throw new Error("Notification retry execution audit was not found.");
}

if (actionExecution.status !== "EXECUTED") {
  throw new Error(
    `Expected EXECUTED audit status; received ${actionExecution.status}.`,
  );
}

if (actionExecution.action.kind !== "RETRY_NOTIFICATION") {
  throw new Error(
    `Expected RETRY_NOTIFICATION execution; received ${actionExecution.action.kind}.`,
  );
}

if (actionExecution.approvalId !== null) {
  throw new Error(
    `Notification retry unexpectedly used approval ${actionExecution.approvalId}.`,
  );
}

if (actionExecution.effect?.kind !== "NOTIFICATION_RETRY_CREATED") {
  throw new Error(
    `Expected NOTIFICATION_RETRY_CREATED effect; received ${actionExecution.effect?.kind ?? "null"}.`,
  );
}

if (actionExecution.effect.notificationStatus !== "PENDING") {
  throw new Error(
    `Expected new notification status PENDING; received ${actionExecution.effect.notificationStatus}.`,
  );
}

if (actionExecution.effect.notificationId === "NOT-4001") {
  throw new Error(
    "Notification retry replaced the historical FAILED notification instead of creating a new attempt.",
  );
}

const verification = await verifyAutomationAction({
  automationRunId,
  automationStore,
  remediationStore,
  repository,
  auditStore,
});

if (verification.status !== "COMPLETED") {
  throw new Error(
    `Expected COMPLETED verification; received ${verification.status}.`,
  );
}

const finalAutomation = await automationStore.get(automationRunId);

if (!finalAutomation) {
  throw new Error(
    `Automation ${automationRunId} disappeared after verification.`,
  );
}

if (finalAutomation.status !== "COMPLETED") {
  throw new Error(
    `Expected automation COMPLETED; received ${finalAutomation.status}.`,
  );
}

if (finalAutomation.approvalId !== null) {
  throw new Error(
    `Completed notification workflow unexpectedly contains approval ${finalAutomation.approvalId}.`,
  );
}

if (finalAutomation.actionExecutionId !== actionExecution.id) {
  throw new Error(
    "Automation execution correlation does not match the notification retry audit.",
  );
}

const finalApprovals = await approvalStore.listByOrderId(orderId);

if (finalApprovals.length !== 0) {
  throw new Error(`Expected zero approvals; found ${finalApprovals.length}.`);
}

console.log({
  investigation: investigation.status,

  diagnosis: assessment.rootCauseCategory,

  remediation: generated.recommendation.status,

  primaryAction: primaryAction.actionKind,

  routing: routing.status,

  approvals: finalApprovals.length,

  execution: actionExecution.status,

  executionId: actionExecution.id,

  effect: actionExecution.effect.kind,

  notificationId: actionExecution.effect.notificationId,

  notificationStatus: actionExecution.effect.notificationStatus,

  verification: verification.status,

  automation: finalAutomation.status,
});

console.log("\nNotification-only AI → safe action passed");
