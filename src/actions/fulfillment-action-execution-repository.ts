import type { ActionExecutionRepository } from "./action-execution-repository.js";

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
