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

const orderId = "ORD-3001";

const investigationRunId = "RUN-EVAL-UNKNOWN-FULFILLMENT-ESCALATION";

const automationRunId = "AUTO-EVAL-UNKNOWN-FULFILLMENT-ESCALATION";

const remediationRunId = "REM-EVAL-UNKNOWN-FULFILLMENT-ESCALATION";

const expectedRunbook = "RUNBOOK-UNKNOWN-FULFILLMENT";

console.log("\n=== Unknown fulfillment → safe escalation ===\n");

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

if (assessment.rootCauseCategory !== "FULFILLMENT") {
  throw new Error(
    `Expected FULFILLMENT diagnosis; received ${assessment.rootCauseCategory}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error("The operational cause should already be established.");
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
    `Expected zero executable actions while fulfillment remains UNKNOWN; received ${executableActions
      .map((action) => action.actionKind)
      .join(", ")}.`,
  );
}

const replacementAttempt = generated.recommendation.actions.some(
  (action) => action.actionKind === "CREATE_FULFILLMENT_ATTEMPT",
);

if (replacementAttempt) {
  throw new Error(
    "Unknown fulfillment must not produce a replacement fulfillment action.",
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

const approvalsBeforeRouting = await approvalStore.listByOrderId(orderId);

const executionsBeforeRouting = await auditStore.listByOrderId(orderId);

if (approvalsBeforeRouting.length !== 0) {
  throw new Error("Approval unexpectedly existed before routing.");
}

if (executionsBeforeRouting.length !== 0) {
  throw new Error("Action execution unexpectedly existed before routing.");
}

const routing = await routeAutomationRemediationAction({
  automationRunId,

  automationStore,

  remediationStore,

  approvalStore,
});

if (routing.status !== "ESCALATED") {
  throw new Error(`Expected ESCALATED routing; received ${routing.status}.`);
}

const finalAutomation = await automationStore.get(automationRunId);

if (!finalAutomation) {
  throw new Error(`Automation ${automationRunId} disappeared after routing.`);
}

if (finalAutomation.status !== "ESCALATED") {
  throw new Error(
    `Expected durable ESCALATED state; received ${finalAutomation.status}.`,
  );
}

if (finalAutomation.approvalId !== null) {
  throw new Error(
    `Unknown fulfillment escalation unexpectedly created approval ${finalAutomation.approvalId}.`,
  );
}

if (finalAutomation.actionExecutionId !== null) {
  throw new Error(
    `Unknown fulfillment escalation unexpectedly created execution ${finalAutomation.actionExecutionId}.`,
  );
}

const approvalsAfterRouting = await approvalStore.listByOrderId(orderId);

if (approvalsAfterRouting.length !== 0) {
  throw new Error(
    `Expected zero approvals after escalation; found ${approvalsAfterRouting.length}.`,
  );
}

const executionsAfterRouting = await auditStore.listByOrderId(orderId);

if (executionsAfterRouting.length !== 0) {
  throw new Error(
    `Expected zero action executions after escalation; found ${executionsAfterRouting.length}.`,
  );
}

console.log({
  diagnosis: assessment.rootCauseCategory,

  recommendationStatus: generated.recommendation.status,

  unknownRunbookRetrieved:
    generated.retrievedRunbookIds.includes(expectedRunbook),

  executableActions: executableActions.length,

  routing: routing.status,

  automation: finalAutomation.status,

  approvalId: finalAutomation.approvalId,

  actionExecutionId: finalAutomation.actionExecutionId,

  approvals: approvalsAfterRouting.length,

  executions: executionsAfterRouting.length,

  investigationToolCalls: investigation.toolCalls,
});

console.log("\nUnknown fulfillment safe escalation passed");
