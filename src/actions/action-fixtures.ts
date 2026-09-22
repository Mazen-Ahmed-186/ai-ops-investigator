import type { MutableCommerceOrderSeed } from "./in-memory-action-execution-repository.js";

export function createOrder1001ActionFixture(): MutableCommerceOrderSeed {
  return {
    order: {
      id: "ORD-1001",
      status: "PROCESSING",
    },

    payments: [
      {
        status: "CAPTURED",
      },
    ],

    fulfillmentAttempts: [
      {
        status: "SUCCEEDED",
      },
    ],

    entitlements: [
      {
        status: "ACTIVE",
      },
    ],

    accountDeliveries: [
      {
        status: "DELIVERED",
      },
    ],

    notifications: [
      {
        status: "FAILED",
      },
    ],

    refunds: [],

    refundAllowedByBusinessPolicy: true,
  };
}
