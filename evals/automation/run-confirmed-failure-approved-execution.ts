import type { ActionApproval } from "../../src/actions/approval.js";
import { decideApproval } from "../../src/actions/approval-lifecycle.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { resumeAutomationAfterApproval } from "../../src/automation/resume-automation-after-approval.js";
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

const orderId = "ORD-2001";

const automationRunId = "AUTO-EVAL-CONFIRMED-FAILURE-EXECUTION";

const investigationRunId = "RUN-EVAL-CONFIRMED-FAILURE-EXECUTION";

const remediationRunId = "REM-AUTO-EVAL-CONFIRMED-FAILURE-EXECUTION";

console.log("\n=== Confirmed failure → approved execution ===\n");

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

const generateRemediation = createAgenticRemediationGenerator();

const generated = await generateRemediation({
  orderId,

  investigationRunId: investigation.runId,

  assessment: investigation.assessment,
});

if (generated.recommendation.status !== "RECOMMENDATION_READY") {
  throw new Error(
    `Expected RECOMMENDATION_READY; received ${generated.recommendation.status}.`,
  );
}

const primary = generated.recommendation.actions.find(
  (action) => action.disposition === "PRIMARY",
);

if (!primary) {
  throw new Error("Remediation produced no PRIMARY action.");
}

if (primary.actionKind !== "CREATE_FULFILLMENT_ATTEMPT") {
  throw new Error(
    `Expected CREATE_FULFILLMENT_ATTEMPT; received ${primary.actionKind}.`,
  );
}

const expectedRunbook = "RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE";

if (!primary.supportedByRunbookIds.includes(expectedRunbook)) {
  throw new Error(`PRIMARY action is not grounded by ${expectedRunbook}.`);
}

if (!generated.retrievedRunbookIds.includes(expectedRunbook)) {
  throw new Error(`${expectedRunbook} was not retrieved.`);
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

if (routing.status !== "WAITING_FOR_APPROVAL") {
  throw new Error(`Expected WAITING_FOR_APPROVAL; received ${routing.status}.`);
}

const pendingApproval = await approvalStore.get(routing.approvalId);

if (!pendingApproval) {
  throw new Error(`Approval ${routing.approvalId} was not persisted.`);
}

if (pendingApproval.status !== "PENDING") {
  throw new Error(
    `Expected PENDING approval; received ${pendingApproval.status}.`,
  );
}

if (pendingApproval.action.kind !== "CREATE_FULFILLMENT_ATTEMPT") {
  throw new Error(`Unexpected approval action ${pendingApproval.action.kind}.`);
}

if (pendingApproval.action.orderId !== orderId) {
  throw new Error("Approval is bound to the wrong order.");
}

if (
  pendingApproval.action.reason !==
  "Grounded remediation requires creating a new fulfillment attempt."
) {
  throw new Error(
    "Approval is not bound to the expected grounded action reason.",
  );
}

const executionsBeforeApproval = await auditStore.listByOrderId(orderId);

if (executionsBeforeApproval.length !== 0) {
  throw new Error(
    `Expected zero executions before approval; found ${executionsBeforeApproval.length}.`,
  );
}

const approved = decideApproval({
  approval: pendingApproval,

  decision: "APPROVE",

  decidedBy: "automation-eval-reviewer",
});

await approvalStore.save(approved);

const savedApproved = await approvalStore.get(pendingApproval.id);

if (!savedApproved) {
  throw new Error(`Approval ${pendingApproval.id} disappeared after approval.`);
}

if (savedApproved.status !== "APPROVED") {
  throw new Error(
    `Expected APPROVED approval; received ${savedApproved.status}.`,
  );
}

const resumed = await resumeAutomationAfterApproval({
  automationRunId,

  automationStore,

  remediationStore,

  approvalStore,
});

if (resumed.status !== "EXECUTION_READY") {
  throw new Error(
    `Expected EXECUTION_READY after approval; received ${resumed.status}.`,
  );
}

const resumedAutomation = await automationStore.get(automationRunId);

if (!resumedAutomation) {
  throw new Error(
    `Automation ${automationRunId} disappeared after approval resume.`,
  );
}

if (resumedAutomation.status !== "EXECUTING") {
  throw new Error(
    `Expected durable EXECUTING state; received ${resumedAutomation.status}.`,
  );
}

if (resumedAutomation.approvalId !== savedApproved.id) {
  throw new Error("Automation lost approval correlation after resume.");
}

if (resumedAutomation.actionExecutionId !== null) {
  throw new Error(
    "Action execution exists before the explicit execution step.",
  );
}

const executionsAfterApproval = await auditStore.listByOrderId(orderId);

if (executionsAfterApproval.length !== 0) {
  throw new Error(
    `Expected zero executions immediately after approval; found ${executionsAfterApproval.length}.`,
  );
}

const repository = new InMemoryActionExecutionRepository([
  {
    order: {
      id: orderId,
      status: "PROCESSING",
    },

    payments: [
      {
        status: "CAPTURED",
      },
    ],

    fulfillmentAttempts: [
      {
        id: "FUL-ORD-2001-FAILED",
        status: "CONFIRMED_FAILED",
      },
    ],

    entitlements: [],

    accountDeliveries: [],

    notifications: [],

    refunds: [],

    refundAllowedByBusinessPolicy: true,
  },
]);

const existingAttemptId = "FUL-ORD-2001-FAILED";

const existingAttempt = await repository.getFulfillmentAttempt(
  orderId,
  existingAttemptId,
);

if (!existingAttempt) {
  throw new Error(
    `Existing fulfillment attempt ${existingAttemptId} was not found before execution.`,
  );
}

if (existingAttempt.status !== "CONFIRMED_FAILED") {
  throw new Error(
    `Expected existing attempt ${existingAttemptId} to be CONFIRMED_FAILED; received ${existingAttempt.status}.`,
  );
}

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
    `Expected VERIFYING after execution; received ${execution.status}.`,
  );
}

