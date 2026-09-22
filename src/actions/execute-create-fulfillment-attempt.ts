import type { ApprovalStore } from "./approval-store.js";
import { evaluateActionGate } from "./evaluate-action-gate.js";
import type { FulfillmentActionExecutionRepository } from "./fulfillment-action-execution-repository.js";
import type { AgentActionRequest } from "./types.js";
import { consumeApproval } from "./approval-lifecycle.js";

export type CreateFulfillmentAttemptAction = AgentActionRequest & {
  kind: "CREATE_FULFILLMENT_ATTEMPT";
};

export type CreateFulfillmentAttemptExecutionResult =
  | {
      status: "EXECUTED";
      attemptId: string;
      attemptStatus: "PENDING";
    }
  | {
      status: "PENDING_APPROVAL";
      reason: string;
    }
  | {
      status: "APPROVAL_REJECTED";
      reason: string;
    }
  | {
      status: "APPROVAL_EXPIRED";
      reason: string;
    }
  | {
      status: "DENIED";
      reason: string;
    }
  | {
      status: "APPROVAL_CONSUMED";
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
    };

export async function executeCreateFulfillmentAttempt(args: {
  action: CreateFulfillmentAttemptAction;
  approvalId?: string;
  approvalStore: ApprovalStore;
  repository: FulfillmentActionExecutionRepository;
  executionId: string;
  now?: Date;
}): Promise<CreateFulfillmentAttemptExecutionResult> {
  const context = await args.repository.getExecutionContext(
    args.action.orderId,
  );

  const now = args.now ?? new Date();

  if (!context) {
    return {
      status: "NOT_FOUND",

      reason: `Order ${args.action.orderId} was not found.`,
    };
  }

  if (!args.approvalId) {
    return {
      status: "PENDING_APPROVAL",
      reason: "This action requires a persisted approval before execution.",
    };
  }

  const approval = await args.approvalStore.get(args.approvalId);

  if (!approval) {
    return {
      status: "PENDING_APPROVAL",
      reason: `Approval ${args.approvalId} was not found.`,
    };
  }

  const gate = evaluateActionGate({
    action: args.action,
    context,
    approval,
    now,
  });

  switch (gate.status) {
    case "PENDING_APPROVAL":
      return gate;

    case "APPROVAL_REJECTED":
      return gate;

    case "APPROVAL_EXPIRED":
      return gate;

    case "DENIED":
      return gate;

    case "APPROVAL_CONSUMED":
      return gate;

    case "BLOCKED_BY_CURRENT_STATE":
      return gate;

    case "READY_TO_EXECUTE":
      break;
  }

  const consumedApproval = consumeApproval({
    approval,
    executionId: args.executionId,
    now,
  });

  await args.approvalStore.save(consumedApproval);

  const writeResult = await args.repository.createFulfillmentAttempt(
    args.action.orderId,
  );

  if (writeResult.status === "PRECONDITION_FAILED") {
    return {
      status: "BLOCKED_BY_CURRENT_STATE",
      reason:
        "The execution-time state changed before the fulfillment attempt could be safely created.",
      validationReasons: writeResult.reasons,
    };
  }

  return {
    status: "EXECUTED",
    attemptId: writeResult.attemptId,
    attemptStatus: writeResult.attemptStatus,
  };
}
