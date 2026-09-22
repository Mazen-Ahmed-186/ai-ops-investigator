import { describe, expect, it } from "vitest";

import type { ActionExecutionContext } from "../../../src/actions/execution-context.js";
import { validateActionExecution } from "../../../src/actions/validate-action-execution.js";

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

describe("validateActionExecution", () => {
  it("allows reconciliation when completion invariants still hold", () => {
    const result = validateActionExecution(
      {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Completion transition was not persisted.",
      },

      createContext(),
    );

    expect(result).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it("blocks reconciliation when observed state has changed", () => {
    const result = validateActionExecution(
      {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Completion transition was not persisted.",
      },

      createContext({
        orderStatus: "FULFILLED",
      }),
    );

    expect(result.valid).toBe(false);

    expect(result.reasons).toContain("Order must currently be PROCESSING.");
  });

  it("blocks reconciliation when delivery is no longer confirmed", () => {
    const result = validateActionExecution(
      {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Completion transition was not persisted.",
      },

      createContext({
        accountDeliveryDelivered: false,
      }),
    );

    expect(result.valid).toBe(false);
  });

  it("allows notification retry only when delivery succeeded and notification failed", () => {
    const result = validateActionExecution(
      {
        kind: "RETRY_NOTIFICATION",

        orderId: "ORD-1001",

        reason: "Customer notification failed.",
      },

      createContext(),
    );

    expect(result.valid).toBe(true);
  });

  it("blocks notification retry when notification is no longer failed", () => {
    const result = validateActionExecution(
      {
        kind: "RETRY_NOTIFICATION",

        orderId: "ORD-1001",

        reason: "Customer notification failed.",
      },

      createContext({
        notificationFailed: false,
      }),
    );

    expect(result.valid).toBe(false);
  });

  it("blocks another fulfillment attempt while a blocking attempt exists", () => {
    const result = validateActionExecution(
      {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Try fulfillment again.",
      },

      createContext({
        fulfillmentSucceeded: false,

        entitlementActive: false,

        accountDeliveryDelivered: false,

        hasBlockingFulfillmentAttempt: true,
      }),
    );

    expect(result.valid).toBe(false);

    expect(result.reasons).toContain(
      "A blocking fulfillment attempt already exists.",
    );
  });

  it("allows fulfillment-attempt state validation when no blocking attempt exists", () => {
    const result = validateActionExecution(
      {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Try fulfillment again.",
      },

      createContext({
        fulfillmentSucceeded: false,

        entitlementActive: false,

        accountDeliveryDelivered: false,

        hasBlockingFulfillmentAttempt: false,
      }),
    );

    expect(result.valid).toBe(true);
  });

  it("blocks refund when business policy does not allow it", () => {
    const result = validateActionExecution(
      {
        kind: "ISSUE_REFUND",

        orderId: "ORD-1001",

        reason: "Refund the captured payment.",
      },

      createContext({
        refundAllowedByBusinessPolicy: false,
      }),
    );

    expect(result.valid).toBe(false);
  });

  it("blocks duplicate refund execution", () => {
    const result = validateActionExecution(
      {
        kind: "ISSUE_REFUND",

        orderId: "ORD-1001",

        reason: "Refund the captured payment.",
      },

      createContext({
        refundAlreadyIssued: true,
      }),
    );

    expect(result.valid).toBe(false);
  });
});
