import { describe, expect, it } from "vitest";

import { RemediationRecommendationSchema } from "../../../src/ai/remediation-schema.js";

describe("RemediationRecommendationSchema", () => {
  it("accepts a grounded remediation recommendation", () => {
    const result = RemediationRecommendationSchema.safeParse({
      status: "RECOMMENDATION_READY",

      summary: "Reconcile the stale order without repeating fulfillment.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile the stale order state.",

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

  it("accepts an executable primary action", () => {
    expect(
      RemediationRecommendationSchema.safeParse({
        status: "RECOMMENDATION_READY",

        summary: "Reconcile the stale state.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "RECONCILE_ORDER_STATE",

            instruction: "Reconcile the stale state.",

            supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a non-executable constraint", () => {
    expect(
      RemediationRecommendationSchema.safeParse({
        status: "RECOMMENDATION_READY",

        summary: "Do not duplicate fulfillment.",

        actions: [
          {
            disposition: "CONSTRAINT",

            actionKind: null,

            instruction: "Do not create another fulfillment attempt.",

            supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects multiple primary actions", () => {
    const result = RemediationRecommendationSchema.safeParse({
      status: "RECOMMENDATION_READY",

      summary: "Multiple actions.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
        {
          disposition: "PRIMARY",

          actionKind: "RETRY_NOTIFICATION",

          instruction: "Retry notification.",

          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an executable action kind on a constraint", () => {
    const result = RemediationRecommendationSchema.safeParse({
      status: "RECOMMENDATION_READY",

      summary: "Do not duplicate fulfillment.",

      actions: [
        {
          disposition: "CONSTRAINT",

          actionKind: "CREATE_FULFILLMENT_ATTEMPT",

          instruction: "Do not create another fulfillment attempt.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
