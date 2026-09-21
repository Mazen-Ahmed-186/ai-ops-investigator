import { describe, expect, it } from "vitest";

import { executeSearchRunbooks } from "../../../src/tools/search-runbooks.tool.js";

describe("executeSearchRunbooks", () => {
  it("returns relevant operational runbooks", () => {
    const result = executeSearchRunbooks({
      query: "database timeout after successful order delivery",
      limit: 2,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected search_runbooks to succeed");
    }

    expect(result.data.results[0]?.id).toBe("RUNBOOK-DB-TIMEOUT");
  });
});
