import { describe, expect, it } from "vitest";

import { resolveInvestigationModelInput } from "../../../src/investigations/resolve-model-input.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

function createPostCrashState(): InvestigationRunState {
  return {
    id: "RUN-CRASH-1",

    orderId: "ORD-1001",

    goal: "Determine why order ORD-1001 is stuck.",

    status: "RUNNING",

    workingMemory: {
      facts: [],
      unresolvedQuestions: [],
    },

    startedAt: "2026-09-23T16:00:00.000Z",

    updatedAt: "2026-09-23T16:00:10.000Z",

    toolCalls: 1,

    executedToolCallSignatures: [
      JSON.stringify({
        name: "get_order",

        arguments: {
          orderId: "ORD-1001",
        },
      }),
    ],

    toolExecutions: [
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

            observedAt: "2026-09-23T16:00:09.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:09.001Z",
      },
    ],

    continuation: {
      kind: "TOOL_OUTPUT",

      previousResponseId: "resp-before-crash",

      callId: "call-before-crash",

      output: '{"ok":true}',
    },

    assessment: null,

    failureReason: null,
  };
}

describe("resolveInvestigationModelInput", () => {
  it("uses provider continuation during uninterrupted execution", () => {
    const state = createPostCrashState();

    const result = resolveInvestigationModelInput(state, "NEW");

    expect(result.previousResponseId).toBe("resp-before-crash");

    expect(result.input).toEqual([
      {
        type: "function_call_output",

        call_id: "call-before-crash",

        output: '{"ok":true}',
      },
    ]);
  });

  it("discards the provider response id and reconstructs context after a crash", () => {
    const state = createPostCrashState();

    const result = resolveInvestigationModelInput(state, "RESUME");

    expect(result.previousResponseId).toBeNull();

    expect(typeof result.input).toBe("string");

    if (typeof result.input !== "string") {
      throw new Error("Expected reconstructed resume context to be a string.");
    }

    expect(result.input).toContain("Projected observations:");

    expect(result.input).toContain(
      "[OBSERVATION] [tool:get_order] [observedAt=2026-09-23T16:00:09.000Z] Order ORD-1001 status is PROCESSING.",
    );

    expect(result.input).not.toContain("resp-before-crash");

    expect(result.input).not.toContain("call-before-crash");
  });

  it("starts a new investigation without a provider continuation id", () => {
    const state = createPostCrashState();

    state.toolCalls = 0;

    state.executedToolCallSignatures = [];

    state.toolExecutions = [];

    state.continuation = {
      kind: "INITIAL",

      prompt: "Why is order ORD-1001 stuck?",
    };

    const result = resolveInvestigationModelInput(state, "NEW");

    expect(result.previousResponseId).toBeNull();

    expect(result.input).toBe("Why is order ORD-1001 stuck?");
  });
});
