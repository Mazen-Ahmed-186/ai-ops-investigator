import type { ActionApproval } from "./approval.js";
import type { AgentActionRequest } from "./types.js";

export function approvalMatchesAction(
  approval: ActionApproval,
  action: AgentActionRequest,
) {
  return (
    approval.action.kind === action.kind &&
    approval.action.orderId === action.orderId &&
    approval.action.reason === action.reason
  );
}
