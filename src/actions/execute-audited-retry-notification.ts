import { randomUUID } from "node:crypto";

import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import type { ActionExecutionInitiator } from "./action-execution-audit.js";
import {
  executeRetryNotification,
  type ExecuteRetryNotificationResult,
  type RetryNotificationAction,
} from "./execute-retry-notification.js";
import type { NotificationActionExecutionRepository } from "./notification-action-execution-repository.js";

export async function executeAuditedRetryNotification(args: {
  action: RetryNotificationAction;
  repository: NotificationActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  initiatedBy: ActionExecutionInitiator;
  now?: Date;
}): Promise<{
  executionId: string;
  result: ExecuteRetryNotificationResult;
}> {
  const executionId = `ACT-${randomUUID()}`;

  const startedAt = args.now ?? new Date();

  await args.auditStore.save({
    id: executionId,

    action: args.action,

    initiatedBy: args.initiatedBy,

    approvalId: null,

    status: "STARTED",

    startedAt: startedAt.toISOString(),

    completedAt: null,

    reason: null,

    validationReasons: [],

    error: null,

    effect: null,
  });

  try {
    const result = await executeRetryNotification({
      action: args.action,

      repository: args.repository,
    });

    const completedAt = args.now ?? new Date();

    if (result.status === "EXECUTED") {
      await args.auditStore.save({
        id: executionId,

        action: args.action,

        initiatedBy: args.initiatedBy,

        approvalId: null,

        status: "EXECUTED",

        startedAt: startedAt.toISOString(),

        completedAt: completedAt.toISOString(),

        reason: `Created notification retry ${result.notificationId} with status ${result.notificationStatus}.`,

        validationReasons: [],

        error: null,

        effect: {
          kind: "NOTIFICATION_RETRY_CREATED",

          notificationId: result.notificationId,

          notificationStatus: result.notificationStatus,
        },
      });

      return {
        executionId,

        result,
      };
    }

    const auditStatus =
      result.status === "BLOCKED_BY_CURRENT_STATE"
        ? "BLOCKED_BY_CURRENT_STATE"
        : result.status;

    await args.auditStore.save({
      id: executionId,

      action: args.action,

      initiatedBy: args.initiatedBy,

      approvalId: null,

      status: auditStatus,

      startedAt: startedAt.toISOString(),

      completedAt: completedAt.toISOString(),

      reason: result.reason,

      validationReasons:
        result.status === "BLOCKED_BY_CURRENT_STATE"
          ? result.validationReasons
          : [],

      error: null,

      effect: null,
    });

    return {
      executionId,

      result,
    };
  } catch (error) {
    const completedAt = args.now ?? new Date();

    const message = error instanceof Error ? error.message : String(error);

    await args.auditStore.save({
      id: executionId,

      action: args.action,

      initiatedBy: args.initiatedBy,

      approvalId: null,

      status: "FAILED",

      startedAt: startedAt.toISOString(),

      completedAt: completedAt.toISOString(),

      reason: "Notification retry execution failed.",

      validationReasons: [],

      error: message,

      effect: null,
    });

    throw error;
  }
}
