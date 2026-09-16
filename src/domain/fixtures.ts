import type {
  AccountDelivery,
  Entitlement,
  FulfillmentAttempt,
  Notification,
  Order,
  Payment,
} from "./types.js";

export const orders: Order[] = [
  {
    id: "ORD-1001",
    status: "PROCESSING",
    createdAt: "2026-09-16T09:00:00.000Z",
    updatedAt: "2026-09-16T09:05:00.000Z",
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
];

export const fulfillmentAttempts: FulfillmentAttempt[] = [
  {
    id: "FUL-1001",
    orderId: "ORD-1001",
    status: "SUCCEEDED",
    source: "EXTERNAL_PROVIDER",
    updatedAt: "2026-09-16T09:03:00.000Z",
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
