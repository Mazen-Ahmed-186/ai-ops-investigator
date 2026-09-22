import { randomUUID } from "node:crypto";

import type { IncidentAssessment } from "../ai/schemas.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import { createOrder1001ActionFixture } from "../actions/action-fixtures.js";
import { InMemoryActionExecutionAuditStore } from "../actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../actions/in-memory-action-execution-repository.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import type { InvestigationRunState } from "../investigations/types.js";
import { FileRemediationStore } from "../remediations/file-remediation-store.js";
import { continueAutomationRemediationPlanning } from "./continue-remediation-planning.js";
import { createAutomationRun } from "./create-automation-run.js";
import { createDurableRemediationRunner } from "./durable-remediation-runner.js";
import { executeAutomationAction } from "./execute-automation-action.js";
import { FileAutomationStore } from "./file-automation-store.js";
import { createInvestigationBackedRemediationPlanner } from "./investigation-backed-remediation-planner.js";
import { routeAutomationRemediationAction } from "./route-remediation-action.js";
import { createAgenticRemediationGenerator } from "./run-agentic-remediation-generator.js";
import { transitionAutomationRun } from "./state-machine.js";
import { verifyAutomationAction } from "./verify-automation-action.js";

const unexpectedApprovalStore: ApprovalStore = {
  async save() {
    throw new Error(
      "The ORD-1001 auto-remediation path must not create an approval.",
    );
  },

  async get() {
    throw new Error(
      "The ORD-1001 auto-remediation path must not read an approval.",
    );
  },

  async listByOrderId() {
    throw new Error(
      "The ORD-1001 auto-remediation path must not list approvals.",
    );
  },
};

function createAssessment(): IncidentAssessment {
  return {
    diagnosisStatus: "DIAGNOSIS_READY",

    rootCauseCategory: "INFRASTRUCTURE",

    confidence: "HIGH",

    summary:
      "Order ORD-1001 is stuck in PROCESSING because the completion handler attempted to transition it to FULFILLED after successful payment, fulfillment, entitlement creation, and account delivery, but a database timeout prevented the final order-state update from being persisted. The failed email notification is a separate issue and is not established as the cause.",

    findings: [
      {
        category: "ORDER_STATE",
        kind: "ISSUE",
        summary:
          "The order remains PROCESSING despite successful fulfillment and account delivery.",
      },
      {
        category: "PAYMENT",
        kind: "EVIDENCE",
        summary: "The payment was captured successfully.",
      },
      {
        category: "FULFILLMENT",
        kind: "EVIDENCE",
        summary: "The fulfillment attempt succeeded.",
      },
      {
        category: "DELIVERY",
        kind: "EVIDENCE",
        summary: "The entitlement is active and account delivery succeeded.",
      },
      {
        category: "ORDER_STATE",
        kind: "EVIDENCE",
        summary:
          "The completion handler attempted the PROCESSING to FULFILLED transition, but a database timeout occurred before persistence.",
      },
      {
        category: "NOTIFICATION",
        kind: "ISSUE",
        summary:
          "The customer email notification failed separately and is not established as the cause of the stale order state.",
      },
    ],

    requiresMoreEvidence: false,
  };
}

function createCompletedInvestigation(args: {
  investigationRunId: string;
  orderId: string;
}): InvestigationRunState {
  const timestamp = new Date().toISOString();

  return {
    id: args.investigationRunId,

    orderId: args.orderId,

    goal: `Determine why order ${args.orderId} is stuck.`,

    status: "COMPLETED",

    workingMemory: {
      facts: [],
      unresolvedQuestions: [],
    },

    startedAt: timestamp,

    updatedAt: timestamp,

    toolCalls: 7,

    executedToolCallSignatures: [],

    toolExecutions: [],

    continuation: null,

    assessment: createAssessment(),

    failureReason: null,
  };
}

