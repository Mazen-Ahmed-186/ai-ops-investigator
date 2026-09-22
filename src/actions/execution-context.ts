export type ActionExecutionContext = {
  orderStatus:
    | "PENDING_PAYMENT"
    | "PROCESSING"
    | "AWAITING_STOCK"
    | "FULFILLED"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";

  paymentCaptured: boolean;
  fulfillmentSucceeded: boolean;
  entitlementActive: boolean;
  accountDeliveryDelivered: boolean;
  notificationFailed: boolean;
  hasBlockingFulfillmentAttempt: boolean;
  refundAllowedByBusinessPolicy: boolean;
  refundAlreadyIssued: boolean;
};
