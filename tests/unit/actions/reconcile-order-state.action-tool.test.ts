import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { createReconcileOrderStateActionTool } from "../../../src/actions/reconcile-order-state.action-tool.js";

function createTool() {
  const repository = new InMemoryActionExecutionRepository([
    createOrder1001ActionFixture(),
  ]);

  const auditStore = new InMemoryActionExecutionAuditStore();

  const tool = createReconcileOrderStateActionTool({
    repository,

    auditStore,

    initiatedBy: {
      type: "AGENT",

      id: "RUN-REMEDIATION-1",
    },
  });

  return {
    tool,
    repository,
    auditStore,
  };
}

describe("reconcile_order_state action tool", () => {
  it("declares its write and idempotency semantics", () => {
    const { tool } = createTool();

    expect(tool.annotations).toEqual({
      readOnly: false,
      destructive: false,
      idempotent: true,
    });
  });

  it("executes through the audited action path", async () => {
    const { tool, repository, auditStore } = createTool();

    const result = await tool.execute({
      orderId: "ORD-1001",

      reason:
        "Delivery completed but the final order-state transition was not persisted.",
    });

    expect(result.status).toBe("EXECUTED");

    expect(repository.getOrderStatus("ORD-1001")).toBe("FULFILLED");

    const audit = await auditStore.get(result.executionId);

    expect(audit).toMatchObject({
      initiatedBy: {
        type: "AGENT",
        id: "RUN-REMEDIATION-1",
      },

      status: "EXECUTED",

      action: {
        kind: "RECONCILE_ORDER_STATE",
        orderId: "ORD-1001",
      },

      effect: {
        kind: "ORDER_STATE_RECONCILED",
        previousStatus: "PROCESSING",
        currentStatus: "FULFILLED",
      },
    });
  });

  it("is idempotent when invoked again", async () => {
    const { tool, auditStore } = createTool();

    const input = {
      orderId: "ORD-1001",

      reason:
        "Delivery completed but the final order-state transition was not persisted.",
    };

    const first = await tool.execute(input);

    const second = await tool.execute(input);

    expect(first.status).toBe("EXECUTED");

    expect(second.status).toBe("NO_OP");

    expect(second.executionId).not.toBe(first.executionId);

    const secondAudit = await auditStore.get(second.executionId);

    expect(secondAudit).toMatchObject({
      status: "NO_OP",
      effect: null,
    });
  });

  it("returns a safe business outcome when current state blocks execution", async () => {
    const fixture = createOrder1001ActionFixture();

    fixture.accountDeliveries = [
      {
        status: "FAILED",
      },
    ];

    const repository = new InMemoryActionExecutionRepository([fixture]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const tool = createReconcileOrderStateActionTool({
      repository,

      auditStore,

      initiatedBy: {
        type: "AGENT",

        id: "RUN-1",
      },
    });

    const result = await tool.execute({
      orderId: "ORD-1001",

      reason: "Attempt stale-state reconciliation.",
    });

    expect(result).toMatchObject({
      status: "BLOCKED_BY_CURRENT_STATE",

      validationReasons: ["Account delivery must currently be delivered."],
    });

    expect(repository.getOrderStatus("ORD-1001")).toBe("PROCESSING");
  });

  it("rejects invalid model arguments before execution", async () => {
    const { tool } = createTool();

    await expect(
      tool.execute({
        orderId: "",
        reason: "",
      }),
    ).rejects.toThrow();
  });
});
