import type { ActionExecutionContext } from "./execution-context.js";
import type { AgentActionRequest } from "./types.js";

export type ActionExecutionValidation =
  | {
      valid: true;
      reasons: [];
    }
  | {
      valid: false;
      reasons: string[];
    };

export function validateActionExecution(
  action: AgentActionRequest,
  context: ActionExecutionContext,
): ActionExecutionValidation {
  const reasons: string[] = [];

  switch (action.kind) {
    case "RECONCILE_ORDER_STATE": {
      if (context.orderStatus !== "PROCESSING") {
        reasons.push("Order must currently be PROCESSING.");
      }

      if (!context.paymentCaptured) {
        reasons.push("Payment must currently be captured.");
      }

      if (!context.fulfillmentSucceeded) {
        reasons.push("Fulfillment must currently be successful.");
      }

      if (!context.entitlementActive) {
        reasons.push("Entitlement must currently be active.");
      }

      if (!context.accountDeliveryDelivered) {
        reasons.push("Account delivery must currently be delivered.");
      }

      break;
    }

    case "RETRY_NOTIFICATION": {
      if (!context.accountDeliveryDelivered) {
        reasons.push(
          "Account delivery must be confirmed before retrying the notification.",
        );
      }

      if (!context.notificationFailed) {
        reasons.push("Notification must currently be failed.");
      }

      break;
    }

    case "CREATE_FULFILLMENT_ATTEMPT": {
      if (context.hasBlockingFulfillmentAttempt) {
        reasons.push("A blocking fulfillment attempt already exists.");
      }

      if (context.fulfillmentSucceeded) {
        reasons.push("Fulfillment has already succeeded.");
      }

      if (context.entitlementActive) {
        reasons.push("An active entitlement already exists.");
      }

      if (context.accountDeliveryDelivered) {
        reasons.push("Account delivery has already completed.");
      }

      if (
        context.orderStatus !== "PROCESSING" &&
        context.orderStatus !== "AWAITING_STOCK"
      ) {
        reasons.push("Order must currently be PROCESSING or AWAITING_STOCK.");
      }

      break;
    }

    case "ISSUE_REFUND": {
      if (!context.paymentCaptured) {
        reasons.push("A captured payment is required before issuing a refund.");
      }

      if (!context.refundAllowedByBusinessPolicy) {
        reasons.push("Refunds are not currently allowed by business policy.");
      }

      if (context.refundAlreadyIssued) {
        reasons.push("A refund has already been issued.");
      }

      break;
    }

    case "CANCEL_ORDER": {
      if (context.orderStatus === "FULFILLED") {
        reasons.push("A fulfilled order cannot be cancelled.");
      }

      break;
    }
  }

  if (reasons.length > 0) {
    return {
      valid: false,
      reasons,
    };
  }

  return {
    valid: true,
    reasons: [],
  };
}
