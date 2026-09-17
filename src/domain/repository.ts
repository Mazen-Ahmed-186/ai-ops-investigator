import {
  accountDeliveries,
  entitlements,
  fulfillmentAttempts,
  notifications,
  orderEvents,
  orders,
  payments,
} from "./fixtures.js";

export function getOrderById(orderId: string) {
  return orders.find((order) => order.id === orderId) ?? null;
}

export function getPaymentsByOrderId(orderId: string) {
  return payments.filter((payment) => payment.orderId === orderId);
}

export function getFulfillmentAttemptsByOrderId(orderId: string) {
  return fulfillmentAttempts.filter((attempt) => attempt.orderId === orderId);
}

export function getEntitlementsByOrderId(orderId: string) {
  return entitlements.filter((entitlement) => entitlement.orderId === orderId);
}

export function getAccountDeliveriesByOrderId(orderId: string) {
  const orderEntitlements = getEntitlementsByOrderId(orderId);
  const entitlementIds = new Set(
    orderEntitlements.map((entitlement) => entitlement.id),
  );

  return accountDeliveries.filter((delivery) =>
    entitlementIds.has(delivery.entitlementId),
  );
}

export function getNotificationsByOrderId(orderId: string) {
  return notifications.filter(
    (notification) => notification.orderId === orderId,
  );
}

export function getOrderEventsByOrderId(orderId: string) {
  return orderEvents
    .filter((event) => event.orderId === orderId)
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
}
