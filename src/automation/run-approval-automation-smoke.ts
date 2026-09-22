import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { decideApproval } from "../actions/approval-lifecycle.js";
import { FileApprovalStore } from "../actions/file-approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../actions/in-memory-action-execution-audit-store.js";
import {
  InMemoryActionExecutionRepository,
  type MutableCommerceOrderSeed,
} from "../actions/in-memory-action-execution-repository.js";
import { FileRemediationStore } from "../remediations/file-remediation-store.js";
import type { RemediationRun } from "../remediations/types.js";
import { createAutomationRun } from "./create-automation-run.js";
import { executeAutomationAction } from "./execute-automation-action.js";
import { FileAutomationStore } from "./file-automation-store.js";
import { resumeAutomationAfterApproval } from "./resume-automation-after-approval.js";
import { routeAutomationRemediationAction } from "./route-remediation-action.js";
import { transitionAutomationRun } from "./state-machine.js";
import { verifyAutomationAction } from "./verify-automation-action.js";

function createRetryableOrderFixture(
  orderId: string,
): MutableCommerceOrderSeed {
  return {
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
        id: "FUL-FAILED-1",
        status: "CONFIRMED_FAILED",
      },
    ],

    entitlements: [],

    accountDeliveries: [],

    notifications: [],

    refunds: [],

    refundAllowedByBusinessPolicy: true,
  };
}

function createCompletedRemediation(args: {
  remediationRunId: string;
  automationRunId: string;
  investigationRunId: string;
  orderId: string;
}): RemediationRun {
  const timestamp = new Date().toISOString();

  return {
    id: args.remediationRunId,

    orderId: args.orderId,

    automationRunId: args.automationRunId,

    investigationRunId: args.investigationRunId,

    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",

      summary:
        "The previous fulfillment attempt definitively failed. A replacement fulfillment attempt may be created, but it requires explicit human approval.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "CREATE_FULFILLMENT_ATTEMPT",

          instruction:
            "Create a replacement fulfillment attempt after explicit human approval.",

          supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
        },
      ],
    },

    retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

    startedAt: timestamp,

    updatedAt: timestamp,

    failureReason: null,
  };
}

