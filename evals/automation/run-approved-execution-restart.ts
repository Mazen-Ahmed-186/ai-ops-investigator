import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionApproval } from "../../src/actions/approval.js";
import { decideApproval } from "../../src/actions/approval-lifecycle.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { executeAuditedCreateFulfillmentAttempt } from "../../src/actions/execute-audited-create-fulfillment-attempt.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { resumeAutomationAfterApproval } from "../../src/automation/resume-automation-after-approval.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../src/automation/verify-automation-action.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";
import { automationScenarios } from "./scenarios.js";

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

type PersistedAutomationRun = NonNullable<
  Awaited<ReturnType<InMemoryAutomationStore["get"]>>
>;

type PersistedRemediationRun = NonNullable<
  Awaited<ReturnType<InMemoryRemediationStore["get"]>>
>;

type PersistedExecutionAudit = Awaited<
  ReturnType<InMemoryActionExecutionAuditStore["listByOrderId"]>
>[number];

type RestartSnapshot = {
  automation: PersistedAutomationRun;
  remediation: PersistedRemediationRun;
  approval: ActionApproval;
  execution: PersistedExecutionAudit;
};

const scenario = automationScenarios.find(
  (candidate) => candidate.id === "confirmed-fulfillment-failure",
);

if (!scenario) {
  throw new Error("Confirmed fulfillment failure scenario was not found.");
}

const orderId = scenario.remediation.orderId;

const tempDirectory = await mkdtemp(join(tmpdir(), "ai-ops-approved-restart-"));

const snapshotPath = join(tempDirectory, "restart-state.json");

console.log("\n=== Approved execution crash/restart recovery ===\n");

