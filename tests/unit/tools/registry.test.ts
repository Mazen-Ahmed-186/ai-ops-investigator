import { describe, expect, it } from "vitest";

import { executeRegisteredTool } from "../../../src/tools/registry.js";

describe("executeRegisteredTool", () => {
  it("dispatches a registered tool", () => {
    const result = executeRegisteredTool("get_order", {
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invalid tool arguments", () => {
    const result = executeRegisteredTool("get_order", {
      orderId: null,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TOOL_ARGUMENT_VALIDATION_FAILED",
        category: "VALIDATION",
        retryable: false,
        message: "Arguments for get_order did not match the required schema.",
      },
    });
  });

  it("rejects an unregistered tool", () => {
    const result = executeRegisteredTool("delete_everything", {});

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TOOL_NOT_REGISTERED",
        category: "VALIDATION",
        retryable: false,
        message: "Tool delete_everything is not registered.",
      },
    });
  });
});
