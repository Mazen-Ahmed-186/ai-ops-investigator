import { evaluateActionGate } from "./evaluate-action-gate.js";
import type { NotificationActionExecutionRepository } from "./notification-action-execution-repository.js";
import type { AgentActionRequest } from "./types.js";

export type RetryNotificationAction = AgentActionRequest & {
  kind: "RETRY_NOTIFICATION";
};

export type ExecuteRetryNotificationResult =
  | {
      status: "EXECUTED";
      notificationId: string;
      notificationStatus: "PENDING";
    }
  | {
      status: "NOT_FOUND";
      reason: string;
    }
  | {
      status: "DENIED";
      reason: string;
    }
  | {
      status: "BLOCKED_BY_CURRENT_STATE";
      reason: string;
      validationReasons: string[];
    };

export async function executeRetryNotification(args: {
  action: RetryNotificationAction;
  repository: NotificationActionExecutionRepository;
}): Promise<ExecuteRetryNotificationResult> {
  const context = await args.repository.getExecutionContext(
    args.action.orderId,
  );

  if (!context) {
    return {
      status: "NOT_FOUND",
      reason: `Order ${args.action.orderId} was not found.`,
    };
  }

  const gate = evaluateActionGate({ action: args.action, context });

  if (gate.status === "DENIED") {
    return {
      status: "DENIED",
      reason: gate.reason,
    };
  }

  if (gate.status === "BLOCKED_BY_CURRENT_STATE") {
    return {
      status: "BLOCKED_BY_CURRENT_STATE",
      reason: gate.reason,
      validationReasons: gate.validationReasons,
    };
  }

  if (gate.status !== "READY_TO_EXECUTE") {
    return {
      status: "BLOCKED_BY_CURRENT_STATE",
      reason:
        "Notification retry is not executable in the current authorization state.",
      validationReasons: [],
    };
  }

  const write = await args.repository.retryNotification(args.action.orderId);

  if (write.status === "PRECONDITION_FAILED") {
    return {
      status: "BLOCKED_BY_CURRENT_STATE",

      reason:
        "Notification retry preconditions changed before the write completed.",

      validationReasons: write.reasons,
    };
  }

  return {
    status: "EXECUTED",

    notificationId: write.notificationId,

    notificationStatus: write.notificationStatus,
  };
}
