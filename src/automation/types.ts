import { z } from "zod";

export const AutomationRunStatusSchema = z.enum([
  "PENDING",
  "INVESTIGATING",
  "PLANNING_REMEDIATION",
  "WAITING_FOR_APPROVAL",
  "EXECUTING",
  "VERIFYING",
  "COMPLETED",
  "ESCALATED",
  "FAILED",
]);

export type AutomationRunStatus = z.infer<typeof AutomationRunStatusSchema>;

export const AutomationRunSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  status: AutomationRunStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  investigationRunId: z.string().min(1).nullable(),
  approvalId: z.string().min(1).nullable(),
  actionExecutionId: z.string().min(1).nullable(),
  failureReason: z.string().nullable(),
  remediationRunId: z.string().min(1).nullable(),
});

export type AutomationRun = z.infer<typeof AutomationRunSchema>;
