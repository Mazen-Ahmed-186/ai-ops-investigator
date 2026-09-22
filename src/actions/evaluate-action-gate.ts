import type { ActionApproval } from "./approval.js";
import type { ActionExecutionContext } from "./execution-context.js";
import { expireApproval } from "./approval-lifecycle.js";
import { evaluateActionPolicy } from "./policy.js";
import type { AgentActionRequest } from "./types.js";
import { validateActionExecution } from "./validate-action-execution.js";
import { approvalMatchesAction } from "./approval-matches-action.js";

export type ActionGateResult =
  | {
      status: "READY_TO_EXECUTE";
      reason: string;
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
      status: "BLOCKED_BY_CURRENT_STATE";
      reason: string;
      validationReasons: string[];
    };

export function evaluateActionGate(args: {
  action: AgentActionRequest;
  context: ActionExecutionContext;
  approval?: ActionApproval;
  now?: Date;
}): ActionGateResult {
  const policy = evaluateActionPolicy(args.action);

  if (policy.decision === "DENY") {
    return {
      status: "DENIED",
      reason: policy.reason,
    };
  }

  if (policy.decision === "REQUIRE_APPROVAL") {
    if (!args.approval) {
      return {
        status: "PENDING_APPROVAL",
        reason: "This action requires explicit approval before execution.",
      };
    }

    if (!approvalMatchesAction(args.approval, args.action)) {
      return {
        status: "DENIED",

        reason: "The supplied approval does not match the requested action.",
      };
    }

    const approval = expireApproval(args.approval, args.now);

    switch (approval.status) {
      case "PENDING":
        return {
          status: "PENDING_APPROVAL",
          reason: "Approval has not yet been decided.",
        };

      case "REJECTED":
        return {
          status: "APPROVAL_REJECTED",
          reason: "The requested action was explicitly rejected.",
        };

      case "EXPIRED":
        return {
          status: "APPROVAL_EXPIRED",
          reason: "The approval expired before execution.",
        };

      case "CONSUMED":
        return {
          status: "APPROVAL_CONSUMED",
          reason:
            "The approval has already been consumed by a previous execution attempt.",
        };

      case "APPROVED":
        break;
    }
  }

  const validation = validateActionExecution(args.action, args.context);

  if (!validation.valid) {
    return {
      status: "BLOCKED_BY_CURRENT_STATE",
      reason:
        "The action is not safe to execute against the current system state.",
      validationReasons: validation.reasons,
    };
  }

  return {
    status: "READY_TO_EXECUTE",
    reason: "Authorization and current-state validation both passed.",
  };
}
