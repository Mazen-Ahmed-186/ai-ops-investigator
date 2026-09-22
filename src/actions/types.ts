export type AgentActionKind =
  | "RECONCILE_ORDER_STATE"
  | "RETRY_NOTIFICATION"
  | "CREATE_FULFILLMENT_ATTEMPT"
  | "ISSUE_REFUND"
  | "CANCEL_ORDER";

export type AgentActionRequest = {
  kind: AgentActionKind;

  orderId: string;

  reason: string;
};

export type ActionPolicyDecision =
  | {
      decision: "ALLOW";
      reason: string;
    }
  | {
      decision: "REQUIRE_APPROVAL";
      reason: string;
    }
  | {
      decision: "DENY";
      reason: string;
    };
