import type { ActionPolicyDecision, AgentActionRequest } from "./types.js";

export function evaluateActionPolicy(
  action: AgentActionRequest,
): ActionPolicyDecision {
  switch (action.kind) {
    case "RECONCILE_ORDER_STATE":
      return {
        decision: "ALLOW",
        reason:
          "Order-state reconciliation may proceed when deterministic execution-time invariants are satisfied.",
      };

    case "RETRY_NOTIFICATION":
      return {
        decision: "ALLOW",
        reason:
          "Notification retry does not alter payment or fulfillment state.",
      };

    case "CREATE_FULFILLMENT_ATTEMPT":
      return {
        decision: "REQUIRE_APPROVAL",
        reason:
          "Creating another fulfillment attempt may cause duplicate external fulfillment.",
      };

    case "ISSUE_REFUND":
      return {
        decision: "REQUIRE_APPROVAL",
        reason:
          "Refunds are financial actions and require explicit human approval.",
      };

    case "CANCEL_ORDER":
      return {
        decision: "DENY",
        reason:
          "Order cancellation is a manual operation and is not available to the agent.",
      };
  }
}
