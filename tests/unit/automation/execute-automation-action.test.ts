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
});
