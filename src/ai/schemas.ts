import { z } from "zod";

export const IncidentAssessmentSchema = z.object({
  category: z.enum([
    "PAYMENT",
    "FULFILLMENT",
    "DELIVERY",
    "NOTIFICATION",
    "UNKNOWN",
  ]),

  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),

  summary: z.string(),

  requiresMoreEvidence: z.boolean(),
});

export type IncidentAssessment = z.infer<typeof IncidentAssessmentSchema>;
