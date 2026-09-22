import { randomUUID } from "node:crypto";

import type { AutomationRun } from "./types.js";

export function createAutomationRun(args: {
  orderId: string;
  id?: string;
  now?: Date;
}): AutomationRun {
  const now = args.now ?? new Date();

  const timestamp = now.toISOString();

  return {
    id: args.id ?? `AUTO-${randomUUID()}`,
    orderId: args.orderId,
    status: "PENDING",
    createdAt: timestamp,
    updatedAt: timestamp,
    investigationRunId: null,
    approvalId: null,
    actionExecutionId: null,
    failureReason: null,
    remediationRunId: null,
  };
}
