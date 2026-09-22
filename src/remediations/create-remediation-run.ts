import { randomUUID } from "node:crypto";

import type { RemediationRun } from "./types.js";

export function createRemediationRun(args: {
  orderId: string;
  automationRunId: string;
  investigationRunId: string;
  id?: string;
  now?: Date;
}): RemediationRun {
  const now = args.now ?? new Date();

  const timestamp = now.toISOString();

  return {
    id: args.id ?? `REM-${randomUUID()}`,
    orderId: args.orderId,
    automationRunId: args.automationRunId,
    investigationRunId: args.investigationRunId,
    status: "RUNNING",
    recommendation: null,
    retrievedRunbookIds: [],
    startedAt: timestamp,
    updatedAt: timestamp,
    failureReason: null,
  };
}
