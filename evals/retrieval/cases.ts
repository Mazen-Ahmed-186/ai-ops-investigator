export type RetrievalEvalCase = {
  id: string;
  query: string;
  expectedRunbookIds: string[];
  limit: number;
};

export const retrievalEvalCases: RetrievalEvalCase[] = [
  {
    id: "database-timeout",
    query: "order completion database timeout after successful delivery",
    expectedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    limit: 2,
  },

  {
    id: "notification-failure",
    query: "customer email notification failed after delivery",
    expectedRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
    limit: 2,
  },

  {
    id: "unknown-fulfillment",
    query: "provider request timed out and fulfillment outcome is unknown",
    expectedRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
    limit: 2,
  },

  {
    id: "stuck-order-with-notification-failure",
    query:
      "order stuck processing after successful fulfillment and delivery because database status update timed out; notification also failed",
    expectedRunbookIds: ["RUNBOOK-DB-TIMEOUT", "RUNBOOK-NOTIFICATION-FAILURE"],
    limit: 3,
  },
  {
    id: "semantic-db-persistence-failure",
    query:
      "customer already received the item but the purchase never reached its final state because saving the completion failed",
    expectedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    limit: 2,
  },

  {
    id: "semantic-notification-failure",
    query:
      "the customer got the product successfully but never received the confirmation message",
    expectedRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
    limit: 2,
  },

  {
    id: "semantic-uncertain-provider-outcome",
    query:
      "the external supplier stopped responding after we submitted the request and we do not know whether it actually completed",
    expectedRunbookIds: ["RUNBOOK-UNKNOWN-FULFILLMENT"],
    limit: 2,
  },

  {
    id: "hard-negative-successful-fulfillment",
    query:
      "provider fulfillment succeeded and delivery is confirmed but the internal order status is stale",
    expectedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    limit: 3,
  },
];
