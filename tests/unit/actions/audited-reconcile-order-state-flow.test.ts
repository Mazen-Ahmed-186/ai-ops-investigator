import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { executeAuditedReconcileOrderState } from "../../../src/actions/execute-audited-reconcile-order-state.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

describe("audited reconcile order state flow", () => {
  it("records executed and idempotent no-op attempts", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const action = {
      kind: "RECONCILE_ORDER_STATE" as const,

      orderId: "ORD-1001",

      reason:
        "Successful delivery completed, but the final FULFILLED transition was not persisted.",
    };

    const first = await executeAuditedReconcileOrderState({
      action,

      repository,

      auditStore,

      initiatedBy: {
        type: "AGENT",

        id: "RUN-INVESTIGATION-1",
      },
    });

    expect(first.result.status).toBe("EXECUTED");

    const firstAudit = await auditStore.get(first.executionId);

    expect(firstAudit).toMatchObject({
      action,

      initiatedBy: {
        type: "AGENT",

        id: "RUN-INVESTIGATION-1",
      },

      approvalId: null,

      status: "EXECUTED",

      validationReasons: [],

      error: null,

      effect: {
        kind: "ORDER_STATE_RECONCILED",

        previousStatus: "PROCESSING",

        currentStatus: "FULFILLED",
      },
    });

    expect(firstAudit?.completedAt).not.toBeNull();

    const second = await executeAuditedReconcileOrderState({
      action,

      repository,

      auditStore,

      initiatedBy: {
        type: "AGENT",

        id: "RUN-INVESTIGATION-2",
      },
    });

    expect(second.result.status).toBe("NO_OP");

    const secondAudit = await auditStore.get(second.executionId);

    expect(secondAudit).toMatchObject({
      status: "NO_OP",

      reason: "Order is already FULFILLED.",

      effect: null,
    });

    const history = await auditStore.listByOrderId("ORD-1001");

    expect(history).toHaveLength(2);

    expect(history.map((record) => record.status)).toEqual([
      "EXECUTED",
      "NO_OP",
    ]);
  });

  it("audits an action that is blocked before mutation", async () => {
    const fixture = createOrder1001ActionFixture();

    fixture.accountDeliveries = [
      {
        status: "FAILED",
      },
    ];

    const repository = new InMemoryActionExecutionRepository([fixture]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const execution = await executeAuditedReconcileOrderState({
      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Attempt reconciliation.",
      },

      repository,

      auditStore,

      initiatedBy: {
        type: "AGENT",

        id: "RUN-1",
      },
    });

    expect(execution.result.status).toBe("BLOCKED_BY_CURRENT_STATE");

    const audit = await auditStore.get(execution.executionId);

    expect(audit).toMatchObject({
      status: "BLOCKED_BY_CURRENT_STATE",

      validationReasons: ["Account delivery must currently be delivered."],

      effect: null,
    });

    expect(repository.getOrderStatus("ORD-1001")).toBe("PROCESSING");
  });
});
