import type { ActionExecutionContext } from "./execution-context.js";

export type ReconcileOrderStateWriteResult =
  | {
      status: "UPDATED";
      previousStatus: "PROCESSING";
      currentStatus: "FULFILLED";
    }
  | {
      status: "ALREADY_FULFILLED";
    }
  | {
      status: "PRECONDITION_FAILED";
      reasons: string[];
    };

export interface ActionExecutionRepository {
  getExecutionContext(orderId: string): Promise<ActionExecutionContext | null>;
  reconcileOrderStateToFulfilled(
    orderId: string,
  ): Promise<ReconcileOrderStateWriteResult>;
}
