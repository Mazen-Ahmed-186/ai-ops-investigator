import { describe, expect, it } from "vitest";

import { projectInvestigationObservationFacts } from "../../../src/agent-context/project-investigation-observations.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

describe("projectInvestigationObservationFacts", () => {
  it("projects successful tool observations with provenance", () => {
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

            observedAt: "2026-09-23T16:00:01.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:01.001Z",
      },
    ];

    const facts = projectInvestigationObservationFacts({
      toolExecutions,
    });

    expect(facts).toEqual([
      {
        kind: "OBSERVATION",

        statement: "Order ORD-1001 status is PROCESSING.",

        source: {
          type: "TOOL",
          name: "get_order",
        },

        observedAt: "2026-09-23T16:00:00.000Z",
      },

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
  });

  it("projects fulfillment, delivery, and notification observations", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_fulfillment_attempts",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            orderId: "ORD-1001",

            attempts: [
              {
                id: "FUL-1001",

                status: "SUCCEEDED",
              },
            ],

            observedAt: "2026-09-23T16:00:00.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:00.001Z",
      },

      {
        sequence: 2,

        tool: "get_delivery_state",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            orderId: "ORD-1001",

            entitlements: [
              {
                id: "ENT-1001",

                status: "ACTIVE",
              },
            ],

            accountDeliveries: [
              {
                id: "DEL-1001",

                status: "DELIVERED",
              },
            ],

            observedAt: "2026-09-23T16:00:01.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:01.001Z",
      },

      {
        sequence: 3,

        tool: "get_notification_state",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            orderId: "ORD-1001",

            notifications: [
              {
                id: "NOT-1001",

                status: "FAILED",
              },
            ],

            observedAt: "2026-09-23T16:00:02.000Z",

            source: "commerce_repository",
          },
        },

        executedAt: "2026-09-23T16:00:02.001Z",
      },
    ];

    const facts = projectInvestigationObservationFacts({
      toolExecutions,
    });

    expect(facts.map((fact) => fact.statement)).toEqual([
      "Fulfillment attempt FUL-1001 status is SUCCEEDED.",
      "Entitlement ENT-1001 status is ACTIVE.",
      "Account delivery DEL-1001 status is DELIVERED.",
      "Notification NOT-1001 status is FAILED.",
    ]);
  });

  it("does not turn failed tool calls into observation facts", () => {
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
      projectInvestigationObservationFacts({
        toolExecutions,
      }),
    ).toEqual([]);
  });

  it("projects order event history with event time and observation provenance", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_order_event_history",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            orderId: "ORD-1001",

            events: [
              {
                id: "EVT-1001",

                orderId: "ORD-1001",

                type: "PAYMENT_CAPTURED",

                occurredAt: "2026-09-16T09:01:00.000Z",
              },
              {
                id: "EVT-1002",

                orderId: "ORD-1001",

                type: "FULFILLMENT_SUCCEEDED",

                occurredAt: "2026-09-16T09:03:00.000Z",
              },
            ],

            observedAt: "2026-09-23T16:00:00.000Z",

            source: "commerce_event_history",
          },
        },

        executedAt: "2026-09-23T16:00:00.001Z",
      },
    ];

    const facts = projectInvestigationObservationFacts({
      toolExecutions,
    });

    expect(facts).toEqual([
      {
        kind: "OBSERVATION",

        statement:
          "Order event EVT-1001 recorded PAYMENT_CAPTURED at 2026-09-16T09:01:00.000Z.",

        source: {
          type: "TOOL",
          name: "get_order_event_history",
        },

        observedAt: "2026-09-23T16:00:00.000Z",
      },

      {
        kind: "OBSERVATION",

        statement:
          "Order event EVT-1002 recorded FULFILLMENT_SUCCEEDED at 2026-09-16T09:03:00.000Z.",

        source: {
          type: "TOOL",
          name: "get_order_event_history",
        },

        observedAt: "2026-09-23T16:00:00.000Z",
      },
    ]);
  });

  it("projects processing trace entries without inferring causality", () => {
    const toolExecutions: InvestigationRunState["toolExecutions"] = [
      {
        sequence: 1,

        tool: "get_order_processing_trace",

        arguments: {
          orderId: "ORD-1001",
        },

        result: {
          ok: true,

          data: {
            orderId: "ORD-1001",

            entries: [
              {
                id: "TRACE-1002",

                orderId: "ORD-1001",

                component: "order-completion-handler",

                event: "ORDER_STATUS_UPDATE_ATTEMPTED",

                occurredAt: "2026-09-16T09:04:01.200Z",

                detail:
                  "Attempted to transition order from PROCESSING to FULFILLED.",
              },
              {
                id: "TRACE-1003",

                orderId: "ORD-1001",

                component: "persistence",

                event: "DATABASE_TIMEOUT",

                occurredAt: "2026-09-16T09:04:02.000Z",

                detail:
                  "Database operation timed out before the order status update was persisted.",
              },
            ],

            observedAt: "2026-09-23T16:00:00.000Z",

            source: "application_trace",
          },
        },

        executedAt: "2026-09-23T16:00:00.001Z",
      },
    ];

    const facts = projectInvestigationObservationFacts({
      toolExecutions,
    });

    expect(facts.map((fact) => fact.statement)).toEqual([
      "Processing trace TRACE-1002 from order-completion-handler recorded ORDER_STATUS_UPDATE_ATTEMPTED at 2026-09-16T09:04:01.200Z. Detail: Attempted to transition order from PROCESSING to FULFILLED.",

      "Processing trace TRACE-1003 from persistence recorded DATABASE_TIMEOUT at 2026-09-16T09:04:02.000Z. Detail: Database operation timed out before the order status update was persisted.",
    ]);

    expect(facts.every((fact) => fact.kind === "OBSERVATION")).toBe(true);
  });
});
