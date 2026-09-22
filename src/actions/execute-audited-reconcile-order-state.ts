import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import {
  createStartedActionExecutionAudit,
  type ActionExecutionInitiator,
} from "./action-execution-audit.js";
import type { ActionExecutionRepository } from "./action-execution-repository.js";
import {
  executeReconcileOrderState,
  type ReconcileOrderStateAction,
} from "./execute-reconcile-order-state.js";

export async function executeAuditedReconcileOrderState(args: {
  action: ReconcileOrderStateAction;

  repository: ActionExecutionRepository;

  auditStore: ActionExecutionAuditStore;

  initiatedBy: ActionExecutionInitiator;

  approvalId?: string;
}) {
  let audit = createStartedActionExecutionAudit({
    action: args.action,

    initiatedBy: args.initiatedBy,

    ...(args.approvalId
      ? {
          approvalId: args.approvalId,
        }
      : {}),
  });

  await args.auditStore.save(audit);

  try {
    const result = await executeReconcileOrderState({
      action: args.action,

      repository: args.repository,
    });

    const completedAt = new Date().toISOString();

    switch (result.status) {
      case "EXECUTED":
        audit = {
          ...audit,

          status: "EXECUTED",

          completedAt,

          reason: `Order transitioned from ${result.previousStatus} to ${result.currentStatus}.`,
        };

        break;

      case "NO_OP":
        audit = {
          ...audit,

          status: "NO_OP",

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

      case "DENIED":
        audit = {
          ...audit,

          status: "DENIED",

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

      completedAt: new Date().toISOString(),

      error:
        error instanceof Error
          ? error.message
          : "Unknown action execution failure.",
    };

    await args.auditStore.save(audit);

    throw error;
  }
}
