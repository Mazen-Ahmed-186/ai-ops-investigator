export type RunbookSection = {
  id: string;
  title: string;
  content: string;
};

export const runbookSections: RunbookSection[] = [
  {
    id: "RUNBOOK-DB-TIMEOUT",
    title: "Order completion database timeout",
    content: [
      "When order fulfillment and account delivery succeeded but the final order status update timed out, do not repeat fulfillment.",
      "Re-read the current order, fulfillment, entitlement, and delivery state.",
      "If delivery is confirmed and the order remains PROCESSING, escalate the order-state reconciliation workflow.",
      "Do not create another fulfillment attempt solely because the order status is stale.",
    ].join(" "),
  },

  {
    id: "RUNBOOK-NOTIFICATION-FAILURE",
    title: "Customer notification failure",
    content: [
      "Notification failure does not change fulfillment state.",
      "Confirm that account delivery succeeded before retrying customer notification.",
      "Notification retries must not trigger a new payment or fulfillment attempt.",
    ].join(" "),
  },

  {
    id: "RUNBOOK-UNKNOWN-FULFILLMENT",
    title: "Unknown fulfillment outcome",
    content: [
      "When a provider request times out after the external side-effect boundary, treat the fulfillment outcome as unknown.",
      "Reconcile the provider state before retrying.",
      "Do not create a fallback fulfillment attempt while the external attempt remains unknown or reconciling.",
    ].join(" "),
  },
];
