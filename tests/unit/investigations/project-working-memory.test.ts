import { describe, expect, it } from "vitest";

import { projectWorkingMemory } from "../../../src/investigations/project-working-memory.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

describe("projectWorkingMemory", () => {
  it("projects compact facts from durable tool evidence", () => {
    const state = {
      toolExecutions: [
        {
          sequence: 1,
          tool: "get_delivery_state",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
            data: {
              entitlements: [
                {
                  id: "ENT-1001",
                  status: "ACTIVE",
                },
              ],
              accountDeliveries: [
                {
                  id: "DEL-1001",
                  entitlementId: "ENT-1001",
                  status: "DELIVERED",
                },
              ],
            },
          },
          executedAt: "2026-09-18T16:00:00.000Z",
        },
        {
          sequence: 2,
          tool: "get_order_processing_trace",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
            data: {
              entries: [
                {
                  id: "TRACE-1001",
                  component: "persistence",
                  event: "DATABASE_TIMEOUT",
                  detail: "Database operation timed out.",
                },
              ],
            },
          },
          executedAt: "2026-09-18T16:00:01.000Z",
        },
      ],
    } as InvestigationRunState;

    const memory = projectWorkingMemory(state);

    expect(memory.facts.map((fact) => fact.statement)).toEqual([
      "Entitlement ENT-1001 status is ACTIVE.",
      "Account delivery DEL-1001 for entitlement ENT-1001 status is DELIVERED.",
      "Technical trace DATABASE_TIMEOUT in persistence: Database operation timed out.",
    ]);
  });
});
