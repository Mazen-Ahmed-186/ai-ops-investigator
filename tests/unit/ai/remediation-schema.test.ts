import { describe, expect, it } from "vitest";

import { RemediationRecommendationSchema } from "../../../src/ai/remediation-schema.js";

describe("RemediationRecommendationSchema", () => {
  it("accepts a grounded remediation recommendation", () => {
    const result = RemediationRecommendationSchema.safeParse({
      status: "RECOMMENDATION_READY",

      summary: "Reconcile the stale order without repeating fulfillment.",

      actions: [
        {
          instruction: "Re-read the current order and delivery state.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported status", () => {
    const result = RemediationRecommendationSchema.safeParse({
      status: "JUST_RETRY_IT",
      summary: "Retry.",
      actions: [],
      runbookIds: [],
      requiresHumanReview: false,
    });

    expect(result.success).toBe(false);
  });
});
