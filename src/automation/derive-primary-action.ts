import type { AgentActionRequest } from "../actions/types.js";
import type { RemediationRun } from "../remediations/types.js";

const ACTION_RUNBOOK_SUPPORT = {
  RECONCILE_ORDER_STATE: ["RUNBOOK-DB-TIMEOUT"],

  RETRY_NOTIFICATION: ["RUNBOOK-NOTIFICATION-FAILURE"],

  CREATE_FULFILLMENT_ATTEMPT: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

  ISSUE_REFUND: [],

  CANCEL_ORDER: [],
} as const satisfies Record<AgentActionRequest["kind"], readonly string[]>;

const ACTION_REASONS = {
  RECONCILE_ORDER_STATE:
    "Grounded remediation requires reconciling the stale order state.",

  RETRY_NOTIFICATION:
    "Grounded remediation requires retrying the failed customer notification.",

  CREATE_FULFILLMENT_ATTEMPT:
    "Grounded remediation requires creating a new fulfillment attempt.",

  ISSUE_REFUND: "Grounded remediation requires issuing a refund.",

  CANCEL_ORDER: "Grounded remediation requires cancelling the order.",
} as const satisfies Record<AgentActionRequest["kind"], string>;

export type PrimaryActionDerivationResult =
  | {
      status: "ACTION_READY";

      action: AgentActionRequest;

      supportedByRunbookIds: string[];
    }
  | {
      status: "ESCALATE";

      reason: string;
    };

export function derivePrimaryAction(
  remediation: RemediationRun,
): PrimaryActionDerivationResult {
  if (remediation.status !== "COMPLETED") {
    return {
      status: "ESCALATE",

      reason: "Remediation planning has not completed.",
    };
  }

  if (!remediation.recommendation) {
    return {
      status: "ESCALATE",

      reason: "Completed remediation has no recommendation.",
    };
  }

  if (remediation.recommendation.status !== "RECOMMENDATION_READY") {
    return {
      status: "ESCALATE",

      reason: "No applicable grounded remediation was found.",
    };
  }

  const primaryActions = remediation.recommendation.actions.filter(
    (action) => action.disposition === "PRIMARY",
  );

  if (primaryActions.length !== 1) {
    return {
      status: "ESCALATE",

      reason: "Remediation must contain exactly one primary action.",
    };
  }

  const primary = primaryActions[0];

  if (!primary) {
    return {
      status: "ESCALATE",

      reason: "Remediation primary action was not found.",
    };
  }

  if (!primary.actionKind) {
    return {
      status: "ESCALATE",

      reason: "Primary remediation action has no executable action kind.",
    };
  }

  if (primary.supportedByRunbookIds.length === 0) {
    return {
      status: "ESCALATE",

      reason: "Primary remediation action has no supporting runbooks.",
    };
  }

  const retrievedRunbookIds = new Set(remediation.retrievedRunbookIds);

  for (const runbookId of primary.supportedByRunbookIds) {
    if (!retrievedRunbookIds.has(runbookId)) {
      return {
        status: "ESCALATE",

        reason: `Primary action cites unretrieved runbook ${runbookId}.`,
      };
    }
  }

  const allowedRunbooks = new Set<string>(
    ACTION_RUNBOOK_SUPPORT[primary.actionKind],
  );

  if (allowedRunbooks.size === 0) {
    return {
      status: "ESCALATE",

      reason: `No runbook is configured to authorize ${primary.actionKind}.`,
    };
  }

  for (const runbookId of primary.supportedByRunbookIds) {
    if (!allowedRunbooks.has(runbookId)) {
      return {
        status: "ESCALATE",

        reason: `Runbook ${runbookId} does not support action ${primary.actionKind}.`,
      };
    }
  }

  return {
    status: "ACTION_READY",

    action: {
      kind: primary.actionKind,

      orderId: remediation.orderId,

      reason: ACTION_REASONS[primary.actionKind],
    },

    supportedByRunbookIds: [...primary.supportedByRunbookIds],
  };
}