async function main() {
  const orderId = "ORD-2001";

  const automationRunId = `AUTO-APPROVAL-${randomUUID()}`;

  const investigationRunId = `INV-${automationRunId}`;

  const remediationRunId = `REM-${automationRunId}`;

  const approvalDirectory = await mkdtemp(
    path.join(os.tmpdir(), "automation-approval-smoke-"),
  );

  const automationStore = new FileAutomationStore();

  const remediationStore = new FileRemediationStore();

  const approvalStore = new FileApprovalStore(approvalDirectory);

  const actionRepository = new InMemoryActionExecutionRepository([
    createRetryableOrderFixture(orderId),
  ]);

  const auditStore = new InMemoryActionExecutionAuditStore();

  try {
    console.log(
      "\n=== Phase 1: persist grounded remediation requiring approval ===",
    );

    const remediation = createCompletedRemediation({
      remediationRunId,
      automationRunId,
      investigationRunId,
      orderId,
    });

    await remediationStore.save(remediation);

    let automation = createAutomationRun({
      id: automationRunId,
      orderId,
    });

    automation = transitionAutomationRun(automation, "INVESTIGATING");

    automation = {
      ...automation,
      investigationRunId,
    };

    automation = transitionAutomationRun(automation, "PLANNING_REMEDIATION");

    automation = {
      ...automation,
      remediationRunId,
    };

    await automationStore.save(automation);

    console.dir(automation, {
      depth: null,
    });

    console.log(
      "\n=== Phase 2: deterministic policy creates durable approval pause ===",
    );

    await routeAutomationRemediationAction({
      automationRunId,

      automationStore,

      remediationStore,

      approvalStore,
    });

    const waitingRun = await automationStore.get(automationRunId);

    if (!waitingRun) {
      throw new Error(
        `Automation ${automationRunId} was not found after routing.`,
      );
    }

    if (waitingRun.status !== "WAITING_FOR_APPROVAL") {
      throw new Error(
        `Expected WAITING_FOR_APPROVAL, received ${waitingRun.status}.`,
      );
    }

    if (!waitingRun.approvalId) {
      throw new Error("Automation did not persist an approval id.");
    }

    console.log("\nAutomation waiting for approval:");

    console.dir(waitingRun, {
      depth: null,
    });

    const pendingApproval = await approvalStore.get(waitingRun.approvalId);

    if (!pendingApproval) {
      throw new Error(`Approval ${waitingRun.approvalId} was not found.`);
    }

    if (pendingApproval.status !== "PENDING") {
      throw new Error(
        `Expected approval PENDING, received ${pendingApproval.status}.`,
      );
    }

    if (pendingApproval.action.kind !== "CREATE_FULFILLMENT_ATTEMPT") {
      throw new Error(
        `Expected CREATE_FULFILLMENT_ATTEMPT approval, received ${pendingApproval.action.kind}.`,
      );
    }

    console.log("\nPersisted approval:");

    console.dir(pendingApproval, {
      depth: null,
    });

    console.log("\n=== Phase 3: human approves the exact action ===");

    const approved = decideApproval({
      approval: pendingApproval,

      decision: "APPROVE",

      decidedBy: "operator-smoke",
    });

    await approvalStore.save(approved);

    console.dir(approved, {
      depth: null,
    });

    console.log("\n=== Phase 4: durable workflow resumes after approval ===");

    const resumed = await resumeAutomationAfterApproval({
      automationRunId,

      automationStore,

      remediationStore,

      approvalStore,
    });

    if (resumed.status !== "EXECUTION_READY") {
      throw new Error(`Expected EXECUTION_READY, received ${resumed.status}.`);
    }

    if (resumed.run.status !== "EXECUTING") {
      throw new Error(
        `Expected automation EXECUTING, received ${resumed.run.status}.`,
      );
    }

    if (resumed.action.kind !== "CREATE_FULFILLMENT_ATTEMPT") {
      throw new Error(
        `Expected CREATE_FULFILLMENT_ATTEMPT, received ${resumed.action.kind}.`,
      );
    }

    console.log("\nAutomation after approval resume:");

    console.dir(resumed, {
      depth: null,
    });

    console.log(
      "\n=== Phase 5: approved action executes against fresh state ===",
    );

    const attemptsBefore = actionRepository.getFulfillmentAttempts(orderId);

    if (attemptsBefore.length !== 1) {
      throw new Error(
        `Expected one existing fulfillment attempt before execution, received ${attemptsBefore.length}.`,
      );
    }

    const execution = await executeAutomationAction({
      automationRunId,

      automationStore,

      remediationStore,

      repository: actionRepository,

      auditStore,

      approvalStore,
    });

    if (execution.status !== "VERIFYING") {
      throw new Error(`Expected VERIFYING, received ${execution.status}.`);
    }

    console.log("\nAutomation after execution:");

    console.dir(execution, {
      depth: null,
    });

    const consumedApproval = await approvalStore.get(waitingRun.approvalId);

    if (!consumedApproval) {
      throw new Error(
        `Approval ${waitingRun.approvalId} disappeared after execution.`,
      );
    }

    if (consumedApproval.status !== "CONSUMED") {
      throw new Error(
        `Expected approval CONSUMED, received ${consumedApproval.status}.`,
      );
    }

    if (consumedApproval.consumedByExecutionId !== execution.executionId) {
      throw new Error(
        "Consumed approval does not reference the action execution.",
      );
    }

    console.log("\nConsumed approval:");

    console.dir(consumedApproval, {
      depth: null,
    });

    const audit = await auditStore.get(execution.executionId);

    if (!audit) {
      throw new Error(`Action audit ${execution.executionId} was not found.`);
    }

    if (audit.status !== "EXECUTED") {
      throw new Error(
        `Expected action audit EXECUTED, received ${audit.status}.`,
      );
    }

    if (!audit.effect || audit.effect.kind !== "FULFILLMENT_ATTEMPT_CREATED") {
      throw new Error("Expected a durable FULFILLMENT_ATTEMPT_CREATED effect.");
    }

    if (audit.approvalId !== waitingRun.approvalId) {
      throw new Error(
        "Action audit does not reference the automation approval.",
      );
    }

    console.log("\nAction execution audit:");

    console.dir(audit, {
      depth: null,
    });

    const attemptsAfter = actionRepository.getFulfillmentAttempts(orderId);

    if (attemptsAfter.length !== 2) {
      throw new Error(
        `Expected exactly two fulfillment attempts after execution, received ${attemptsAfter.length}.`,
      );
    }

    const createdAttempt = await actionRepository.getFulfillmentAttempt(
      orderId,
      audit.effect.attemptId,
    );

    if (!createdAttempt) {
      throw new Error(
        `Created fulfillment attempt ${audit.effect.attemptId} was not found.`,
      );
    }

    if (createdAttempt.status !== "PENDING") {
      throw new Error(
        `Expected created attempt PENDING, received ${createdAttempt.status}.`,
      );
    }

    console.log("\nCreated fulfillment attempt:");

    console.dir(createdAttempt, {
      depth: null,
    });

    console.log(
      "\n=== Phase 6: independently verify the exact created attempt ===",
    );

    const verification = await verifyAutomationAction({
      automationRunId,

      automationStore,

      remediationStore,

      repository: actionRepository,

      auditStore,
    });

    if (verification.status !== "COMPLETED") {
      throw new Error(`Expected COMPLETED, received ${verification.status}.`);
    }

    console.log("\nVerification:");

    console.dir(verification, {
      depth: null,
    });

    const finalRun = await automationStore.get(automationRunId);

    if (!finalRun) {
      throw new Error(`Automation ${automationRunId} disappeared.`);
    }

    if (finalRun.status !== "COMPLETED") {
      throw new Error(
        `Expected final automation COMPLETED, received ${finalRun.status}.`,
      );
    }

    if (finalRun.approvalId !== waitingRun.approvalId) {
      throw new Error("Final automation lost its approval correlation.");
    }

    if (finalRun.actionExecutionId !== execution.executionId) {
      throw new Error(
        "Final automation lost its action-execution correlation.",
      );
    }

    console.log("\nFinal automation:");

    console.dir(finalRun, {
      depth: null,
    });

    console.log("\nFinal human-in-the-loop state:");

    console.dir(
      {
        automationStatus: finalRun.status,

        approvalStatus: consumedApproval.status,

        approvalId: finalRun.approvalId,

        actionExecutionId: finalRun.actionExecutionId,

        auditStatus: audit.status,

        auditEffect: audit.effect,

        createdAttempt,
      },
      {
        depth: null,
      },
    );

    console.log("\nHuman-in-the-loop remediation workflow passed.");
  } finally {
    await rm(approvalDirectory, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
