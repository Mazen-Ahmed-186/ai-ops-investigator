import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { executeReconcileOrderState } from "../../../src/actions/execute-reconcile-order-state.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

describe("reconcile order state flow", () => {
  it("safely reconciles ORD-1001 and remains idempotent on replay", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const action = {
      kind: "RECONCILE_ORDER_STATE" as const,

      orderId: "ORD-1001",

      reason:
        "Successful delivery completed, but the final FULFILLED transition was not persisted.",
    };

    expect(repository.getOrderStatus("ORD-1001")).toBe("PROCESSING");

    const firstExecution = await executeReconcileOrderState({
      action,
      repository,
    });

    expect(firstExecution).toEqual({
      status: "EXECUTED",

      previousStatus: "PROCESSING",

      currentStatus: "FULFILLED",
    });

    expect(repository.getOrderStatus("ORD-1001")).toBe("FULFILLED");

    const secondExecution = await executeReconcileOrderState({
      action,
      repository,
    });

    expect(secondExecution).toEqual({
      status: "NO_OP",

      reason: "Order is already FULFILLED.",
    });

    expect(repository.getOrderStatus("ORD-1001")).toBe("FULFILLED");
  });
});
