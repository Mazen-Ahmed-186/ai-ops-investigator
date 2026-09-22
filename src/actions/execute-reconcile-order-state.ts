import type { ActionExecutionRepository } from "./action-execution-repository.js";
import { evaluateActionGate } from "./evaluate-action-gate.js";
import type { AgentActionRequest } from "./types.js";

export type ReconcileOrderStateAction = AgentActionRequest & {
  kind: "RECONCILE_ORDER_STATE";
};

export type ReconcileOrderStateExecutionResult =
  | {
      status: "EXECUTED";
      previousStatus: "PROCESSING";
      currentStatus: "FULFILLED";
    }
  | {
      status: "NO_OP";
      reason: string;
    }
  | {
      status: "NOT_FOUND";
      reason: string;
    }
  | {
      status: "BLOCKED_BY_CURRENT_STATE";
      reason: string;
      validationReasons: string[];
    }
  | {
      status: "DENIED";
      reason: string;
    };

export async function executeReconcileOrderState(args: {
  action: ReconcileOrderStateAction;
  repository: ActionExecutionRepository;
}): Promise<ReconcileOrderStateExecutionResult> {
  const context = await args.repository.getExecutionContext(
    args.action.orderId,
  );

  if (!context) {
    return {
      status: "NOT_FOUND",
      reason: `Order ${args.action.orderId} was not found.`,
    };
  }

  if (context.orderStatus === "FULFILLED") {
    return {
      status: "NO_OP",
      reason: "Order is already FULFILLED.",
    };
  }

  const gate = evaluateActionGate({
    action: args.action,
    context,
  });

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
      status: "DENIED",

      reason: `Unexpected gate status for order-state reconciliation: ${gate.status}.`,
    };
  }

  const writeResult = await args.repository.reconcileOrderStateToFulfilled(
    args.action.orderId,
  );

  switch (writeResult.status) {
    case "UPDATED":
      return {
        status: "EXECUTED",

        previousStatus: writeResult.previousStatus,

        currentStatus: writeResult.currentStatus,
      };

    case "ALREADY_FULFILLED":
      return {
        status: "NO_OP",

        reason: "Order is already FULFILLED.",
      };

    case "PRECONDITION_FAILED":
      return {
        status: "BLOCKED_BY_CURRENT_STATE",

        reason:
          "The execution-time state changed before the write could be safely committed.",

        validationReasons: writeResult.reasons,
      };
  }
}
