import { describe, expect, it, vi } from "vitest";

import type { ActionExecutionAuditStore } from "../../../src/actions/action-execution-audit-store.js";
import type { ActionExecutionRepository } from "../../../src/actions/action-execution-repository.js";
import { executeAuditedReconcileOrderState } from "../../../src/actions/execute-audited-reconcile-order-state.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";
import type { ApprovalStore } from "../../../src/actions/approval-store.js";
import { executeAuditedCreateFulfillmentAttempt } from "../../../src/actions/execute-audited-create-fulfillment-attempt.js";
import {
  consumeApproval,
  decideApproval,
} from "../../../src/actions/approval-lifecycle.js";
import { createPendingApproval } from "../../../src/actions/approval.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { executeAuditedRetryNotification } from "../../../src/actions/execute-audited-retry-notification.js";

const repository: ActionExecutionRepository = {
  async getExecutionContext() {
    throw new Error("Repository should not be called by the coordinator test.");
  },

  async reconcileOrderStateToFulfilled() {
    throw new Error("Repository should not be called by the coordinator test.");
  },
};

const auditStore: ActionExecutionAuditStore = {
  async save() {
    throw new Error(
      "Audit store should not be called by the coordinator test.",
    );
  },

  async get() {
    return null;
  },

  async listByOrderId() {
    return [];
  },
};

function createRemediation(): RemediationRun {
  return {
    id: "REM-AUTO-1",

    orderId: "ORD-1001",

    automationRunId: "AUTO-1",

    investigationRunId: "INV-AUTO-1",

    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",

      summary: "Reconcile the stale order state.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile the stale completed order.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],
    },

    retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],

    startedAt: "2026-09-22T15:00:00.000Z",

    updatedAt: "2026-09-22T15:01:00.000Z",

    failureReason: null,
  };
}

async function createExecutingState(args: {
  automationStore: InMemoryAutomationStore;

  remediationStore: InMemoryRemediationStore;
}) {
  let run = createAutomationRun({
    id: "AUTO-1",

    orderId: "ORD-1001",
  });

  run = transitionAutomationRun(run, "INVESTIGATING");

  run = {
    ...run,

    investigationRunId: "INV-AUTO-1",
  };

  run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

  run = {
    ...run,

    remediationRunId: "REM-AUTO-1",
  };

  run = transitionAutomationRun(run, "EXECUTING");

  await args.automationStore.save(run);

  await args.remediationStore.save(createRemediation());
}

