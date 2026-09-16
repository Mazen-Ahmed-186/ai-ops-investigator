import {
  getAccountDeliveriesByOrderId,
  getEntitlementsByOrderId,
  getFulfillmentAttemptsByOrderId,
  getOrderById,
} from "./repository.js";

export type DomainFinding = {
  code: string;
  message: string;
};

export function evaluateOrderInvariants(orderId: string): DomainFinding[] {
  const order = getOrderById(orderId);

  if (!order) {
    return [];
  }

  const attempts = getFulfillmentAttemptsByOrderId(orderId);
  const entitlements = getEntitlementsByOrderId(orderId);
  const deliveries = getAccountDeliveriesByOrderId(orderId);

  const hasSuccessfulAttempt = attempts.some(
    (attempt) => attempt.status === "SUCCEEDED",
  );

  const hasActiveEntitlement = entitlements.some(
    (entitlement) => entitlement.status === "ACTIVE",
  );

  const hasDeliveredAccountAccess = deliveries.some(
    (delivery) => delivery.status === "DELIVERED",
  );

  if (
    order.status === "PROCESSING" &&
    hasSuccessfulAttempt &&
    hasActiveEntitlement &&
    hasDeliveredAccountAccess
  ) {
    return [
      {
        code: "ORDER_STATE_INCONSISTENCY",
        message:
          "Order remains PROCESSING after successful fulfillment and account delivery.",
      },
    ];
  }

  return [];
}
