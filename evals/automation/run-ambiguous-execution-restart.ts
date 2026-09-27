import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ActionApproval } from "../../src/actions/approval.js";
import { createPendingApproval } from "../../src/actions/approval.js";
import {
  consumeApproval,
  decideApproval,
} from "../../src/actions/approval-lifecycle.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
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

type PersistedExecutionAudit = Parameters<
  InMemoryActionExecutionAuditStore["save"]
>[0];

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

const remediation = structuredClone(scenario.remediation);

const orderId = remediation.orderId;

const approvalId = "APR-AMBIGUOUS-RESTART";

const executionId = "ACT-AMBIGUOUS-RESTART";

const action = {
  kind: "CREATE_FULFILLMENT_ATTEMPT" as const,
  orderId,
  reason: "Grounded remediation requires creating a new fulfillment attempt.",
};

const tempDirectory = await mkdtemp(
  join(tmpdir(), "ai-ops-ambiguous-restart-"),
);

const snapshotPath = join(tempDirectory, "restart-state.json");

console.log("\n=== Ambiguous execution crash/restart recovery ===\n");

try {
  console.log(
    "Phase 1 — persist an execution that crossed the possible side-effect boundary\n",
  );

  const automationStore = new InMemoryAutomationStore();

  const remediationStore = new InMemoryRemediationStore();

  const approvalStore = new EvalApprovalStore();

  const auditStore = new InMemoryActionExecutionAuditStore();

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
    approvalId,
  };

  automation = transitionAutomationRun(automation, "WAITING_FOR_APPROVAL");

  automation = transitionAutomationRun(automation, "EXECUTING");

  await automationStore.save(automation);

  await remediationStore.save(remediation);

  const pendingApproval = createPendingApproval({
    id: approvalId,
    action,
  });

  const approvedApproval = decideApproval({
    approval: pendingApproval,
    decision: "APPROVE",
    decidedBy: "restart-eval-reviewer",
  });

  const consumedApproval = consumeApproval({
    approval: approvedApproval,
    executionId,
  });

  await approvalStore.save(consumedApproval);

  const startedAudit: PersistedExecutionAudit = {
    id: executionId,

    action,

    initiatedBy: {
      type: "SYSTEM",
      id: automation.id,
    },

    approvalId,

    status: "STARTED",

    startedAt: "2026-09-27T12:30:00.000Z",

    completedAt: null,

    reason:
      "Fulfillment attempt execution started; terminal outcome was not durably recorded.",

    validationReasons: [],

    error: null,

    effect: null,
  };

  await auditStore.save(startedAudit);

  const persistedAutomation = await automationStore.get(automation.id);

  const persistedRemediation = await remediationStore.get(remediation.id);

  const persistedApproval = await approvalStore.get(approvalId);

  const persistedExecutions = await auditStore.listByOrderId(orderId);

  const persistedExecution = persistedExecutions[0];

  if (
    !persistedAutomation ||
    !persistedRemediation ||
    !persistedApproval ||
    !persistedExecution
  ) {
    throw new Error("Required crash-state evidence was not persisted.");
  }

  if (persistedAutomation.status !== "EXECUTING") {
    throw new Error(
      `Expected EXECUTING crash point; received ${persistedAutomation.status}.`,
    );
  }

  if (persistedAutomation.actionExecutionId !== null) {
    throw new Error(
      "Automation must not already contain an execution correlation.",
    );
  }

  if (persistedApproval.status !== "CONSUMED") {
    throw new Error(
      `Expected CONSUMED approval; received ${persistedApproval.status}.`,
    );
  }

  if (persistedExecution.status !== "STARTED") {
    throw new Error(
      `Expected STARTED audit; received ${persistedExecution.status}.`,
    );
  }

  if (persistedExecution.effect !== null) {
    throw new Error("Ambiguous execution must not contain a terminal effect.");
  }

  const snapshot: RestartSnapshot = {
    automation: persistedAutomation,

    remediation: persistedRemediation,

    approval: persistedApproval,

    execution: persistedExecution,
  };

  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log({
    crashPoint: persistedAutomation.status,

    approval: persistedApproval.status,

    durableExecution: persistedExecution.status,

    effect: persistedExecution.effect,

    automationExecutionId: persistedAutomation.actionExecutionId,
  });

  console.log("\n--- simulated process loss ---\n");

  console.log(
    "Phase 2 — fresh runtime refuses to replay ambiguous execution\n",
  );

  const recoveredSnapshot = JSON.parse(
    await readFile(snapshotPath, "utf8"),
  ) as RestartSnapshot;

  const recoveredAutomationStore = new InMemoryAutomationStore();

  const recoveredRemediationStore = new InMemoryRemediationStore();

  const recoveredApprovalStore = new EvalApprovalStore();

  const recoveredAuditStore = new InMemoryActionExecutionAuditStore();

  await recoveredAutomationStore.save(recoveredSnapshot.automation);

  await recoveredRemediationStore.save(recoveredSnapshot.remediation);

  await recoveredApprovalStore.save(recoveredSnapshot.approval);

  await recoveredAuditStore.save(recoveredSnapshot.execution);

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
      "Ambiguous recovery must never replay the fulfillment write.",
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

  if (recovery.status !== "ESCALATED") {
    throw new Error(
      `Expected ESCALATED recovery; received ${recovery.status}.`,
    );
  }

  if (replayAttempts !== 0) {
    throw new Error(
      `Ambiguous recovery replayed the fulfillment write ${replayAttempts} time(s).`,
    );
  }

  const finalAutomation = await recoveredAutomationStore.get(
    recoveredSnapshot.automation.id,
  );

  if (!finalAutomation) {
    throw new Error("Recovered automation disappeared.");
  }

  if (finalAutomation.status !== "ESCALATED") {
    throw new Error(
      `Expected durable ESCALATED state; received ${finalAutomation.status}.`,
    );
  }

  const approvalAfterRecovery = await recoveredApprovalStore.get(approvalId);

  if (!approvalAfterRecovery) {
    throw new Error("Recovered approval disappeared.");
  }

  if (approvalAfterRecovery.status !== "CONSUMED") {
    throw new Error(
      `Consumed approval was changed to ${approvalAfterRecovery.status}.`,
    );
  }

  const executionsAfterRecovery =
    await recoveredAuditStore.listByOrderId(orderId);

  if (executionsAfterRecovery.length !== 1) {
    throw new Error(
      `Expected exactly one durable execution audit; received ${executionsAfterRecovery.length}.`,
    );
  }

  const survivingAudit = executionsAfterRecovery[0];

  if (!survivingAudit) {
    throw new Error("Ambiguous execution audit disappeared.");
  }

  if (survivingAudit.status !== "STARTED") {
    throw new Error(
      `Expected ambiguous STARTED audit to remain; received ${survivingAudit.status}.`,
    );
  }

  console.log({
    recoveredFrom: recoveredSnapshot.automation.status,

    durableExecution: survivingAudit.status,

    effect: survivingAudit.effect,

    approval: approvalAfterRecovery.status,

    replayAttempts,

    executionAudits: executionsAfterRecovery.length,

    recovery: recovery.status,

    automation: finalAutomation.status,

    verification: "NOT_ATTEMPTED",
  });

  console.log("\nAmbiguous execution crash/restart recovery passed");
} finally {
  await rm(tempDirectory, {
    recursive: true,
    force: true,
  });
}
