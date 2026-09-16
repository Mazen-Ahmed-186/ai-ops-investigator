import { describe, expect, it } from "vitest";

import { IncidentAssessmentSchema } from "../../src/ai/schemas.js";

describe("IncidentAssessmentSchema", () => {
  it("accepts a valid incident assessment", () => {
    const result = IncidentAssessmentSchema.safeParse({
      category: "NOTIFICATION",
      confidence: "HIGH",
      summary: "The notification failed after successful delivery.",
      requiresMoreEvidence: false,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported incident category", () => {
    const result = IncidentAssessmentSchema.safeParse({
      category: "DATABASE_PROBLEM",
      confidence: "HIGH",
      summary: "Something happened.",
      requiresMoreEvidence: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid confidence value", () => {
    const result = IncidentAssessmentSchema.safeParse({
      category: "NOTIFICATION",
      confidence: 95,
      summary: "The notification failed.",
      requiresMoreEvidence: false,
    });

    expect(result.success).toBe(false);
  });
});
