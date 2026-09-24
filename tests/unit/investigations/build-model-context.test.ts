import { describe, expect, it } from "vitest";

import { buildReconstructedInvestigationInput } from "../../../src/investigations/build-model-context.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";
import { formatAgentContextFacts } from "../../../src/agent-context/format-context-facts.js";
import { projectInvestigationObservationFacts } from "../../../src/agent-context/project-investigation-observations.js";
import { formatToolExecutionSummary } from "../../../src/investigations/format-tool-execution-summary.js";

describe("buildReconstructedInvestigationInput", () => {
  it("reconstructs model context from durable investigation evidence", () => {
    const state: InvestigationRunState = {
      id: "RUN-1001",
      orderId: "ORD-1001",
      goal: "Determine why order ORD-1001 is stuck.",

      status: "RUNNING",
      workingMemory: {
        facts: [
          {
            id: "fact-1-order-status",
            statement: "Order ORD-1001 status is PROCESSING.",
            sourceTool: "get_order",
            sourceSequence: 1,
          },
          {
            id: "fact-2-payment-PAY-1001",
            statement: "Payment PAY-1001 status is CAPTURED.",
            sourceTool: "get_payment_state",
            sourceSequence: 2,
          },
        ],
        unresolvedQuestions: ["Why has the order not completed?"],
      },

      startedAt: "2026-09-18T16:00:00.000Z",
      updatedAt: "2026-09-18T16:01:00.000Z",

      toolCalls: 2,

      executedToolCallSignatures: [
        '{"name":"get_order","arguments":{"orderId":"ORD-1001"}}',
        '{"name":"get_payment_state","arguments":{"orderId":"ORD-1001"}}',
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
              status: "PROCESSING",
            },
          },
          executedAt: "2026-09-18T16:00:01.000Z",
        },
        {
          sequence: 2,
          tool: "get_payment_state",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
            data: {
              status: "CAPTURED",
            },
          },
          executedAt: "2026-09-18T16:00:02.000Z",
        },
      ],

      continuation: {
        kind: "TOOL_OUTPUT",
        previousResponseId: "resp_should_not_be_required",
        callId: "call_123",
        output: '{"ok":true}',
      },

      assessment: null,
      failureReason: null,
    };

    const context = buildReconstructedInvestigationInput(state);

    expect(context).toContain("Determine why order ORD-1001 is stuck.");

    expect(context).toContain("get_order");
    expect(context).toContain("get_payment_state");

    expect(context).toContain("PROCESSING");
    expect(context).toContain("CAPTURED");

    expect(context).not.toContain("resp_should_not_be_required");

    expect(context).not.toContain("call_123");
  });

  it("keeps compact facts without copying raw tool result payloads", () => {
    const state: InvestigationRunState = {
      id: "RUN-COMPACTION",
      orderId: "ORD-1001",
      goal: "Determine why order ORD-1001 is stuck.",

      status: "RUNNING",

      startedAt: "2026-09-18T16:00:00.000Z",
      updatedAt: "2026-09-18T16:01:00.000Z",

      toolCalls: 3,

      executedToolCallSignatures: [],

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
              rawMarker: "OLD_RAW_ORDER_OBSERVATION",
            },
          },
          executedAt: "2026-09-18T16:00:01.000Z",
        },
        {
          sequence: 2,
          tool: "get_payment_state",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
            data: {
              rawMarker: "RECENT_PAYMENT_OBSERVATION",
            },
          },
          executedAt: "2026-09-18T16:00:02.000Z",
        },
        {
          sequence: 3,
          tool: "get_fulfillment_attempts",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
            data: {
              rawMarker: "RECENT_FULFILLMENT_OBSERVATION",
            },
          },
          executedAt: "2026-09-18T16:00:03.000Z",
        },
      ],

      workingMemory: {
        facts: [
          {
            id: "fact-1-order-status",
            statement: "Order ORD-1001 status is PROCESSING.",
            sourceTool: "get_order",
            sourceSequence: 1,
          },
        ],
        unresolvedQuestions: [],
      },

      continuation: null,

      assessment: null,
      failureReason: null,
    };

    const context = buildReconstructedInvestigationInput(state);

    expect(context).toContain("Order ORD-1001 status is PROCESSING.");

    expect(context).toContain(
      '"statement": "Order ORD-1001 status is PROCESSING."',
    );

    expect(context).toContain("Tool execution ledger:");

    expect(context).toContain('get_order {"orderId":"ORD-1001"} -> SUCCEEDED');

    expect(context).toContain(
      'get_payment_state {"orderId":"ORD-1001"} -> SUCCEEDED',
    );

    expect(context).toContain(
      'get_fulfillment_attempts {"orderId":"ORD-1001"} -> SUCCEEDED',
    );

    expect(context).not.toContain("OLD_RAW_ORDER_OBSERVATION");

    expect(context).not.toContain("RECENT_PAYMENT_OBSERVATION");

    expect(context).not.toContain("RECENT_FULFILLMENT_OBSERVATION");
  });

  it("includes provenance-aware projected observations when reconstructing context", () => {
    const state: InvestigationRunState = {
      id: "RUN-1",

      orderId: "ORD-1001",

      goal: "Determine why order ORD-1001 is stuck.",

      status: "RUNNING",

      workingMemory: {
        facts: [],
        unresolvedQuestions: [],
      },

      startedAt: "2026-09-23T16:00:00.000Z",

      updatedAt: "2026-09-23T16:01:00.000Z",

      toolCalls: 2,

      executedToolCallSignatures: [
        JSON.stringify({
          name: "get_order",
          arguments: {
            orderId: "ORD-1001",
          },
        }),

        JSON.stringify({
          name: "get_payment_state",
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

              observedAt: "2026-09-23T16:00:10.000Z",

              source: "commerce_repository",
            },
          },

          executedAt: "2026-09-23T16:00:10.001Z",
        },

        {
          sequence: 2,

          tool: "get_payment_state",

          arguments: {
            orderId: "ORD-1001",
          },

          result: {
            ok: true,

            data: {
              orderId: "ORD-1001",

              payments: [
                {
                  id: "PAY-1001",
                  status: "CAPTURED",
                },
              ],

              observedAt: "2026-09-23T16:00:20.000Z",

              source: "commerce_repository",
            },
          },

          executedAt: "2026-09-23T16:00:20.001Z",
        },
      ],

      continuation: {
        kind: "INITIAL",
        prompt: "Why is order ORD-1001 stuck?",
      },

      assessment: null,

      failureReason: null,
    };

    const result = buildReconstructedInvestigationInput(state);

    expect(result).toContain("Projected observations:");

    expect(result).toContain(
      "They are evidence from when the tool ran, not guarantees about current system state.",
    );

    expect(result).toContain(
      "[OBSERVATION] [tool:get_order] [observedAt=2026-09-23T16:00:10.000Z] Order ORD-1001 status is PROCESSING.",
    );

    expect(result).toContain(
      "[OBSERVATION] [tool:get_payment_state] [observedAt=2026-09-23T16:00:20.000Z] Payment PAY-1001 status is CAPTURED.",
    );

    expect(result).toContain("Tool execution ledger:");

    expect(result).toContain('get_order {"orderId":"ORD-1001"} -> SUCCEEDED');

    expect(result).toContain(
      'get_payment_state {"orderId":"ORD-1001"} -> SUCCEEDED',
    );

    expect(result).not.toContain("Persisted tool evidence:");

    expect(result).not.toContain('"result": {');

    expect(result).not.toContain('"previousResponseId"');

    const rawToolEvidence = JSON.stringify(state.toolExecutions, null, 2);

    const compactEvidence = [
      formatAgentContextFacts(projectInvestigationObservationFacts(state)),

      formatToolExecutionSummary(state),
    ].join("\n");

    expect(compactEvidence.length).toBeLessThan(rawToolEvidence.length);
  });
});
