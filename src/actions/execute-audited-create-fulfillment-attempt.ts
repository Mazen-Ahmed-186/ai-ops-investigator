import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import {
  createStartedActionExecutionAudit,
  type ActionExecutionInitiator,
} from "./action-execution-audit.js";
import type { ApprovalStore } from "./approval-store.js";
import {
  executeCreateFulfillmentAttempt,
  type CreateFulfillmentAttemptAction,
} from "./execute-create-fulfillment-attempt.js";
import type { FulfillmentActionExecutionRepository } from "./fulfillment-action-execution-repository.js";

export async function executeAuditedCreateFulfillmentAttempt(args: {
  action: CreateFulfillmentAttemptAction;
  approvalId?: string;
  approvalStore: ApprovalStore;
  repository: FulfillmentActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  initiatedBy: ActionExecutionInitiator;
  now?: Date;
}) {
  let audit = createStartedActionExecutionAudit({
    action: args.action,
    initiatedBy: args.initiatedBy,

    ...(args.approvalId
      ? {
          approvalId: args.approvalId,
        }
      : {}),

    ...(args.now
      ? {
          now: args.now,
        }
      : {}),
  });

  await args.auditStore.save(audit);

  try {
    const result = await executeCreateFulfillmentAttempt({
      action: args.action,
      approvalStore: args.approvalStore,
      repository: args.repository,
      executionId: audit.id,

      ...(args.approvalId
        ? {
            approvalId: args.approvalId,
          }
        : {}),

      ...(args.now
        ? {
            now: args.now,
          }
        : {}),
    });

    const completedAt = (args.now ?? new Date()).toISOString();

    switch (result.status) {
      case "EXECUTED":
        audit = {
          ...audit,
          status: "EXECUTED",
          completedAt,
          reason: `Created fulfillment attempt ${result.attemptId} with status ${result.attemptStatus}.`,
        };

        break;

      case "PENDING_APPROVAL":
        audit = {
          ...audit,
          status: "PENDING_APPROVAL",
          completedAt,
          reason: result.reason,
        };

        break;

      case "APPROVAL_REJECTED":
        audit = {
          ...audit,
          status: "APPROVAL_REJECTED",
          completedAt,
          reason: result.reason,
        };

        break;

      case "APPROVAL_EXPIRED":
        audit = {
          ...audit,
          status: "APPROVAL_EXPIRED",
          completedAt,
          reason: result.reason,
        };

        break;

      case "DENIED":
        audit = {
          ...audit,
          status: "DENIED",
          completedAt,
          reason: result.reason,
        };

        break;

      case "NOT_FOUND":
        audit = {
          ...audit,
          status: "NOT_FOUND",
          completedAt,
          reason: result.reason,
        };

        break;

      case "BLOCKED_BY_CURRENT_STATE":
        audit = {
          ...audit,
          status: "BLOCKED_BY_CURRENT_STATE",
          completedAt,
          reason: result.reason,
          validationReasons: result.validationReasons,
        };

        break;
    }

    await args.auditStore.save(audit);

    return {
      result,
      executionId: audit.id,
    };
  } catch (error) {
    audit = {
      ...audit,
      status: "FAILED",
      completedAt: (args.now ?? new Date()).toISOString(),
      error:
        error instanceof Error
          ? error.message
          : "Unknown fulfillment action execution failure.",
    };

    await args.auditStore.save(audit);

    throw error;
  }
}
