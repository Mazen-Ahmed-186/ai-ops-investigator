import type { RemediationRun } from "../../src/remediations/types.js";

type RemediationRecommendation = NonNullable<RemediationRun["recommendation"]>;

type RemediationAction = RemediationRecommendation["actions"][number];

export type AutomationScenarioExpectedOutcome =
  | "AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "ESCALATE";

export type AutomationScenario = {
  id: string;
  description: string;
  remediation: RemediationRun;
  expected: {
    outcome: AutomationScenarioExpectedOutcome;
    actionKind?: string;
  };
};

function createRemediation(args: {
  id: string;
  orderId: string;
  summary: string;
  actions: RemediationAction[];
  retrievedRunbookIds: string[];
}): RemediationRun {
  return {
    id: `REM-${args.id}`,
    orderId: args.orderId,
    automationRunId: `AUTO-${args.id}`,
    investigationRunId: `INV-${args.id}`,
    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",
      summary: args.summary,
      actions: args.actions,
    },

    retrievedRunbookIds: args.retrievedRunbookIds,

    startedAt: "2026-09-22T18:00:00.000Z",
    updatedAt: "2026-09-22T18:01:00.000Z",
    failureReason: null,
  };
}

export const automationScenarios: AutomationScenario[] = [
  {
    id: "stale-completed-order",

    description:
      "Successful fulfillment and delivery are complete, but the final order-state persistence failed.",

    remediation: createRemediation({
      id: "STALE-COMPLETED-ORDER",

      orderId: "ORD-EVAL-1001",

      summary:
        "The order is stale after successful delivery and should be reconciled without repeating fulfillment.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction:
            "Reconcile the stale order state after confirming delivery completed.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    }),

    expected: {
      outcome: "AUTO_EXECUTE",
      actionKind: "RECONCILE_ORDER_STATE",
    },
  },

  {
    id: "notification-only-failure",

    description:
      "Fulfillment and delivery succeeded, but the customer notification failed independently.",

    remediation: createRemediation({
      id: "NOTIFICATION-ONLY-FAILURE",

      orderId: "ORD-EVAL-1002",

      summary:
        "Retry the failed notification independently from payment and fulfillment.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RETRY_NOTIFICATION",

          instruction:
            "Retry the failed customer notification after confirming delivery.",

          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
    }),

    expected: {
      outcome: "AUTO_EXECUTE",
      actionKind: "RETRY_NOTIFICATION",
    },
  },

  {
    id: "confirmed-fulfillment-failure",

    description:
      "The previous fulfillment attempt definitively failed and a replacement attempt is appropriate.",

    remediation: createRemediation({
      id: "CONFIRMED-FULFILLMENT-FAILURE",

      orderId: "ORD-EVAL-1003",

      summary:
        "The previous attempt definitively failed, so a replacement may be created with human approval.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "CREATE_FULFILLMENT_ATTEMPT",

          instruction:
            "Create a replacement fulfillment attempt after explicit approval.",

          supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
    }),

    expected: {
      outcome: "REQUIRE_APPROVAL",
      actionKind: "CREATE_FULFILLMENT_ATTEMPT",
    },
  },

  {
    id: "unknown-fulfillment-outcome",

    description:
      "The external fulfillment outcome is unknown and must be reconciled before another attempt.",

    remediation: createRemediation({
      id: "UNKNOWN-FULFILLMENT-OUTCOME",

      orderId: "ORD-EVAL-1004",

      summary:
        "The external side-effect outcome is unknown, so another fulfillment attempt must not be created.",

      actions: [
        {
          disposition: "CONSTRAINT",

          actionKind: null,

          instruction:
            "Do not create another fulfillment attempt while the previous attempt remains unknown.",

          supportedByRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
    }),

    expected: {
      outcome: "ESCALATE",
    },
  },

  {
    id: "unsupported-refund-overreach",

    description:
      "A remediation recommendation attempts to infer a refund action from unrelated fulfillment evidence.",

    remediation: createRemediation({
      id: "UNSUPPORTED-REFUND-OVERREACH",

      orderId: "ORD-EVAL-1005",

      summary:
        "The recommendation attempts to issue a refund without runbook support for that financial action.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "ISSUE_REFUND",

          instruction:
            "Issue a refund based on the failed fulfillment attempt.",

          supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
    }),

    expected: {
      outcome: "ESCALATE",
    },
  },

  {
    id: "unsupported-cancellation-overreach",

    description:
      "A remediation recommendation attempts to turn unrelated evidence into an order cancellation.",

    remediation: createRemediation({
      id: "UNSUPPORTED-CANCELLATION-OVERREACH",

      orderId: "ORD-EVAL-1006",

      summary:
        "The recommendation attempts to cancel the order without grounded cancellation support.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "CANCEL_ORDER",

          instruction:
            "Cancel the order because its completion transition previously failed.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    }),

    expected: {
      outcome: "ESCALATE",
    },
  },
];
