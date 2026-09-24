import { describe, expect, it } from "vitest";

import { formatToolExecutionSummary } from "../../../src/investigations/format-tool-execution-summary.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

describe("formatToolExecutionSummary", () => {
  it("summarizes successful executions without copying result payloads", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_order",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            order: {
              id: "ORD-1001",
              status: "PROCESSING",
              createdAt: "2026-09-16T09:00:00.000Z",
              updatedAt: "2026-09-16T09:05:00.000Z",
            },

            observedAt: "2026-09-23T16:00:00.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:00.001Z",
      },
    ];

    const result = formatToolExecutionSummary({
      toolExecutions,
    });

    expect(result).toBe(
      '- #1 get_order {"orderId":"ORD-1001"} -> SUCCEEDED at 2026-09-23T16:00:00.001Z',
    );

    expect(result).not.toContain("PROCESSING");

    expect(result).not.toContain("commerce_repository");
  });

  it("preserves failed execution history without inventing business state", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_order",

        arguments: {
          orderId: "ORD-404",
        },

        result: {
          ok: false,

          error: {
            category: "NOT_FOUND",
            message: "Order was not found.",
          },
        },

        executedAt: "2026-09-23T16:00:00.000Z",
      },
    ];

    expect(
      formatToolExecutionSummary({
        toolExecutions,
      }),
    ).toBe(
      '- #1 get_order {"orderId":"ORD-404"} -> FAILED(NOT_FOUND) at 2026-09-23T16:00:00.000Z',
    );
  });

  it("does not infer an outcome from an unrecognized persisted result", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_order",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          unexpected: true,
        },

        executedAt: "2026-09-23T16:00:00.000Z",
      },
    ];

    expect(
      formatToolExecutionSummary({
        toolExecutions,
      }),
    ).toBe(
      '- #1 get_order {"orderId":"ORD-1001"} -> UNRECOGNIZED_RESULT at 2026-09-23T16:00:00.000Z',
    );
  });
});