async function main() {
  const orderId = "ORD-1001";

  const automationRunId = `AUTO-RAG-${randomUUID()}`;

  const investigationRunId = `INV-${automationRunId}`;

  const automationStore = new FileAutomationStore();

  const investigationStore = new FileInvestigationStore();

  const remediationStore = new FileRemediationStore();

  const actionRepository = new InMemoryActionExecutionRepository([
    createOrder1001ActionFixture(),
  ]);

  const auditStore = new InMemoryActionExecutionAuditStore();

  console.log("\n=== Phase 1: persist completed investigation fixture ===");

  await investigationStore.save(
    createCompletedInvestigation({
      investigationRunId,
      orderId,
    }),
  );

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

  await automationStore.save(automation);

  console.dir(automation, {
    depth: null,
  });

  console.log("\n=== Phase 2: real grounded remediation planning ===");

  const remediationRunner = createDurableRemediationRunner({
    store: remediationStore,

    planner: createInvestigationBackedRemediationPlanner({
      investigationStore,

      generate: createAgenticRemediationGenerator(),
    }),
  });

  const planned = await continueAutomationRemediationPlanning({
    automationRunId,

    store: automationStore,

    remediationRunner,
  });

  console.log("\nAutomation after remediation planning:");

  console.dir(planned, {
    depth: null,
  });

  if (!planned.remediationRunId) {
    throw new Error("Automation did not persist a remediation run id.");
  }

  const remediation = await remediationStore.get(planned.remediationRunId);

  if (!remediation) {
    throw new Error(`Remediation ${planned.remediationRunId} was not found.`);
  }

  console.log("\nPersisted remediation:");

  console.dir(remediation, {
    depth: null,
  });

  if (remediation.status !== "COMPLETED") {
    throw new Error(
      `Expected remediation COMPLETED, received ${remediation.status}.`,
    );
  }

  if (remediation.recommendation?.status !== "RECOMMENDATION_READY") {
    throw new Error(
      `Expected RECOMMENDATION_READY, received ${remediation.recommendation?.status ?? "missing"}.`,
    );
  }

  if (remediation.retrievedRunbookIds.length === 0) {
    throw new Error(
      "Expected the recommendation to be grounded in at least one retrieved runbook.",
    );
  }

  console.log(
    "\n=== Phase 3: derive action and apply deterministic policy ===",
  );

  if (actionRepository.getOrderStatus(orderId) !== "PROCESSING") {
    throw new Error("Expected ORD-1001 to begin execution in PROCESSING.");
  }

  const routing = await routeAutomationRemediationAction({
    automationRunId,

    automationStore,

    remediationStore,

    approvalStore: unexpectedApprovalStore,
  });

  console.log("\nAction routing:");

  console.dir(routing, {
    depth: null,
  });

  if (routing.status !== "EXECUTION_READY") {
    throw new Error(`Expected EXECUTION_READY, received ${routing.status}.`);
  }

  if (routing.action.kind !== "RECONCILE_ORDER_STATE") {
    throw new Error(
      `Expected RECONCILE_ORDER_STATE, received ${routing.action.kind}.`,
    );
  }

  if (routing.run.status !== "EXECUTING") {
    throw new Error(
      `Expected automation EXECUTING, received ${routing.run.status}.`,
    );
  }

  console.log("\n=== Phase 4: audited execution against fresh state ===");

  const execution = await executeAutomationAction({
    automationRunId,

    automationStore,

    remediationStore,

    repository: actionRepository,

    auditStore,
  });

  console.log("\nAutomation after execution:");

  console.dir(execution, {
    depth: null,
  });

  if (execution.status !== "VERIFYING") {
    throw new Error(`Expected VERIFYING, received ${execution.status}.`);
  }

  const orderStatusAfterExecution = actionRepository.getOrderStatus(orderId);

  if (orderStatusAfterExecution !== "FULFILLED") {
    throw new Error(
      `Expected order FULFILLED after execution, received ${orderStatusAfterExecution}.`,
    );
  }

  const audit = await auditStore.get(execution.executionId);

  if (!audit) {
    throw new Error(
      `Action execution audit ${execution.executionId} was not found.`,
    );
  }

  console.log("\nAction execution audit:");

  console.dir(audit, {
    depth: null,
  });

  if (audit.status !== "EXECUTED") {
    throw new Error(
      `Expected action audit EXECUTED, received ${audit.status}.`,
    );
  }

  if (audit.action.kind !== "RECONCILE_ORDER_STATE") {
    throw new Error(
      `Expected audited RECONCILE_ORDER_STATE, received ${audit.action.kind}.`,
    );
  }

  if (audit.initiatedBy.type !== "SYSTEM") {
    throw new Error(
      `Expected execution initiator SYSTEM, received ${audit.initiatedBy.type}.`,
    );
  }

  if (audit.initiatedBy.id !== automationRunId) {
    throw new Error(
      `Expected execution initiator ${automationRunId}, received ${audit.initiatedBy.id}.`,
    );
  }

  console.log("\n=== Phase 5: independent postcondition verification ===");

  const verification = await verifyAutomationAction({
    automationRunId,

    automationStore,

    remediationStore,

    repository: actionRepository,
  });

  console.log("\nVerification result:");

  console.dir(verification, {
    depth: null,
  });

  if (verification.status !== "COMPLETED") {
    throw new Error(
      `Expected automation COMPLETED, received ${verification.status}.`,
    );
  }

  const finalRun = await automationStore.get(automationRunId);

  if (!finalRun) {
    throw new Error(`Automation ${automationRunId} disappeared.`);
  }

  if (finalRun.status !== "COMPLETED") {
    throw new Error(
      `Expected persisted automation COMPLETED, received ${finalRun.status}.`,
    );
  }

  if (finalRun.actionExecutionId !== execution.executionId) {
    throw new Error(
      "Persisted automation does not reference the executed action audit.",
    );
  }

  const finalOrderStatus = actionRepository.getOrderStatus(orderId);

  if (finalOrderStatus !== "FULFILLED") {
    throw new Error(
      `Expected final order status FULFILLED, received ${finalOrderStatus}.`,
    );
  }

  const finalAudit = await auditStore.get(finalRun.actionExecutionId);

  if (!finalAudit) {
    throw new Error(
      `Final action audit ${finalRun.actionExecutionId} was not found.`,
    );
  }

  if (finalAudit.status !== "EXECUTED") {
    throw new Error(
      `Expected final action audit EXECUTED, received ${finalAudit.status}.`,
    );
  }

  console.log("\nFinal automation:");

  console.dir(finalRun, {
    depth: null,
  });

  console.log("\nFinal business state:");

  console.dir(
    {
      orderId,
      orderStatus: finalOrderStatus,
      actionExecutionId: finalRun.actionExecutionId,
      actionAuditStatus: finalAudit.status,
    },
    {
      depth: null,
    },
  );

  console.log("\nSafe auto-remediation workflow passed.");
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