try {
  console.log(
    "Phase 1 — execute side effect, then crash before coordinator persistence\n",
  );

  const automationStore = new InMemoryAutomationStore();

  const remediationStore = new InMemoryRemediationStore();

  const approvalStore = new EvalApprovalStore();

  const auditStore = new InMemoryActionExecutionAuditStore();

  const remediation = structuredClone(scenario.remediation);

  let automation = createAutomationRun({
    id: remediation.automationRunId,
    orderId,
  });

  automation = transitionAutomationRun(automation, "INVESTIGATING");

  automation = {
    ...automation,
    investigationRunId: remediation.investigationRunId,
  };

  automation = transitionAutomationRun(automation, "PLANNING_REMEDIATION");

  automation = {
    ...automation,
    remediationRunId: remediation.id,
  };

  await automationStore.save(automation);

  await remediationStore.save(remediation);

  const routing = await routeAutomationRemediationAction({
    automationRunId: automation.id,
    automationStore,
    remediationStore,
    approvalStore,
  });

  if (routing.status !== "WAITING_FOR_APPROVAL") {
    throw new Error(
      `Expected WAITING_FOR_APPROVAL; received ${routing.status}.`,
    );
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

  const approved = decideApproval({
    approval: pendingApproval,
    decision: "APPROVE",
    decidedBy: "restart-eval-reviewer",
  });

  await approvalStore.save(approved);

  const resumed = await resumeAutomationAfterApproval({
    automationRunId: automation.id,
    automationStore,
    remediationStore,
    approvalStore,
  });

  if (resumed.status !== "EXECUTION_READY") {
    throw new Error(
      `Expected EXECUTION_READY after approval; received ${resumed.status}.`,
    );
  }

  const executingRun = await automationStore.get(automation.id);

  if (!executingRun) {
    throw new Error("Automation disappeared after approval resume.");
  }

  if (executingRun.status !== "EXECUTING") {
    throw new Error(
      `Expected durable EXECUTING state; received ${executingRun.status}.`,
    );
  }

  if (executingRun.actionExecutionId !== null) {
    throw new Error(
      "Automation already contains an execution correlation before execution.",
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
          id: "FUL-2001",
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

  const approvedAction = approved.action;

  if (approvedAction.kind !== "CREATE_FULFILLMENT_ATTEMPT") {
    throw new Error(
      `Expected CREATE_FULFILLMENT_ATTEMPT approval; received ${approvedAction.kind}.`,
    );
  }

  const fulfillmentAction: Parameters<
    typeof executeAuditedCreateFulfillmentAttempt
  >[0]["action"] = {
    kind: "CREATE_FULFILLMENT_ATTEMPT",
    orderId: approvedAction.orderId,
    reason: approvedAction.reason,
  };

  const executed = await executeAuditedCreateFulfillmentAttempt({
    action: fulfillmentAction,

    approvalId: approved.id,

    approvalStore,

    repository,

    auditStore,

    initiatedBy: {
      type: "SYSTEM",
      id: executingRun.id,
    },
  });

  if (executed.result.status !== "EXECUTED") {
    throw new Error(
      `Expected direct executor success; received ${executed.result.status}.`,
    );
  }

  const consumedApproval = await approvalStore.get(approved.id);

  if (!consumedApproval) {
    throw new Error("Approval disappeared after execution.");
  }

  if (consumedApproval.status !== "CONSUMED") {
    throw new Error(
      `Expected CONSUMED approval; received ${consumedApproval.status}.`,
    );
  }

  const executionsBeforeCrash = await auditStore.listByOrderId(orderId);

  if (executionsBeforeCrash.length !== 1) {
    throw new Error(
      `Expected exactly one durable execution before crash; received ${executionsBeforeCrash.length}.`,
    );
  }

  const executionAudit = executionsBeforeCrash[0];

  if (!executionAudit) {
    throw new Error("Execution audit was not found.");
  }

  if (executionAudit.status !== "EXECUTED") {
    throw new Error(
      `Expected EXECUTED audit; received ${executionAudit.status}.`,
    );
  }

  if (executionAudit.effect?.kind !== "FULFILLMENT_ATTEMPT_CREATED") {
    throw new Error(
      `Expected FULFILLMENT_ATTEMPT_CREATED; received ${executionAudit.effect?.kind ?? "null"}.`,
    );
  }

  if (executionAudit.effect.attemptStatus !== "PENDING") {
    throw new Error(
      `Expected PENDING fulfillment attempt; received ${executionAudit.effect.attemptStatus}.`,
    );
  }

  const persistedAutomation = await automationStore.get(automation.id);

  const persistedRemediation = await remediationStore.get(remediation.id);

  if (!persistedAutomation || !persistedRemediation) {
    throw new Error(
      "Required workflow state was not available for persistence.",
    );
  }

  if (persistedAutomation.status !== "EXECUTING") {
    throw new Error(
      `Crash point must remain EXECUTING; received ${persistedAutomation.status}.`,
    );
  }

  if (persistedAutomation.actionExecutionId !== null) {
    throw new Error(
      "Coordinator unexpectedly persisted the execution before the simulated crash.",
    );
  }

  const snapshot: RestartSnapshot = {
    automation: persistedAutomation,

    remediation: persistedRemediation,

    approval: consumedApproval,

    execution: executionAudit,
  };

  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log({
    crashPoint: persistedAutomation.status,

    approval: consumedApproval.status,

    durableExecution: executionAudit.status,

    effect: executionAudit.effect.kind,

    attemptId: executionAudit.effect.attemptId,

    automationExecutionId: persistedAutomation.actionExecutionId,
  });

  console.log("\n--- simulated process loss ---\n");

  const recoveredSnapshot = JSON.parse(
    await readFile(snapshotPath, "utf8"),
  ) as RestartSnapshot;

  console.log("Phase 2 — fresh runtime recovers from durable state\n");

  const recoveredAutomationStore = new InMemoryAutomationStore();

  const recoveredRemediationStore = new InMemoryRemediationStore();

  const recoveredApprovalStore = new EvalApprovalStore();

  const recoveredAuditStore = new InMemoryActionExecutionAuditStore();

  await recoveredAutomationStore.save(recoveredSnapshot.automation);

  await recoveredRemediationStore.save(recoveredSnapshot.remediation);

  await recoveredApprovalStore.save(recoveredSnapshot.approval);

  await recoveredAuditStore.save(recoveredSnapshot.execution);

  if (
    recoveredSnapshot.execution.effect?.kind !== "FULFILLMENT_ATTEMPT_CREATED"
  ) {
    throw new Error(
      "Recovered execution does not contain the expected fulfillment effect.",
    );
  }

  const recoveredAttemptId = recoveredSnapshot.execution.effect.attemptId;

  const recoveredRepository = new InMemoryActionExecutionRepository([
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
          id: "FUL-2001",
          status: "CONFIRMED_FAILED",
        },
        {
          id: recoveredAttemptId,
          status: "PENDING",
        },
      ],

      entitlements: [],

      accountDeliveries: [],

      notifications: [],

      refunds: [],

      refundAllowedByBusinessPolicy: true,
    },
  ]);

  let replayAttempts = 0;

  recoveredRepository.createFulfillmentAttempt = async () => {
    replayAttempts += 1;

    throw new Error(
      "Recovered execution must not replay the fulfillment write.",
    );
  };

  const recovery = await executeAutomationAction({
    automationRunId: recoveredSnapshot.automation.id,

    automationStore: recoveredAutomationStore,

    remediationStore: recoveredRemediationStore,

    repository: recoveredRepository,

    auditStore: recoveredAuditStore,

    approvalStore: recoveredApprovalStore,
  });

  if (recovery.status !== "VERIFYING") {
    throw new Error(
      `Expected recovered execution to enter VERIFYING; received ${recovery.status}.`,
    );
  }

  if (replayAttempts !== 0) {
    throw new Error(
      `Recovered execution replayed the fulfillment write ${replayAttempts} time(s).`,
    );
  }

  if (recovery.run.actionExecutionId !== recoveredSnapshot.execution.id) {
    throw new Error(
      "Recovered automation did not correlate the known durable execution.",
    );
  }

  const executionsAfterRecovery =
    await recoveredAuditStore.listByOrderId(orderId);

  if (executionsAfterRecovery.length !== 1) {
    throw new Error(
      `Recovery created duplicate execution audits; found ${executionsAfterRecovery.length}.`,
    );
  }

  const approvalAfterRecovery = await recoveredApprovalStore.get(
    recoveredSnapshot.approval.id,
  );

  if (!approvalAfterRecovery) {
    throw new Error("Recovered approval was not found.");
  }

  if (approvalAfterRecovery.status !== "CONSUMED") {
    throw new Error(
      `Recovered approval changed unexpectedly to ${approvalAfterRecovery.status}.`,
    );
  }

  const verification = await verifyAutomationAction({
    automationRunId: recoveredSnapshot.automation.id,

    automationStore: recoveredAutomationStore,

    remediationStore: recoveredRemediationStore,

    repository: recoveredRepository,

    auditStore: recoveredAuditStore,
  });

  if (verification.status !== "COMPLETED") {
    throw new Error(
      `Expected COMPLETED verification; received ${verification.status}.`,
    );
  }

  const finalAutomation = await recoveredAutomationStore.get(
    recoveredSnapshot.automation.id,
  );

  if (!finalAutomation) {
    throw new Error("Recovered automation disappeared after verification.");
  }

  if (finalAutomation.status !== "COMPLETED") {
    throw new Error(
      `Expected COMPLETED automation; received ${finalAutomation.status}.`,
    );
  }

  if (finalAutomation.actionExecutionId !== recoveredSnapshot.execution.id) {
    throw new Error(
      "Final automation lost the recovered execution correlation.",
    );
  }

  console.log({
    recoveredFrom: recoveredSnapshot.automation.status,

    durableExecution: recoveredSnapshot.execution.status,

    approval: approvalAfterRecovery.status,

    replayAttempts,

    executionAudits: executionsAfterRecovery.length,

    recoveredExecutionId: recovery.run.actionExecutionId,

    verification: verification.status,

    automation: finalAutomation.status,
  });

  console.log("\nApproved execution crash/restart recovery passed");
} finally {
  await rm(tempDirectory, {
    recursive: true,
    force: true,
  });
}
