import { describe, expect, it } from "vitest";

import { executeGetDeliveryState } from "../../../src/tools/get-delivery-state.tool.js";

describe("executeGetDeliveryState", () => {
  it("returns entitlement and account delivery state", () => {
    const result = executeGetDeliveryState({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_delivery_state to succeed");
    }

    expect(result.data.entitlements).toHaveLength(1);
    expect(result.data.entitlements[0]?.status).toBe("ACTIVE");

    expect(result.data.accountDeliveries).toHaveLength(1);

    expect(result.data.accountDeliveries[0]?.status).toBe("DELIVERED");
  });
});
