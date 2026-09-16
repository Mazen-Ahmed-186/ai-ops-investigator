import { describe, expect, it } from "vitest";

import { executeGetFulfillmentAttempts } from "../../../src/tools/get-fulfillment-attempts.tool.js";

describe("executeGetFulfillmentAttempts", () => {
  it("returns fulfillment attempts for an existing order", () => {
    const result = executeGetFulfillmentAttempts({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_fulfillment_attempts to succeed");
    }

    expect(result.data.attempts).toEqual([
      {
        id: "FUL-1001",
        orderId: "ORD-1001",
        status: "SUCCEEDED",
        source: "EXTERNAL_PROVIDER",
        updatedAt: "2026-09-16T09:03:00.000Z",
      },
    ]);

    expect(result.data.source).toBe("commerce_repository");

    expect(result.data.observedAt).toEqual(expect.any(String));
  });

  it("returns a structured not-found result for an unknown order", () => {
    const result = executeGetFulfillmentAttempts({
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
