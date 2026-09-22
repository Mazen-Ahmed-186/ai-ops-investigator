import { describe, expect, it } from "vitest";

import { evaluateActionPolicy } from "../../../src/actions/policy.js";

describe("evaluateActionPolicy", () => {
  it("allows order-state reconciliation", () => {
    expect(
      evaluateActionPolicy({
        kind: "RECONCILE_ORDER_STATE",
        orderId: "ORD-1001",
        reason:
          "Delivery succeeded but the final status transition was not persisted.",
      }),
    ).toEqual({
      decision: "ALLOW",
      reason:
        "Order-state reconciliation may proceed when deterministic execution-time invariants are satisfied.",
    });
  });

  it("allows notification retry", () => {
    expect(
      evaluateActionPolicy({
        kind: "RETRY_NOTIFICATION",
        orderId: "ORD-1001",
        reason: "Customer email notification failed.",
      }).decision,
    ).toBe("ALLOW");
  });

  it("requires approval for another fulfillment attempt", () => {
    expect(
      evaluateActionPolicy({
        kind: "CREATE_FULFILLMENT_ATTEMPT",
        orderId: "ORD-1001",
        reason: "Attempt another fulfillment.",
      }).decision,
    ).toBe("REQUIRE_APPROVAL");
  });

  it("requires approval for refunds", () => {
    expect(
      evaluateActionPolicy({
        kind: "ISSUE_REFUND",
        orderId: "ORD-1001",
        reason: "Refund the captured payment.",
      }).decision,
    ).toBe("REQUIRE_APPROVAL");
  });

  it("denies cancellation", () => {
    expect(
      evaluateActionPolicy({
        kind: "CANCEL_ORDER",
        orderId: "ORD-1001",
        reason: "Cancel the order.",
      }).decision,
    ).toBe("DENY");
  });
});
