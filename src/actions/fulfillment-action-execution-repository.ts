import type { ActionExecutionRepository } from "./action-execution-repository.js";

export type FulfillmentAttemptStatus =
  | "PENDING"
  | "ACTIVE"
  | "UNKNOWN"
  | "RECONCILING"
  | "SUCCEEDED"
  | "CONFIRMED_FAILED"
  | "ABORTED"
  | "MANUAL_REVIEW";

export type FulfillmentAttemptState = {
  id: string;
  status: FulfillmentAttemptStatus;
};

export type CreateFulfillmentAttemptWriteResult =
  | {
      status: "CREATED";
      attemptId: string;
      attemptStatus: "PENDING";
    }
  | {
      status: "PRECONDITION_FAILED";
      reasons: string[];
    };

export interface FulfillmentActionExecutionRepository extends ActionExecutionRepository {
  createFulfillmentAttempt(
    orderId: string,
  ): Promise<CreateFulfillmentAttemptWriteResult>;
}

export interface FulfillmentActionVerificationRepository extends ActionExecutionRepository {
  getFulfillmentAttempt(
    orderId: string,
    attemptId: string,
  ): Promise<FulfillmentAttemptState | null>;
}
