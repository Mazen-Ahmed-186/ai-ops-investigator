import { approvalMatchesAction } from "../actions/approval-matches-action.js";
import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import type { CreateFulfillmentAttemptAction } from "../actions/execute-create-fulfillment-attempt.js";
import type { AgentActionRequest } from "../actions/types.js";

export type ConsumedFulfillmentRecoveryResult =
  | {
      status: "NOT_CONSUMED";
    }
  | {
      status: "RECOVERED_EXECUTION";
      executionId: string;
    }
  | {
      status: "ESCALATE";
      executionId: string | null;
      reason: string;
    };

function auditActionMatches(
  auditAction: AgentActionRequest,
  action: AgentActionRequest,
) {
  return (
    auditAction.kind === action.kind &&
    auditAction.orderId === action.orderId &&
    auditAction.reason === action.reason
  );
}

export async function recoverConsumedFulfillmentExecution(args: {
  action: CreateFulfillmentAttemptAction;
  approvalId: string;
  approvalStore: ApprovalStore;
  auditStore: ActionExecutionAuditStore;
}): Promise<ConsumedFulfillmentRecoveryResult> {
  const approval = await args.approvalStore.get(args.approvalId);

  if (!approval || approval.status !== "CONSUMED") {
    return {
      status: "NOT_CONSUMED",
    };
  }

  if (!approvalMatchesAction(approval, args.action)) {
    return {
      status: "ESCALATE",

      executionId: approval.consumedByExecutionId,

      reason: `Consumed approval ${approval.id} does not match the derived automation action.`,
    };
  }

  if (!approval.consumedByExecutionId) {
    return {
      status: "ESCALATE",

      executionId: null,

      reason: `Consumed approval ${approval.id} has no execution correlation.`,
    };
  }

  const executionId = approval.consumedByExecutionId;

  const audit = await args.auditStore.get(executionId);

  if (!audit) {
    return {
      status: "ESCALATE",

      executionId,

      reason: `Approval ${approval.id} was consumed by ${executionId}, but its execution audit was not found.`,
    };
  }

  if (
    audit.action.kind !== "CREATE_FULFILLMENT_ATTEMPT" ||
    !auditActionMatches(audit.action, args.action)
  ) {
    return {
      status: "ESCALATE",

      executionId,

      reason: `Execution audit ${executionId} does not match the action authorized by approval ${approval.id}.`,
    };
  }

  if (audit.approvalId !== approval.id) {
    return {
      status: "ESCALATE",

      executionId,

      reason: `Execution audit ${executionId} does not reference approval ${approval.id}.`,
    };
  }

  if (
    audit.status === "EXECUTED" &&
    audit.effect?.kind === "FULFILLMENT_ATTEMPT_CREATED"
  ) {
    return {
      status: "RECOVERED_EXECUTION",

      executionId,
    };
  }

  if (audit.status === "STARTED") {
    return {
      status: "ESCALATE",

      executionId,

      reason: `Execution ${executionId} is incomplete after its approval was consumed; the side-effect outcome must be reconciled before any retry.`,
    };
  }

  if (audit.status === "FAILED") {
    return {
      status: "ESCALATE",

      executionId,

      reason: `Execution ${executionId} failed after its approval was consumed; manual reconciliation is required before any retry.`,
    };
  }

  return {
    status: "ESCALATE",

    executionId,

    reason:
      audit.reason ??
      `Execution ${executionId} ended with status ${audit.status}.`,
  };
}
