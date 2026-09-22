import { describe, expect, it } from "vitest";

import { searchRunbooks } from "../../../src/knowledge/search-runbooks.js";

describe("searchRunbooks", () => {
  it("retrieves the database-timeout runbook for a completion persistence failure", () => {
    const results = searchRunbooks(
      "order completion database timeout status update",
    );

    expect(results[0]?.section.id).toBe("RUNBOOK-DB-TIMEOUT");
  });

  it("does not return unrelated sections with zero overlap", () => {
    const results = searchRunbooks(
      "something completely unrelated zebra astronomy",
    );

    expect(results).toEqual([]);
  });

  it("retrieves the confirmed fulfillment failure runbook", () => {
    const results = searchRunbooks(
      "previous fulfillment attempt confirmed failed payment captured no entitlement no delivery create replacement fulfillment attempt",
    );

    expect(
      results.some(
        (result) =>
          result.section.id === "RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE",
      ),
    ).toBe(true);
  });
});
