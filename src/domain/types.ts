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
