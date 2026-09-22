import { describe, expect, it, vi } from "vitest";

import type {
  ActionExecutionRepository,
  ReconcileOrderStateWriteResult,
} from "../../../src/actions/action-execution-repository.js";
import type { ActionExecutionContext } from "../../../src/actions/execution-context.js";
import {
  executeReconcileOrderState,
  type ReconcileOrderStateAction,
} from "../../../src/actions/execute-reconcile-order-state.js";

function createContext(
  overrides: Partial<ActionExecutionContext> = {},
): ActionExecutionContext {
  return {
    orderStatus: "PROCESSING",

    paymentCaptured: true,

    fulfillmentSucceeded: true,

    entitlementActive: true,

    accountDeliveryDelivered: true,

    notificationFailed: true,

    hasBlockingFulfillmentAttempt: false,

    refundAllowedByBusinessPolicy: true,

    refundAlreadyIssued: false,

    ...overrides,
  };
}

function createAction(): ReconcileOrderStateAction {
  return {
    kind: "RECONCILE_ORDER_STATE",

    orderId: "ORD-1001",

    reason:
      "Successful delivery completed, but the final FULFILLED transition was not persisted.",
  };
}

function createRepository(args?: {
  context?: ActionExecutionContext | null;

  writeResult?: ReconcileOrderStateWriteResult;
}) {
  const getExecutionContext = vi.fn<
    ActionExecutionRepository["getExecutionContext"]
  >(async () => (args?.context === undefined ? createContext() : args.context));

  const reconcileOrderStateToFulfilled = vi.fn<
    ActionExecutionRepository["reconcileOrderStateToFulfilled"]
  >(
    async () =>
      args?.writeResult ?? {
        status: "UPDATED",

        previousStatus: "PROCESSING",

        currentStatus: "FULFILLED",
      },
  );

  const repository: ActionExecutionRepository = {
    getExecutionContext,

    reconcileOrderStateToFulfilled,
  };

  return {
    repository,

    getExecutionContext,

    reconcileOrderStateToFulfilled,
  };
}

describe("executeReconcileOrderState", () => {
  it("executes reconciliation when authorization and current state are valid", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository();

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result).toEqual({
      status: "EXECUTED",

      previousStatus: "PROCESSING",

      currentStatus: "FULFILLED",
    });

    expect(reconcileOrderStateToFulfilled).toHaveBeenCalledTimes(1);

    expect(reconcileOrderStateToFulfilled).toHaveBeenCalledWith("ORD-1001");
  });

  it("does not write when the order cannot be found", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository({
      context: null,
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result).toEqual({
      status: "NOT_FOUND",

      reason: "Order ORD-1001 was not found.",
    });

    expect(reconcileOrderStateToFulfilled).not.toHaveBeenCalled();
  });

  it("does not write when fresh state fails execution validation", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository({
      context: createContext({
        accountDeliveryDelivered: false,
      }),
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result.status).toBe("BLOCKED_BY_CURRENT_STATE");

    expect(reconcileOrderStateToFulfilled).not.toHaveBeenCalled();
  });

  it("returns no-op when the transactional write observes that reconciliation already happened", async () => {
    const { repository } = createRepository({
      writeResult: {
        status: "ALREADY_FULFILLED",
      },
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result).toEqual({
      status: "NO_OP",

      reason: "Order is already FULFILLED.",
    });
  });

  it("blocks execution when state changes between validation and the write boundary", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository({
      context: createContext(),

      writeResult: {
        status: "PRECONDITION_FAILED",

        reasons: ["Account delivery is no longer confirmed."],
      },
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(reconcileOrderStateToFulfilled).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      status: "BLOCKED_BY_CURRENT_STATE",

      reason:
        "The execution-time state changed before the write could be safely committed.",

      validationReasons: ["Account delivery is no longer confirmed."],
    });
  });

  it("does not write when payment is no longer captured", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository({
      context: createContext({
        paymentCaptured: false,
      }),
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result.status).toBe("BLOCKED_BY_CURRENT_STATE");

    expect(reconcileOrderStateToFulfilled).not.toHaveBeenCalled();
  });

  it("returns no-op without writing when the initial read is already fulfilled", async () => {
    const { repository, reconcileOrderStateToFulfilled } = createRepository({
      context: createContext({
        orderStatus: "FULFILLED",
      }),
    });

    const result = await executeReconcileOrderState({
      action: createAction(),

      repository,
    });

    expect(result).toEqual({
      status: "NO_OP",

      reason: "Order is already FULFILLED.",
    });

    expect(reconcileOrderStateToFulfilled).not.toHaveBeenCalled();
  });
});
