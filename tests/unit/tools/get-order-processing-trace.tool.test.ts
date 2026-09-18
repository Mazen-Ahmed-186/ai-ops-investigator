import { describe, expect, it } from "vitest";

import { executeGetOrderProcessingTrace } from "../../../src/tools/get-order-processing-trace.tool.js";

describe("executeGetOrderProcessingTrace", () => {
  it("returns technical execution evidence for an order", () => {
    const result = executeGetOrderProcessingTrace({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_order_processing_trace to succeed");
    }

    expect(result.data.entries.map((entry) => entry.event)).toEqual([
      "ORDER_COMPLETION_HANDLER_STARTED",
      "ORDER_STATUS_UPDATE_ATTEMPTED",
      "DATABASE_TIMEOUT",
      "ORDER_COMPLETION_HANDLER_FAILED",
    ]);

    expect(result.data.source).toBe("application_trace");
  });
});
