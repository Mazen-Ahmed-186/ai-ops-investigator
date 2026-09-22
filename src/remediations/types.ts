import { z } from "zod";

import { RemediationRecommendationSchema } from "../ai/remediation-schema.js";

export const RemediationRunStatusSchema = z.enum([
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export type RemediationRunStatus = z.infer<typeof RemediationRunStatusSchema>;

export const RemediationRunSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  automationRunId: z.string().min(1),
  investigationRunId: z.string().min(1),
  status: RemediationRunStatusSchema,
  recommendation: RemediationRecommendationSchema.nullable(),
  retrievedRunbookIds: z.array(z.string().min(1)),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  failureReason: z.string().nullable(),
});

export type RemediationRun = z.infer<typeof RemediationRunSchema>;
