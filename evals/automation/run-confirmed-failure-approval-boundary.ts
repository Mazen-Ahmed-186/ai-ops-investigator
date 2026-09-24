import type { ActionApproval } from "../../src/actions/approval.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
import type { InvestigationStore } from "../../src/investigations/store.js";
import type { InvestigationRunState } from "../../src/investigations/types.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../src/remediations/types.js";
import { decideApproval } from "../../src/actions/approval-lifecycle.js";
import { resumeAutomationAfterApproval } from "../../src/automation/resume-automation-after-approval.js";

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
const automationRunId = "AUTO-EVAL-CONFIRMED-FAILURE";
const remediationRunId = "REM-AUTO-EVAL-CONFIRMED-FAILURE";

console.log("\n=== Confirmed failure → approval boundary ===\n");

const investigationStore = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId: "RUN-EVAL-CONFIRMED-FAILURE-APPROVAL",

  store: investigationStore,
});

if (investigation.status !== "COMPLETED") {
  throw new Error(
    `Expected completed investigation; received ${investigation.status}.`,
  );
}

if (
  investigation.assessment.diagnosisStatus !== "DIAGNOSIS_READY" ||
  investigation.assessment.rootCauseCategory !== "FULFILLMENT" ||
  investigation.assessment.requiresMoreEvidence
) {
  throw new Error(
    "Confirmed failure investigation did not produce the expected actionable diagnosis.",
  );
}

const generateRemediation = createAgenticRemediationGenerator();

const generated = await generateRemediation({
  orderId,

  investigationRunId: investigation.runId,

  assessment: investigation.assessment,
});

const primary = generated.recommendation.actions.find(
  (action) => action.disposition === "PRIMARY",
);

if (primary?.actionKind !== "CREATE_FULFILLMENT_ATTEMPT") {
  throw new Error(
    `Expected CREATE_FULFILLMENT_ATTEMPT; received ${primary?.actionKind ?? "NONE"}.`,
  );
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

const expectedAction = {
  kind: "CREATE_FULFILLMENT_ATTEMPT",
  orderId,
  reason: "Grounded remediation requires creating a new fulfillment attempt.",
} as const;

if (
  pendingApproval.action.kind !== expectedAction.kind ||
  pendingApproval.action.orderId !== expectedAction.orderId ||
  pendingApproval.action.reason !== expectedAction.reason
) {
  throw new Error(
    "Approval does not match the exact grounded action snapshot.",
  );
}

const persistedAutomation = await automationStore.get(automationRunId);

if (!persistedAutomation) {
  throw new Error(`Automation ${automationRunId} disappeared.`);
}

if (persistedAutomation.status !== "WAITING_FOR_APPROVAL") {
  throw new Error(
    `Expected durable WAITING_FOR_APPROVAL state; received ${persistedAutomation.status}.`,
  );
}

if (persistedAutomation.approvalId !== pendingApproval.id) {
  throw new Error("Automation is not correlated with the pending approval.");
}

if (persistedAutomation.actionExecutionId !== null) {
  throw new Error("Action execution exists before human approval.");
}

const approvals = await approvalStore.listByOrderId(orderId);

if (approvals.length !== 1) {
  throw new Error(`Expected exactly one approval; found ${approvals.length}.`);
}

const executions = await auditStore.listByOrderId(orderId);

if (executions.length !== 0) {
  throw new Error(
    `Expected zero action executions before approval; found ${executions.length}.`,
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
    `Expected zero action executions immediately after approval; found ${executionsAfterApproval.length}.`,
  );
}

console.log({
  investigation: investigation.assessment.rootCauseCategory,

  primaryAction: primary.actionKind,

  routing: routing.status,

  approvalBeforeDecision: pendingApproval.status,

  approvalAfterDecision: savedApproved.status,

  resume: resumed.status,

  automationStatus: resumedAutomation.status,

  actionExecutionId: resumedAutomation.actionExecutionId,

  actionExecutions: executionsAfterApproval.length,
});

console.log("\nConfirmed failure approval + resume boundary passed");
