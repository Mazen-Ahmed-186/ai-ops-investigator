import { describe, expect, it } from "vitest";

import { evaluateOrderInvariants } from "../../../src/domain/invariants.js";

describe("evaluateOrderInvariants", () => {
  it("detects an order that remains processing after successful delivery", () => {
    const findings = evaluateOrderInvariants("ORD-1001");

    expect(findings).toEqual([
      {
        code: "ORDER_STATE_INCONSISTENCY",
        message:
          "Order remains PROCESSING after successful fulfillment and account delivery.",
      },
    ]);
  });

  it("returns no findings for an unknown order", () => {
    expect(evaluateOrderInvariants("ORD-9999")).toEqual([]);
  });
});
