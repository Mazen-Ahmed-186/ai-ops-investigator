import { describe, expect, it } from "vitest";

import {
  createPendingApproval,
  type ActionApproval,
} from "../../../src/actions/approval.js";
import type { ActionExecutionContext } from "../../../src/actions/execution-context.js";
import { evaluateActionGate } from "../../../src/actions/evaluate-action-gate.js";

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

function createApprovedFulfillmentApproval(
  overrides: Partial<ActionApproval> = {},
): ActionApproval {
  const approval = createPendingApproval({
    id: "APR-1",

    now: new Date("2026-09-21T12:00:00.000Z"),

    ttlMs: 15 * 60 * 1000,

    action: {
      kind: "CREATE_FULFILLMENT_ATTEMPT",

      orderId: "ORD-1001",

      reason: "Retry fulfillment.",
    },
  });

  return {
    ...approval,

    status: "APPROVED",

    resolvedAt: "2026-09-21T12:01:00.000Z",

    resolvedBy: "admin-1",

    ...overrides,
  };
}

describe("evaluateActionGate", () => {
  it("allows actions that do not require approval when current state is valid", () => {
    const result = evaluateActionGate({
      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Order completion was not persisted.",
      },

      context: createContext(),
    });

    expect(result.status).toBe("READY_TO_EXECUTE");
  });

  it("requires approval when none exists", () => {
    const result = evaluateActionGate({
      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Retry fulfillment.",
      },

      context: createContext(),
    });

    expect(result.status).toBe("PENDING_APPROVAL");
  });

  it("allows an approved action when state remains safe", () => {
    const result = evaluateActionGate({
      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Retry fulfillment.",
      },

      context: createContext({
        fulfillmentSucceeded: false,

        entitlementActive: false,

        accountDeliveryDelivered: false,
      }),

      approval: createApprovedFulfillmentApproval(),

      now: new Date("2026-09-21T12:02:00.000Z"),
    });

    expect(result.status).toBe("READY_TO_EXECUTE");
  });

  it("blocks an approved action when current state changed", () => {
    const result = evaluateActionGate({
      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Retry fulfillment.",
      },

      context: createContext({
        fulfillmentSucceeded: false,

        entitlementActive: false,

        accountDeliveryDelivered: false,

        hasBlockingFulfillmentAttempt: true,
      }),

      approval: createApprovedFulfillmentApproval(),

      now: new Date("2026-09-21T12:02:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED_BY_CURRENT_STATE");
  });

  it("returns rejected rather than pending for rejected approval", () => {
    const approval = createApprovedFulfillmentApproval({
      status: "REJECTED",

      resolvedAt: "2026-09-21T12:01:00.000Z",

      resolvedBy: "admin-1",
    });

    const result = evaluateActionGate({
      action: approval.action,

      context: createContext(),

      approval,

      now: new Date("2026-09-21T12:02:00.000Z"),
    });

    expect(result.status).toBe("APPROVAL_REJECTED");
  });

  it("returns expired when approval validity has elapsed", () => {
    const approval = createPendingApproval({
      id: "APR-2",

      now: new Date("2026-09-21T12:00:00.000Z"),

      ttlMs: 60_000,

      action: {
        kind: "ISSUE_REFUND",

        orderId: "ORD-1001",

        reason: "Refund customer.",
      },
    });

    const result = evaluateActionGate({
      action: approval.action,

      context: createContext(),

      approval,

      now: new Date("2026-09-21T12:02:00.000Z"),
    });

    expect(result.status).toBe("APPROVAL_EXPIRED");
  });

  it("rejects approval reuse for a different action", () => {
    const approval = createApprovedFulfillmentApproval();

    const result = evaluateActionGate({
      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason: "Different retry reason.",
      },

      context: createContext(),

      approval,

      now: new Date("2026-09-21T12:02:00.000Z"),
    });

    expect(result).toEqual({
      status: "DENIED",

      reason: "The supplied approval does not match the requested action.",
    });
  });

  it("denies actions prohibited by policy", () => {
    const result = evaluateActionGate({
      action: {
        kind: "CANCEL_ORDER",

        orderId: "ORD-1001",

        reason: "Cancel order.",
      },

      context: createContext(),
    });

    expect(result.status).toBe("DENIED");
  });
});
