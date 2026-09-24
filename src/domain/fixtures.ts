import type {
  AccountDelivery,
  Entitlement,
  FulfillmentAttempt,
  Notification,
  Order,
  Payment,
  OrderEvent,
  OrderProcessingTraceEntry,
} from "./types.js";

export const orders: Order[] = [
  {
    id: "ORD-1001",
    status: "PROCESSING",
    createdAt: "2026-09-16T09:00:00.000Z",
    updatedAt: "2026-09-16T09:05:00.000Z",
  },
  {
    id: "ORD-2001",
    status: "PROCESSING",
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:03:00.000Z",
  },
];

export const payments: Payment[] = [
  {
    id: "PAY-1001",
    orderId: "ORD-1001",
    status: "CAPTURED",
    amount: 50,
    currency: "USD",
    updatedAt: "2026-09-16T09:01:00.000Z",
  },
  {
    id: "PAY-2001",
    orderId: "ORD-2001",
    status: "CAPTURED",
    amount: 75,
    currency: "USD",
    updatedAt: "2026-09-17T10:01:00.000Z",
  },
];

export const fulfillmentAttempts: FulfillmentAttempt[] = [
  {
    id: "FUL-1001",
    orderId: "ORD-1001",
    status: "SUCCEEDED",
    source: "EXTERNAL_PROVIDER",
    updatedAt: "2026-09-16T09:03:00.000Z",
  },
  {
    id: "FUL-2001",
    orderId: "ORD-2001",
    status: "CONFIRMED_FAILED",
    source: "EXTERNAL_PROVIDER",
    updatedAt: "2026-09-17T10:03:00.000Z",
  },
];

export const entitlements: Entitlement[] = [
  {
    id: "ENT-1001",
    orderId: "ORD-1001",
    fulfillmentAttemptId: "FUL-1001",
    status: "ACTIVE",
    createdAt: "2026-09-16T09:03:00.000Z",
  },
];

export const accountDeliveries: AccountDelivery[] = [
  {
    id: "DEL-1001",
    entitlementId: "ENT-1001",
    status: "DELIVERED",
    updatedAt: "2026-09-16T09:04:00.000Z",
  },
];

export const notifications: Notification[] = [
  {
    id: "NOT-1001",
    orderId: "ORD-1001",
    type: "EMAIL",
    status: "FAILED",
    updatedAt: "2026-09-16T09:05:00.000Z",
  },
];

export const orderEvents: OrderEvent[] = [
  {
    id: "EVT-1001",
    orderId: "ORD-1001",
    type: "ORDER_CREATED",
    occurredAt: "2026-09-16T09:00:00.000Z",
  },
  {
    id: "EVT-1002",
    orderId: "ORD-1001",
    type: "PAYMENT_CAPTURED",
    occurredAt: "2026-09-16T09:01:00.000Z",
  },
  {
    id: "EVT-1003",
    orderId: "ORD-1001",
    type: "FULFILLMENT_STARTED",
    occurredAt: "2026-09-16T09:02:00.000Z",
  },
  {
    id: "EVT-1004",
    orderId: "ORD-1001",
    type: "FULFILLMENT_SUCCEEDED",
    occurredAt: "2026-09-16T09:03:00.000Z",
  },
  {
    id: "EVT-1005",
    orderId: "ORD-1001",
    type: "ENTITLEMENT_DELIVERED",
    occurredAt: "2026-09-16T09:04:00.000Z",
  },
  {
    id: "EVT-1006",
    orderId: "ORD-1001",
    type: "NOTIFICATION_FAILED",
    occurredAt: "2026-09-16T09:05:00.000Z",
  },
  {
    id: "EVT-2001",
    orderId: "ORD-2001",
    type: "ORDER_CREATED",
    occurredAt: "2026-09-17T10:00:00.000Z",
  },
  {
    id: "EVT-2002",
    orderId: "ORD-2001",
    type: "PAYMENT_CAPTURED",
    occurredAt: "2026-09-17T10:01:00.000Z",
  },
  {
    id: "EVT-2003",
    orderId: "ORD-2001",
    type: "FULFILLMENT_STARTED",
    occurredAt: "2026-09-17T10:02:00.000Z",
  },
  {
    id: "EVT-2004",
    orderId: "ORD-2001",
    type: "FULFILLMENT_CONFIRMED_FAILED",
    occurredAt: "2026-09-17T10:03:00.000Z",
  },
];

export const orderProcessingTraces: OrderProcessingTraceEntry[] = [
  {
    id: "TRACE-1001",
    orderId: "ORD-1001",
    component: "order-completion-handler",
    event: "ORDER_COMPLETION_HANDLER_STARTED",
    occurredAt: "2026-09-16T09:04:01.000Z",
    detail: "Order completion processing started after entitlement delivery.",
  },
  {
    id: "TRACE-1002",
    orderId: "ORD-1001",
    component: "order-completion-handler",
    event: "ORDER_STATUS_UPDATE_ATTEMPTED",
    occurredAt: "2026-09-16T09:04:01.200Z",
    detail: "Attempted to transition order from PROCESSING to FULFILLED.",
  },
  {
    id: "TRACE-1003",
    orderId: "ORD-1001",
    component: "persistence",
    event: "DATABASE_TIMEOUT",
    occurredAt: "2026-09-16T09:04:02.000Z",
    detail:
      "Database operation timed out before the order status update was persisted.",
  },
  {
    id: "TRACE-1004",
    orderId: "ORD-1001",
    component: "order-completion-handler",
    event: "ORDER_COMPLETION_HANDLER_FAILED",
    occurredAt: "2026-09-16T09:04:02.100Z",
    detail:
      "Order completion handler terminated without persisting the FULFILLED transition.",
  },
  {
    id: "TRACE-2001",
    orderId: "ORD-2001",
    component: "fulfillment-provider-client",
    event: "PROVIDER_REQUEST_COMPLETED",
    occurredAt: "2026-09-17T10:02:58.000Z",
    detail:
      "The external fulfillment provider returned a completed response for the fulfillment request.",
  },
  {
    id: "TRACE-2002",
    orderId: "ORD-2001",
    component: "fulfillment-provider-client",
    event: "PROVIDER_CONFIRMED_FAILURE",
    occurredAt: "2026-09-17T10:03:00.000Z",
    detail:
      "The external fulfillment provider explicitly confirmed that fulfillment failed and no entitlement was issued.",
  },
];
