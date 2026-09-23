import { describe, expect, it } from "vitest";

import { formatAgentContextFacts } from "../../../src/agent-context/format-context-facts.js";

describe("formatAgentContextFacts", () => {
  it("formats observations with source and observation time", () => {
    const result = formatAgentContextFacts([
      {
        kind: "OBSERVATION",

        statement: "Payment PAY-1001 status is CAPTURED.",

        source: {
          type: "TOOL",
          name: "get_payment_state",
        },

        observedAt: "2026-09-23T16:00:01.000Z",
      },
    ]);

    expect(result).toBe(
      "- [OBSERVATION] [tool:get_payment_state] [observedAt=2026-09-23T16:00:01.000Z] Payment PAY-1001 status is CAPTURED.",
    );
  });

  it("formats knowledge without pretending it is a timed observation", () => {
    const result = formatAgentContextFacts([
      {
        kind: "KNOWLEDGE",

        statement:
          "Unknown fulfillment outcomes must be reconciled before retry.",

        source: {
          type: "RUNBOOK",
          id: "RUNBOOK-UNKNOWN-FULFILLMENT",
        },

        observedAt: null,
      },
    ]);

    expect(result).toBe(
      "- [KNOWLEDGE] [runbook:RUNBOOK-UNKNOWN-FULFILLMENT] Unknown fulfillment outcomes must be reconciled before retry.",
    );
  });

  it("formats model inference distinctly from observed state", () => {
    const result = formatAgentContextFacts([
      {
        kind: "INFERENCE",

        statement:
          "The database timeout likely prevented the order transition from persisting.",

        source: {
          type: "MODEL",
        },

        observedAt: null,
      },
    ]);

    expect(result).toBe(
      "- [INFERENCE] [model] The database timeout likely prevented the order transition from persisting.",
    );
  });

  it("fails closed when given an invalid context fact", () => {
    expect(() =>
      formatAgentContextFacts([
        {
          kind: "OBSERVATION",

          statement: "Order ORD-1001 status is PROCESSING.",

          source: {
            type: "TOOL",
            name: "get_order",
          },

          observedAt: null,
        },
      ]),
    ).toThrow("Observed context facts require an observation timestamp.");
  });

  it("returns an explicit empty-state message", () => {
    expect(formatAgentContextFacts([])).toBe(
      "No projected context facts are available.",
    );
  });
});
