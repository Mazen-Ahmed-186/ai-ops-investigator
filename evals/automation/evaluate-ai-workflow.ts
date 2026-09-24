import type { ActionApproval } from "../../src/actions/approval.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { createAgentInvestigationRunner } from "../../src/automation/agent-investigation-runner.js";
import { continueAutomationRemediationPlanning } from "../../src/automation/continue-remediation-planning.js";
import { createDurableRemediationRunner } from "../../src/automation/durable-remediation-runner.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { createInvestigationBackedRemediationPlanner } from "../../src/automation/investigation-backed-remediation-planner.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { createRunAgentInvestigationExecutor } from "../../src/automation/run-agent-investigation-executor.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import { startAutomationInvestigation } from "../../src/automation/start-automation-investigation.js";
import { verifyAutomationAction } from "../../src/automation/verify-automation-action.js";
import type { InvestigationStore } from "../../src/investigations/store.js";
import type { InvestigationRunState } from "../../src/investigations/types.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";

export type AiWorkflowEvaluationResult = {
  diagnosis: string;
  toolCalls: number;
  primaryAction: string;
  retrievedRunbookIds: string[];
  approvalCount: number;
  executionCount: number;
  effect: string;
  verificationStatus: string;
  automationStatus: string;
};

export async function evaluateAiWorkflow(): Promise<AiWorkflowEvaluationResult> {
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

  const orderId = "ORD-1001";
  const automationRunId = "AUTO-AI-ORD-1001";

  const automationStore = new InMemoryAutomationStore();

  const investigationStore = new EvalInvestigationStore();

  const remediationStore = new InMemoryRemediationStore();

  const approvalStore = new EvalApprovalStore();

  const auditStore = new InMemoryActionExecutionAuditStore();

  console.log("\n=== AI → safe action workflow ===\n");

  const investigationExecutor = createRunAgentInvestigationExecutor({
    store: investigationStore,
  });

  const investigationRunner = createAgentInvestigationRunner(
    investigationExecutor,
  );

  let run = await startAutomationInvestigation({
    orderId,
    automationRunId,
    store: automationStore,
    investigationRunner,
  });

  if (run.status !== "PLANNING_REMEDIATION") {
    throw new Error(
      `Expected automation to reach PLANNING_REMEDIATION after investigation; received ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(
      "Automation completed investigation without an investigation run id.",
    );
  }

  const investigation = await investigationStore.get(run.investigationRunId);

  if (!investigation) {
    throw new Error(
      `Investigation ${run.investigationRunId} was not persisted.`,
    );
  }

  if (investigation.status !== "COMPLETED") {
    throw new Error(
      `Expected completed investigation; received ${investigation.status}.`,
    );
  }

  if (!investigation.assessment) {
    throw new Error("Completed investigation has no assessment.");
  }

  if (investigation.assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
    throw new Error(
      `Expected DIAGNOSIS_READY; received ${investigation.assessment.diagnosisStatus}.`,
    );
  }

  if (investigation.assessment.rootCauseCategory !== "INFRASTRUCTURE") {
    throw new Error(
      `Expected INFRASTRUCTURE root cause; received ${investigation.assessment.rootCauseCategory}.`,
    );
  }

  if (investigation.assessment.requiresMoreEvidence) {
    throw new Error("Investigation unexpectedly requires more evidence.");
  }

  console.log("Investigation:", {
    status: investigation.status,
    diagnosisStatus: investigation.assessment.diagnosisStatus,
    rootCauseCategory: investigation.assessment.rootCauseCategory,
    toolCalls: investigation.toolCalls,
  });

  const generateRemediation = createAgenticRemediationGenerator();

  const remediationPlanner = createInvestigationBackedRemediationPlanner({
    investigationStore,
    generate: generateRemediation,
  });

  const remediationRunner = createDurableRemediationRunner({
    store: remediationStore,
    planner: remediationPlanner,
  });

  run = await continueAutomationRemediationPlanning({
    automationRunId: run.id,
    store: automationStore,
    remediationRunner,
  });

  if (!run.remediationRunId) {
    throw new Error(
      "Automation completed remediation planning without a remediation run id.",
    );
  }

  const remediation = await remediationStore.get(run.remediationRunId);

  if (!remediation) {
    throw new Error(`Remediation ${run.remediationRunId} was not persisted.`);
  }

  if (remediation.status !== "COMPLETED") {
    throw new Error(
      `Expected completed remediation; received ${remediation.status}.`,
    );
  }

  if (!remediation.recommendation) {
    throw new Error("Completed remediation has no recommendation.");
  }

  const primaryAction = remediation.recommendation.actions.find(
    (action) => action.disposition === "PRIMARY",
  );

  if (!primaryAction) {
    throw new Error("Remediation did not produce a PRIMARY action.");
  }

  if (primaryAction.actionKind !== "RECONCILE_ORDER_STATE") {
    throw new Error(
      `Expected PRIMARY RECONCILE_ORDER_STATE action; received ${primaryAction.actionKind}.`,
    );
  }

  if (!primaryAction.supportedByRunbookIds.includes("RUNBOOK-DB-TIMEOUT")) {
    throw new Error(
      "Primary reconciliation action is not grounded in RUNBOOK-DB-TIMEOUT.",
    );
  }

  if (!remediation.retrievedRunbookIds.includes("RUNBOOK-DB-TIMEOUT")) {
    throw new Error("Remediation did not retrieve RUNBOOK-DB-TIMEOUT.");
  }

  console.log("Remediation:", {
    status: remediation.status,
    primaryAction: primaryAction.actionKind,
    supportedBy: primaryAction.supportedByRunbookIds,
    retrievedRunbooks: remediation.retrievedRunbookIds,
  });

  const routing = await routeAutomationRemediationAction({
    automationRunId: run.id,
    automationStore,
    remediationStore,
    approvalStore,
  });

  if (routing.status !== "EXECUTION_READY") {
    throw new Error(
      `Expected reconciliation to be execution-ready without approval; received ${routing.status}.`,
    );
  }

  const approvals = await approvalStore.listByOrderId(orderId);

  if (approvals.length !== 0) {
    throw new Error(
      `Reconciliation unexpectedly created ${approvals.length} approval(s).`,
    );
  }

  console.log("Routing:", {
    status: routing.status,
    approvals: approvals.length,
  });

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
          id: "FUL-1001",
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
          id: "NOT-1001",
          status: "FAILED",
        },
      ],

      refunds: [],

      refundAllowedByBusinessPolicy: true,
    },
  ]);

  const execution = await executeAutomationAction({
    automationRunId: run.id,
    automationStore,
    remediationStore,
    repository,
    auditStore,
    approvalStore,
  });

  if (execution.status !== "VERIFYING") {
    throw new Error(
      `Expected action execution to reach VERIFYING; received ${execution.status}.`,
    );
  }

  const actionAudits = await auditStore.listByOrderId(orderId);

  if (actionAudits.length !== 1) {
    throw new Error(
      `Expected exactly one action execution audit; received ${actionAudits.length}.`,
    );
  }

  const [actionAudit] = actionAudits;

  if (!actionAudit) {
    throw new Error("Expected action execution audit to exist.");
  }

  if (actionAudit.id !== execution.executionId) {
    throw new Error(
      "Automation execution id does not match the persisted action audit.",
    );
  }

  if (actionAudit.status !== "EXECUTED") {
    throw new Error(
      `Expected EXECUTED action audit; received ${actionAudit.status}.`,
    );
  }

  if (actionAudit.action.kind !== "RECONCILE_ORDER_STATE") {
    throw new Error(
      `Expected reconciler action audit; received ${actionAudit.action.kind}.`,
    );
  }

  if (actionAudit.effect?.kind !== "ORDER_STATE_RECONCILED") {
    throw new Error(
      `Expected ORDER_STATE_RECONCILED audit effect; received ${actionAudit.effect?.kind ?? "null"}.`,
    );
  }

  console.log("Execution:", {
    status: execution.status,
    executionId: execution.executionId,
    auditStatus: actionAudit.status,
    effect: actionAudit.effect.kind,
  });

  const verification = await verifyAutomationAction({
    automationRunId: run.id,
    automationStore,
    remediationStore,
    repository,
    auditStore,
  });

  if (verification.status !== "COMPLETED") {
    throw new Error(
      `Expected verification to complete; received ${verification.status}.`,
    );
  }

  const finalRun = await automationStore.get(run.id);

  if (!finalRun) {
    throw new Error(`Automation ${run.id} disappeared after verification.`);
  }

  if (finalRun.status !== "COMPLETED") {
    throw new Error(
      `Expected final automation status COMPLETED; received ${finalRun.status}.`,
    );
  }

  if (finalRun.actionExecutionId !== actionAudit.id) {
    throw new Error(
      "Final automation run is not correlated with the verified action execution.",
    );
  }

  console.log("Verification:", {
    status: verification.status,
    automationStatus: finalRun.status,
  });

  console.log("\nAI → safe action workflow passed");

  console.table([
    {
      investigation: investigation.status,
      diagnosis: investigation.assessment.rootCauseCategory,
      remediation: remediation.status,
      primaryAction: primaryAction.actionKind,
      approval: "NONE",
      execution: actionAudit.status,
      effect: actionAudit.effect.kind,
      verification: verification.status,
      automation: finalRun.status,
    },
  ]);

  return {
    diagnosis: investigation.assessment.rootCauseCategory,
    toolCalls: investigation.toolCalls,
    primaryAction: primaryAction.actionKind,
    retrievedRunbookIds: remediation.retrievedRunbookIds,
    approvalCount: approvals.length,
    executionCount: actionAudits.length,
    effect: actionAudit.effect.kind,
    verificationStatus: verification.status,
    automationStatus: finalRun.status,
  };
}
