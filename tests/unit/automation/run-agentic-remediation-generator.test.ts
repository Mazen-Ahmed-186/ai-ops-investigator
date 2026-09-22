import { describe, expect, it, vi } from "vitest";

import type { IncidentAssessment } from "../../../src/ai/schemas.js";
import {
  createAgenticRemediationGenerator,
  type RunAgenticRemediation,
} from "../../../src/automation/run-agentic-remediation-generator.js";

function createAssessment(): IncidentAssessment {
  return {
    diagnosisStatus: "DIAGNOSIS_READY",

    rootCauseCategory: "INFRASTRUCTURE",

    confidence: "HIGH",

    summary: "The final order-state persistence timed out.",

    findings: [],

    requiresMoreEvidence: false,
  };
}

describe("createAgenticRemediationGenerator", () => {
  it("maps the grounded agentic remediation result into the durable planner contract", async () => {
    const assessment = createAssessment();

    const runRemediation = vi.fn<RunAgenticRemediation>(async () => ({
      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Reconcile the stale order state.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "RECONCILE_ORDER_STATE",

            instruction:
              "Reconcile the stale order state without repeating fulfillment.",

            supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
          },
        ],
      },

      toolCalls: 1,

      retrievedRunbooks: [
        {
          id: "RUNBOOK-DB-TIMEOUT",

          title: "Order completion database timeout",

          content: "Reconcile the stale order state.",

          score: 9,
        },
      ],
    }));

    const generate = createAgenticRemediationGenerator(runRemediation);

    const result = await generate({
      orderId: "ORD-1001",

      investigationRunId: "INV-AUTO-1",

      assessment,
    });

    expect(runRemediation).toHaveBeenCalledWith(assessment);

    expect(result).toEqual({
      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Reconcile the stale order state.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "RECONCILE_ORDER_STATE",

            instruction:
              "Reconcile the stale order state without repeating fulfillment.",

            supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    });
  });
});
