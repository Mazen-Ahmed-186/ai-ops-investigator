import { describe, expect, it } from "vitest";

import { derivePrimaryAction } from "../../../src/automation/derive-primary-action.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

function createRemediation(
  overrides: Partial<RemediationRun> = {},
): RemediationRun {
  return {
    id: "REM-AUTO-1",

    orderId: "ORD-1001",

    automationRunId: "AUTO-1",

    investigationRunId: "INV-AUTO-1",

    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",

      summary: "Reconcile the stale order state.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile the stale completed order state.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },

        {
          disposition: "CONSTRAINT",

          actionKind: null,

          instruction: "Do not create another fulfillment attempt.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },

        {
          disposition: "FOLLOW_UP",

          actionKind: "RETRY_NOTIFICATION",

          instruction: "Retry the failed notification separately.",

          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],
    },

    retrievedRunbookIds: [
      "RUNBOOK-DB-TIMEOUT",
      "RUNBOOK-NOTIFICATION-FAILURE",
      "RUNBOOK-UNKNOWN-FULFILLMENT",
    ],

    startedAt: "2026-09-22T15:00:00.000Z",

    updatedAt: "2026-09-22T15:01:00.000Z",

    failureReason: null,

    ...overrides,
  };
}

describe("derivePrimaryAction", () => {
  it("derives the grounded primary action", () => {
    const result = derivePrimaryAction(createRemediation());

    expect(result).toEqual({
      status: "ACTION_READY",

      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason:
          "Grounded remediation requires reconciling the stale order state.",
      },

      supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    });
  });

  it("ignores retrieved runbooks that were not cited by the primary action", () => {
    const result = derivePrimaryAction(createRemediation());

    expect(result.status).toBe("ACTION_READY");
  });

  it("escalates when no primary action exists", () => {
    const remediation = createRemediation();

    remediation.recommendation = {
      status: "RECOMMENDATION_READY",

      summary: "Only follow-up work was identified.",

      actions: [
        {
          disposition: "FOLLOW_UP",

          actionKind: "RETRY_NOTIFICATION",

          instruction: "Retry notification.",

          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],
    };

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ESCALATE",

      reason: "Remediation must contain exactly one primary action.",
    });
  });

  it("escalates when the action cites an unretrieved runbook", () => {
    const remediation = createRemediation();

    remediation.recommendation = {
      status: "RECOMMENDATION_READY",

      summary: "Reconcile.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile.",

          supportedByRunbookIds: ["RUNBOOK-NOT-RETRIEVED"],
        },
      ],
    };

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ESCALATE",

      reason: "Primary action cites unretrieved runbook RUNBOOK-NOT-RETRIEVED.",
    });
  });

  it("escalates when a cited runbook does not support the proposed action", () => {
    const remediation = createRemediation();

    remediation.recommendation = {
      status: "RECOMMENDATION_READY",

      summary: "Issue a refund.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "ISSUE_REFUND",

          instruction: "Issue a refund.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],
    };

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ESCALATE",

      reason: "No runbook is configured to authorize ISSUE_REFUND.",
    });
  });

  it("rejects using the notification runbook to justify order reconciliation", () => {
    const remediation = createRemediation();

    remediation.recommendation = {
      status: "RECOMMENDATION_READY",

      summary: "Reconcile.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile.",

          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],
    };

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ESCALATE",

      reason:
        "Runbook RUNBOOK-NOTIFICATION-FAILURE does not support action RECONCILE_ORDER_STATE.",
    });
  });

  it("escalates when no applicable runbook exists", () => {
    const remediation = createRemediation({
      recommendation: {
        status: "NO_APPLICABLE_RUNBOOK",

        summary: "No grounded remediation was found.",

        actions: [],
      },
    });

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ESCALATE",

      reason: "No applicable grounded remediation was found.",
    });
  });

  it("derives a fulfillment attempt when supported by the confirmed-failure runbook", () => {
    const remediation = createRemediation({
      recommendation: {
        status: "RECOMMENDATION_READY",

        summary:
          "The previous fulfillment attempt definitively failed and a replacement attempt is appropriate.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "CREATE_FULFILLMENT_ATTEMPT",

            instruction:
              "Create a replacement fulfillment attempt after approval.",

            supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
    });

    expect(derivePrimaryAction(remediation)).toEqual({
      status: "ACTION_READY",

      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: remediation.orderId,

        reason:
          "Grounded remediation requires creating a new fulfillment attempt.",
      },

      supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
    });
  });

  it("does not let the unknown-fulfillment runbook authorize another attempt", () => {
    const remediation = createRemediation({
      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Create another fulfillment attempt.",

        actions: [
          {
            disposition: "PRIMARY",

            actionKind: "CREATE_FULFILLMENT_ATTEMPT",

            instruction: "Create another attempt.",

            supportedByRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
    });

    const result = derivePrimaryAction(remediation);

    expect(result.status).toBe("ESCALATE");
  });
});
