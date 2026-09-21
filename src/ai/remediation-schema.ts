import { z } from "zod";

export const RemediationRecommendationSchema = z.object({
  status: z.enum(["RECOMMENDATION_READY", "NO_APPLICABLE_RUNBOOK"]),
  summary: z.string(),
  actions: z.array(
    z.object({
      instruction: z.string(),
      supportedByRunbookIds: z.array(z.string()).min(1),
    }),
  ),
});

export type RemediationRecommendation = z.infer<
  typeof RemediationRecommendationSchema
>;