const automationAfterExecution = await automationStore.get(automationRunId);

if (!automationAfterExecution) {
  throw new Error(`Automation ${automationRunId} disappeared after execution.`);
}

if (automationAfterExecution.status !== "VERIFYING") {
  throw new Error(
    `Expected durable VERIFYING state; received ${automationAfterExecution.status}.`,
  );
}

if (!automationAfterExecution.actionExecutionId) {
  throw new Error("Automation did not persist its action execution ID.");
}

const consumedApproval = await approvalStore.get(savedApproved.id);

if (!consumedApproval) {
  throw new Error(`Approval ${savedApproved.id} disappeared after execution.`);
}

if (consumedApproval.status !== "CONSUMED") {
  throw new Error(
    `Expected CONSUMED approval; received ${consumedApproval.status}.`,
  );
}

const executions = await auditStore.listByOrderId(orderId);

if (executions.length !== 1) {
  throw new Error(
    `Expected exactly one action execution; found ${executions.length}.`,
  );
}

const executedAudit = executions[0];

if (!executedAudit) {
  throw new Error("Executed action audit was not found.");
}

if (executedAudit.id !== automationAfterExecution.actionExecutionId) {
  throw new Error(
    "Automation is not correlated with the exact action execution.",
  );
}

if (executedAudit.status !== "EXECUTED") {
  throw new Error(`Expected EXECUTED audit; received ${executedAudit.status}.`);
}

if (executedAudit.action.kind !== "CREATE_FULFILLMENT_ATTEMPT") {
  throw new Error(`Unexpected executed action ${executedAudit.action.kind}.`);
}

if (executedAudit.action.orderId !== orderId) {
  throw new Error("Executed action is bound to the wrong order.");
}

if (executedAudit.approvalId !== consumedApproval.id) {
  throw new Error("Execution is not correlated with the consumed approval.");
}

if (executedAudit.effect?.kind !== "FULFILLMENT_ATTEMPT_CREATED") {
  throw new Error(
    "Execution did not produce a FULFILLMENT_ATTEMPT_CREATED effect.",
  );
}

const createdAttemptId = executedAudit.effect.attemptId;

if (executedAudit.effect.attemptStatus !== "PENDING") {
  throw new Error(
    `Expected created attempt to start PENDING; received ${executedAudit.effect.attemptStatus}.`,
  );
}

const createdAttempt = await repository.getFulfillmentAttempt(
  orderId,
  createdAttemptId,
);

if (!createdAttempt) {
  throw new Error(
    `Created fulfillment attempt ${createdAttemptId} is missing from authoritative state.`,
  );
}

if (createdAttempt.status !== "PENDING") {
  throw new Error(
    `Expected authoritative attempt ${createdAttemptId} to be PENDING; received ${createdAttempt.status}.`,
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
    `Expected completed verification; received ${verification.status}.`,
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
    `Expected COMPLETED automation; received ${finalAutomation.status}.`,
  );
}

if (finalAutomation.actionExecutionId !== executedAudit.id) {
  throw new Error(
    "Final automation is not correlated with the exact action execution.",
  );
}

if (finalAutomation.approvalId !== consumedApproval.id) {
  throw new Error(
    "Final automation is not correlated with the consumed approval.",
  );
}

const finalExecutions = await auditStore.listByOrderId(orderId);

if (finalExecutions.length !== 1) {
  throw new Error(
    `Expected exactly one execution after verification; found ${finalExecutions.length}.`,
  );
}

console.log({
  diagnosis: investigation.assessment.rootCauseCategory,

  primaryAction: primary.actionKind,

  routing: routing.status,

  approval: consumedApproval.status,

  execution: executedAudit.status,

  effect: executedAudit.effect.kind,

  createdAttemptId,

  createdAttemptStatus: createdAttempt.status,

  executionCount: finalExecutions.length,

  verification: verification.status,

  automation: finalAutomation.status,
});

console.log("\nConfirmed failure approved execution passed");
