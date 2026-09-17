import { describe, expect, it } from "vitest";

import { IncidentAssessmentSchema } from "../../../src/ai/schemas.js";

describe("IncidentAssessmentSchema", () => {
  it("accepts a valid incident assessment", () => {
    const result = IncidentAssessmentSchema.safeParse({
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
      rootCauseCategory: "UNKNOWN",
      confidence: "HIGH",
      summary:
        "Delivery succeeded, but the order remains processing and the root cause is not yet established.",
      findings: [
        {
          category: "ORDER_STATE",
          kind: "EVIDENCE",
          summary:
            "Order remains PROCESSING after successful fulfillment and delivery.",
        },
        {
          category: "NOTIFICATION",
          kind: "EVIDENCE",
          summary: "The customer email notification failed.",
        },
      ],
      requiresMoreEvidence: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported root cause category", () => {
    const result = IncidentAssessmentSchema.safeParse({
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "DATABASE_PROBLEM",
      confidence: "HIGH",
      summary: "Something happened.",
      findin: [],
      requiresMoreEvidence: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid confidence value", () => {
    const result = IncidentAssessmentSchema.safeParse({
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
      rootCauseCategory: "UNKNOWN",
      confidence: 95,
      summary: "The root cause is not yet established.",
      findings: [],
      requiresMoreEvidence: true,
    });

    expect(result.success).toBe(false);
  });
});