describe("executeAutomationAction", () => {
  it("moves an executed reconcile action to VERIFYING", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createExecutingState({
      automationStore,
      remediationStore,
    });

    const executeReconcile = vi.fn<typeof executeAuditedReconcileOrderState>(
      async () => ({
        executionId: "ACT-1",

        result: {
          status: "EXECUTED",

          previousStatus: "PROCESSING",

          currentStatus: "FULFILLED",
        },
      }),
    );

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,

      auditStore,

      executeReconcile,
    });

    expect(result.status).toBe("VERIFYING");

    expect(result.run.status).toBe("VERIFYING");

    expect(result.run.actionExecutionId).toBe("ACT-1");

    expect(executeReconcile).toHaveBeenCalledWith({
      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason:
          "Grounded remediation requires reconciling the stale order state.",
      },

      repository,

      auditStore,

      initiatedBy: {
        type: "SYSTEM",

        id: "AUTO-1",
      },
    });
  });

  it("moves an idempotent no-op to VERIFYING", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createExecutingState({
      automationStore,
      remediationStore,
    });

    const executeReconcile = vi.fn<typeof executeAuditedReconcileOrderState>(
      async () => ({
        executionId: "ACT-2",

        result: {
          status: "NO_OP",

          reason: "Order is already FULFILLED.",
        },
      }),
    );

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,

      auditStore,

      executeReconcile,
    });

    expect(result.status).toBe("VERIFYING");

    expect(result.run.actionExecutionId).toBe("ACT-2");
  });

  it("escalates when fresh execution-time state blocks the action", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createExecutingState({
      automationStore,
      remediationStore,
    });

    const executeReconcile = vi.fn<typeof executeAuditedReconcileOrderState>(
      async () => ({
        executionId: "ACT-3",

        result: {
          status: "BLOCKED_BY_CURRENT_STATE",

          reason:
            "The action is not safe to execute against the current system state.",

          validationReasons: ["Account delivery is no longer confirmed."],
        },
      }),
    );

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,

      auditStore,

      executeReconcile,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",

        executionId: "ACT-3",

        run: expect.objectContaining({
          status: "ESCALATED",

          actionExecutionId: "ACT-3",
        }),
      }),
    );
  });

  it("marks the automation FAILED when execution throws", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createExecutingState({
      automationStore,
      remediationStore,
    });

    const executeReconcile = vi.fn<typeof executeAuditedReconcileOrderState>(
      async () => {
        throw new Error("Database unavailable.");
      },
    );

    await expect(
      executeAutomationAction({
        automationRunId: "AUTO-1",

        automationStore,

        remediationStore,

        repository,

        auditStore,

        executeReconcile,
      }),
    ).rejects.toThrow("Database unavailable.");

    await expect(automationStore.get("AUTO-1")).resolves.toMatchObject({
      status: "FAILED",

      failureReason: "Database unavailable.",
    });
  });

  it("executes an approved fulfillment-attempt action and moves to VERIFYING", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    let run = createAutomationRun({
      id: "AUTO-1",
      orderId: "ORD-2001",
    });

    run = transitionAutomationRun(run, "INVESTIGATING");

    run = {
      ...run,
      investigationRunId: "INV-AUTO-1",
    };

    run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

    run = {
      ...run,
      remediationRunId: "REM-AUTO-1",
      approvalId: "APR-AUTO-1",
    };

    run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL");

    run = transitionAutomationRun(run, "EXECUTING");

    await automationStore.save(run);

    await remediationStore.save({
      id: "REM-AUTO-1",

      orderId: "ORD-2001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      status: "COMPLETED",

      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "The prior fulfillment attempt definitively failed.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "CREATE_FULFILLMENT_ATTEMPT",

            instruction: "Create a replacement fulfillment attempt.",

            supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

      startedAt: "2026-09-22T15:00:00.000Z",

      updatedAt: "2026-09-22T15:01:00.000Z",

      failureReason: null,
    });

    const approvalStore: ApprovalStore = {
      async save() {},
      async get() {
        return null;
      },
      async listByOrderId() {
        return [];
      },
    };

    const fulfillmentRepository = {
      ...repository,

      async createFulfillmentAttempt() {
        throw new Error(
          "Repository should not be called by the coordinator test.",
        );
      },
    };

    const executeCreateFulfillmentAttempt = vi.fn<
      typeof executeAuditedCreateFulfillmentAttempt
    >(async () => ({
      executionId: "ACT-FUL-1",

      result: {
        status: "EXECUTED",

        attemptId: "FUL-NEW-1",

        attemptStatus: "PENDING",
      },
    }));

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository: fulfillmentRepository,

      auditStore,

      approvalStore,

      executeCreateFulfillmentAttempt,
    });

    expect(result.status).toBe("VERIFYING");

    expect(result.run.status).toBe("VERIFYING");

    expect(result.run.actionExecutionId).toBe("ACT-FUL-1");

    expect(executeCreateFulfillmentAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          kind: "CREATE_FULFILLMENT_ATTEMPT",

          orderId: "ORD-2001",

          reason:
            "Grounded remediation requires creating a new fulfillment attempt.",
        },

        approvalId: "APR-AUTO-1",

        approvalStore,

        repository: fulfillmentRepository,

        auditStore,

        initiatedBy: {
          type: "SYSTEM",

          id: "AUTO-1",
        },
      }),
    );
  });

  it("recovers a completed consumed execution without replaying the fulfillment write", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    let run = createAutomationRun({
      id: "AUTO-1",
      orderId: "ORD-2001",
    });

    run = transitionAutomationRun(run, "INVESTIGATING");

    run = {
      ...run,
      investigationRunId: "INV-AUTO-1",
    };

    run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

    run = {
      ...run,
      remediationRunId: "REM-AUTO-1",
      approvalId: "APR-AUTO-1",
    };

    run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL");

    run = transitionAutomationRun(run, "EXECUTING");

    await automationStore.save(run);

    await remediationStore.save({
      id: "REM-AUTO-1",

      orderId: "ORD-2001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      status: "COMPLETED",

      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Previous fulfillment definitively failed.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "CREATE_FULFILLMENT_ATTEMPT",

            instruction: "Create another attempt after approval.",

            supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

      startedAt: "2026-09-22T18:00:00.000Z",

      updatedAt: "2026-09-22T18:01:00.000Z",

      failureReason: null,
    });

    const action = {
      kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

      orderId: "ORD-2001",

      reason:
        "Grounded remediation requires creating a new fulfillment attempt.",
    };

    const approved = decideApproval({
      approval: createPendingApproval({
        id: "APR-AUTO-1",

        action,
      }),

      decision: "APPROVE",

      decidedBy: "admin-1",
    });

    const consumed = consumeApproval({
      approval: approved,

      executionId: "ACT-RECOVERED-1",
    });

    const approvalStore = {
      async save() {},

      async get() {
        return structuredClone(consumed);
      },

      async listByOrderId() {
        return [structuredClone(consumed)];
      },
    };

    const auditStore = new InMemoryActionExecutionAuditStore();

    await auditStore.save({
      id: "ACT-RECOVERED-1",

      action,

      initiatedBy: {
        type: "SYSTEM",

        id: "AUTO-1",
      },

      approvalId: "APR-AUTO-1",

      status: "EXECUTED",

      startedAt: "2026-09-22T18:05:00.000Z",

      completedAt: "2026-09-22T18:05:01.000Z",

      reason: "Created fulfillment attempt FUL-NEW-1 with status PENDING.",

      validationReasons: [],

      error: null,

      effect: {
        kind: "FULFILLMENT_ATTEMPT_CREATED",

        attemptId: "FUL-NEW-1",

        attemptStatus: "PENDING",
      },
    });

    const repository = new InMemoryActionExecutionRepository([
      {
        order: {
          id: "ORD-2001",
          status: "PROCESSING",
        },

        payments: [
          {
            status: "CAPTURED",
          },
        ],

        fulfillmentAttempts: [
          {
            id: "FUL-OLD-1",
            status: "CONFIRMED_FAILED",
          },

          {
            id: "FUL-NEW-1",
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

    const createFulfillmentAttemptSpy = vi
      .spyOn(repository, "createFulfillmentAttempt")
      .mockRejectedValue(
        new Error("Recovered execution must not perform another write."),
      );

    const executeCreateFulfillmentAttempt = vi.fn<
      typeof executeAuditedCreateFulfillmentAttempt
    >(async () => {
      throw new Error(
        "Recovered execution must not invoke the audited executor.",
      );
    });

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,

      auditStore,

      approvalStore,

      executeCreateFulfillmentAttempt,
    });

    expect(result.status).toBe("VERIFYING");

    expect(result.run.status).toBe("VERIFYING");

    expect(result.run.actionExecutionId).toBe("ACT-RECOVERED-1");

    expect(createFulfillmentAttemptSpy).not.toHaveBeenCalled();

    expect(executeCreateFulfillmentAttempt).not.toHaveBeenCalled();

    expect(executeCreateFulfillmentAttempt).not.toHaveBeenCalled();
  });

  it("escalates an ambiguous consumed execution without replaying the fulfillment write", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    let run = createAutomationRun({
      id: "AUTO-1",
      orderId: "ORD-2001",
    });

    run = transitionAutomationRun(run, "INVESTIGATING");

    run = {
      ...run,
      investigationRunId: "INV-AUTO-1",
    };

    run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

    run = {
      ...run,
      remediationRunId: "REM-AUTO-1",
      approvalId: "APR-AUTO-1",
    };

    run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL");

    run = transitionAutomationRun(run, "EXECUTING");

    await automationStore.save(run);

    await remediationStore.save({
      id: "REM-AUTO-1",

      orderId: "ORD-2001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      status: "COMPLETED",

      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Previous fulfillment definitively failed.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "CREATE_FULFILLMENT_ATTEMPT",

            instruction: "Create another attempt after approval.",

            supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

      startedAt: "2026-09-22T18:00:00.000Z",

      updatedAt: "2026-09-22T18:01:00.000Z",

      failureReason: null,
    });

    const action = {
      kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

      orderId: "ORD-2001",

      reason:
        "Grounded remediation requires creating a new fulfillment attempt.",
    };

    const approved = decideApproval({
      approval: createPendingApproval({
        id: "APR-AUTO-1",

        action,
      }),

      decision: "APPROVE",

      decidedBy: "admin-1",
    });

    const consumed = consumeApproval({
      approval: approved,

      executionId: "ACT-AMBIGUOUS-1",
    });

    const approvalStore: ApprovalStore = {
      async save() {},

      async get() {
        return structuredClone(consumed);
      },

      async listByOrderId() {
        return [structuredClone(consumed)];
      },
    };

    const auditStore = new InMemoryActionExecutionAuditStore();

    await auditStore.save({
      id: "ACT-AMBIGUOUS-1",

      action,

      initiatedBy: {
        type: "SYSTEM",

        id: "AUTO-1",
      },

      approvalId: "APR-AUTO-1",

      status: "STARTED",

      startedAt: "2026-09-22T18:05:00.000Z",

      completedAt: null,

      reason: null,

      validationReasons: [],

      error: null,

      effect: null,
    });

    const repository = new InMemoryActionExecutionRepository([
      {
        order: {
          id: "ORD-2001",
          status: "PROCESSING",
        },

        payments: [
          {
            status: "CAPTURED",
          },
        ],

        fulfillmentAttempts: [
          {
            id: "FUL-OLD-1",
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

    const createFulfillmentAttemptSpy = vi
      .spyOn(repository, "createFulfillmentAttempt")
      .mockRejectedValue(
        new Error(
          "Ambiguous execution must not perform another fulfillment write.",
        ),
      );

    const executeCreateFulfillmentAttempt = vi.fn<
      typeof executeAuditedCreateFulfillmentAttempt
    >(async () => {
      throw new Error(
        "Ambiguous execution must not invoke the audited executor.",
      );
    });

    const result = await executeAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,

      auditStore,

      approvalStore,

      executeCreateFulfillmentAttempt,
    });

    expect(result.status).toBe("ESCALATED");

    expect(result.run.status).toBe("ESCALATED");

    expect(result.run.actionExecutionId).toBe("ACT-AMBIGUOUS-1");

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",

        executionId: "ACT-AMBIGUOUS-1",

        reason:
          "Execution ACT-AMBIGUOUS-1 is incomplete after its approval was consumed; the side-effect outcome must be reconciled before any retry.",
      }),
    );

    expect(createFulfillmentAttemptSpy).not.toHaveBeenCalled();

    expect(executeCreateFulfillmentAttempt).not.toHaveBeenCalled();
  });

  it("executes a notification retry and moves the automation to VERIFYING", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();

    let run = createAutomationRun({
      id: "AUTO-NOT-1",
      orderId: "ORD-NOT-1",
    });

    run = transitionAutomationRun(run, "INVESTIGATING");

    run = {
      ...run,
      investigationRunId: "INV-AUTO-NOT-1",
    };

    run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

    run = {
      ...run,
      remediationRunId: "REM-AUTO-NOT-1",
    };

    run = transitionAutomationRun(run, "EXECUTING");

    await automationStore.save(run);

    await remediationStore.save({
      id: "REM-AUTO-NOT-1",
      orderId: "ORD-NOT-1",
      automationRunId: "AUTO-NOT-1",
      investigationRunId: "INV-AUTO-NOT-1",
      status: "COMPLETED",

      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Delivery succeeded but the customer notification failed.",

        actions: [
          {
            disposition: "PRIMARY",
            actionKind: "RETRY_NOTIFICATION",
            instruction: "Retry the failed customer notification.",
            supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],

      startedAt: "2026-09-22T18:00:00.000Z",
      updatedAt: "2026-09-22T18:01:00.000Z",
      failureReason: null,
    });

    const notificationRepository = {
      ...repository,

      async retryNotification() {
        throw new Error(
          "Repository should not be called directly by the coordinator test.",
        );
      },
    };

    const executeRetryNotification = vi.fn<
      typeof executeAuditedRetryNotification
    >(async () => ({
      executionId: "ACT-NOT-1",

      result: {
        status: "EXECUTED",
        notificationId: "NOT-RETRY-1",
        notificationStatus: "PENDING",
      },
    }));

    const result = await executeAutomationAction({
      automationRunId: "AUTO-NOT-1",

      automationStore,

      remediationStore,

      repository: notificationRepository,

      auditStore,

      executeRetryNotification,
    });

    expect(result.status).toBe("VERIFYING");

    expect(result.run.status).toBe("VERIFYING");

    expect(result.run.actionExecutionId).toBe("ACT-NOT-1");

    expect(executeRetryNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          kind: "RETRY_NOTIFICATION",
          orderId: "ORD-NOT-1",
          reason:
            "Grounded remediation requires retrying the failed customer notification.",
        },

        repository: notificationRepository,

        auditStore,

        initiatedBy: {
          type: "SYSTEM",
          id: "AUTO-NOT-1",
        },
      }),
    );
  });
});
