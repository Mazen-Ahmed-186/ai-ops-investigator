import { evaluateOrderInvariants } from "./invariants.js";
import {
  getAccountDeliveriesByOrderId,
  getEntitlementsByOrderId,
  getFulfillmentAttemptsByOrderId,
  getNotificationsByOrderId,
  getOrderById,
  getPaymentsByOrderId,
} from "./repository.js";

export function buildOrderInvestigationContext(orderId: string) {
  return {
    order: getOrderById(orderId),
    payments: getPaymentsByOrderId(orderId),
    fulfillmentAttempts: getFulfillmentAttemptsByOrderId(orderId),
    entitlements: getEntitlementsByOrderId(orderId),
    accountDeliveries: getAccountDeliveriesByOrderId(orderId),
    notifications: getNotificationsByOrderId(orderId),
    deterministicFindings: evaluateOrderInvariants(orderId),
  };
}
