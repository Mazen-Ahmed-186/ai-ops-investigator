import type { ActionExecutionRepository } from "./action-execution-repository.js";
import type { NotificationStatus } from "../domain/types.js";

export type NotificationRetryState = {
  id: string;
  status: NotificationStatus;
};

export type RetryNotificationWriteResult =
  | {
      status: "CREATED";
      notificationId: string;
      notificationStatus: "PENDING";
    }
  | {
      status: "PRECONDITION_FAILED";
      reasons: string[];
    };

export interface NotificationActionExecutionRepository extends ActionExecutionRepository {
  retryNotification(orderId: string): Promise<RetryNotificationWriteResult>;
}

export interface NotificationActionVerificationRepository extends ActionExecutionRepository {
  getNotification(
    orderId: string,
    notificationId: string,
  ): Promise<NotificationRetryState | null>;
}
