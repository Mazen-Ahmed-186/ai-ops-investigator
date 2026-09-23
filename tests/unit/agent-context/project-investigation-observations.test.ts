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

  it("does not invent compressed facts for unsupported observation shapes", () => {
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

            entries: [],

            observedAt: "2026-09-23T16:00:00.000Z",

            source: "application_trace",
          },
        },

        executedAt: "2026-09-23T16:00:00.001Z",
      },
    ];

    expect(
      projectInvestigationObservationFacts({
        toolExecutions,
      }),
    ).toEqual([]);
  });
});
