import { describe, expect, it } from "vitest";

import { executeGetOrder } from "../../../src/tools/get-order.tool.js";

describe("executeGetOrder", () => {
  it("returns the current order state", () => {
    const result = executeGetOrder({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_order to succeed");
    }

    expect(result.data.order).toEqual({
      id: "ORD-1001",
      status: "PROCESSING",
      createdAt: "2026-09-16T09:00:00.000Z",
      updatedAt: "2026-09-16T09:05:00.000Z",
    });

    expect(result.data.source).toBe("commerce_repository");

    expect(result.data.observedAt).toEqual(expect.any(String));
  });

  it("returns a structured not-found result", () => {
    const result = executeGetOrder({
      orderId: "ORD-9999",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ORDER_NOT_FOUND",
        category: "NOT_FOUND",
        retryable: false,
        message: "Order ORD-9999 was not found.",
      },
    });
  });
});
