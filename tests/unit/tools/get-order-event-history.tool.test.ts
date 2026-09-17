import { describe, expect, it } from "vitest";

import { executeGetOrderEventHistory } from "../../../src/tools/get-order-event-history.tool.js";

describe("executeGetOrderEventHistory", () => {
  it("returns chronological business event history", () => {
    const result = executeGetOrderEventHistory({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_order_event_history to succeed");
    }

    expect(result.data.events.map((event) => event.type)).toEqual([
      "ORDER_CREATED",
      "PAYMENT_CAPTURED",
      "FULFILLMENT_STARTED",
      "FULFILLMENT_SUCCEEDED",
      "ENTITLEMENT_DELIVERED",
      "NOTIFICATION_FAILED",
    ]);

    expect(
      result.data.events.some((event) => event.type === "ORDER_FULFILLED"),
    ).toBe(false);
  });
});
