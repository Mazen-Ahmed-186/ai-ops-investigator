export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PROCESSING"
  | "AWAITING_STOCK"
  | "FULFILLED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type PaymentStatus = "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";

export type FulfillmentAttemptStatus =
  | "PENDING"
  | "ACTIVE"
  | "UNKNOWN"
  | "RECONCILING"
  | "SUCCEEDED"
  | "CONFIRMED_FAILED"
  | "ABORTED"
  | "MANUAL_REVIEW";

export type EntitlementStatus = "ACTIVE" | "REVOKED";

export type AccountDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export type OrderEventType =
  | "ORDER_CREATED"
  | "PAYMENT_CAPTURED"
  | "FULFILLMENT_STARTED"
  | "FULFILLMENT_SUCCEEDED"
  | "FULFILLMENT_CONFIRMED_FAILED"
  | "ENTITLEMENT_DELIVERED"
  | "ORDER_FULFILLED"
  | "NOTIFICATION_SENT"
  | "NOTIFICATION_FAILED";

export type OrderProcessingTraceEvent =
  | "ORDER_COMPLETION_HANDLER_STARTED"
  | "ORDER_STATUS_UPDATE_ATTEMPTED"
  | "DATABASE_TIMEOUT"
  | "ORDER_COMPLETION_HANDLER_FAILED"
  | "PROVIDER_REQUEST_COMPLETED"
  | "PROVIDER_CONFIRMED_FAILURE";

export type OrderProcessingTraceEntry = {
  id: string;
  orderId: string;
  component: string;
  event: OrderProcessingTraceEvent;
  occurredAt: string;
  detail: string;
};

export type OrderEvent = {
  id: string;
  orderId: string;
  type: OrderEventType;
  occurredAt: string;
};

export type Order = {
  id: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  updatedAt: string;
};

export type FulfillmentAttempt = {
  id: string;
  orderId: string;
  status: FulfillmentAttemptStatus;
  source: "EXTERNAL_PROVIDER" | "LOCAL_INVENTORY";
  updatedAt: string;
};

export type Entitlement = {
  id: string;
  orderId: string;
  fulfillmentAttemptId: string;
  status: EntitlementStatus;
  createdAt: string;
};

export type AccountDelivery = {
  id: string;
  entitlementId: string;
  status: AccountDeliveryStatus;
  updatedAt: string;
};

export type Notification = {
  id: string;
  orderId: string;
  type: "EMAIL";
  status: NotificationStatus;
  updatedAt: string;
};
