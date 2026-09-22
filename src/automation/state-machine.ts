import type { AutomationRun, AutomationRunStatus } from "./types.js";

const allowedTransitions: Record<AutomationRunStatus, AutomationRunStatus[]> = {
  PENDING: ["INVESTIGATING", "FAILED"],

  INVESTIGATING: ["PLANNING_REMEDIATION", "ESCALATED", "FAILED"],

  PLANNING_REMEDIATION: [
    "WAITING_FOR_APPROVAL",
    "EXECUTING",
    "ESCALATED",
    "FAILED",
  ],

  WAITING_FOR_APPROVAL: ["EXECUTING", "ESCALATED", "FAILED"],

  EXECUTING: ["VERIFYING", "ESCALATED", "FAILED"],

  VERIFYING: ["COMPLETED", "ESCALATED", "FAILED"],

  COMPLETED: [],

  ESCALATED: [],

  FAILED: [],
};

export function transitionAutomationRun(
  run: AutomationRun,
  nextStatus: AutomationRunStatus,
  now = new Date(),
): AutomationRun {
  if (!allowedTransitions[run.status].includes(nextStatus)) {
    throw new Error(
      `Invalid automation transition: ${run.status} -> ${nextStatus}.`,
    );
  }

  return {
    ...run,
    status: nextStatus,
    updatedAt: now.toISOString(),
  };
}
