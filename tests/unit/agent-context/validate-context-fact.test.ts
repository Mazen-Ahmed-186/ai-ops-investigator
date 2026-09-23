import { describe, expect, it } from "vitest";

import type { AgentContextFact } from "../../../src/agent-context/context-fact.js";
import { validateContextFact } from "../../../src/agent-context/validate-context-fact.js";

describe("validateContextFact", () => {
  it("accepts a timestamped tool observation", () => {
    const fact: AgentContextFact = {
      kind: "OBSERVATION",

      statement: "Payment PAY-1001 is CAPTURED.",

      source: {
        type: "TOOL",
        name: "get_payment_state",
      },

      observedAt: "2026-09-23T16:00:00.000Z",
    };

    expect(validateContextFact(fact)).toEqual([]);
  });

  it("rejects an observation without an observation timestamp", () => {
    const fact: AgentContextFact = {
      kind: "OBSERVATION",

      statement: "Payment PAY-1001 is CAPTURED.",

      source: {
        type: "TOOL",
        name: "get_payment_state",
      },

      observedAt: null,
    };

    expect(validateContextFact(fact)).toContain(
      "Observed context facts require an observation timestamp.",
    );
  });

  it("accepts runbook knowledge", () => {
    const fact: AgentContextFact = {
      kind: "KNOWLEDGE",

      statement:
        "Unknown fulfillment outcomes must be reconciled before retry.",

      source: {
        type: "RUNBOOK",
        id: "RUNBOOK-UNKNOWN-FULFILLMENT",
      },

      observedAt: null,
    };

    expect(validateContextFact(fact)).toEqual([]);
  });

  it("rejects knowledge that masquerades as a tool observation", () => {
    const fact: AgentContextFact = {
      kind: "KNOWLEDGE",

      statement:
        "Unknown fulfillment outcomes must be reconciled before retry.",

      source: {
        type: "TOOL",
        name: "get_fulfillment_attempts",
      },

      observedAt: "2026-09-23T16:00:00.000Z",
    };

    expect(validateContextFact(fact)).toContain(
      "Knowledge context facts must reference a runbook source.",
    );
  });

  it("accepts model inference only when labeled as model inference", () => {
    const fact: AgentContextFact = {
      kind: "INFERENCE",

      statement:
        "The database timeout likely prevented the final order transition from persisting.",

      source: {
        type: "MODEL",
      },

      observedAt: null,
    };

    expect(validateContextFact(fact)).toEqual([]);
  });
});
