import { describe, expect, it } from "vitest";

import { executeGetPaymentState } from "../../../src/tools/get-payment-state.tool.js";

describe("executeGetPaymentState", () => {
  it("returns payment state for an existing order", () => {
    const result = executeGetPaymentState({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_payment_state to succeed");
    }

    expect(result.data.payments).toEqual([
      {
        id: "PAY-1001",
        orderId: "ORD-1001",
        status: "CAPTURED",
        amount: 50,
        currency: "USD",
        updatedAt: "2026-09-16T09:01:00.000Z",
      },
    ]);
  });
});
