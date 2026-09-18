import { z } from "zod";

const FindingCategorySchema = z.enum([
  "PAYMENT",
  "FULFILLMENT",
  "DELIVERY",
  "NOTIFICATION",
  "ORDER_STATE",
  "UNKNOWN",
]);

const RootCauseCategorySchema = z.enum([
  "PAYMENT",
  "FULFILLMENT",
  "DELIVERY",
  "NOTIFICATION",
  "ORDER_STATE",
  "APPLICATION",
  "DEPENDENCY",
  "INFRASTRUCTURE",
  "UNKNOWN",
]);

const ConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const IncidentAssessmentSchema = z.object({
  diagnosisStatus: z.enum(["DIAGNOSIS_READY", "NEEDS_MORE_EVIDENCE"]),

  rootCauseCategory: RootCauseCategorySchema,

  confidence: ConfidenceSchema,

  summary: z.string(),

  findings: z.array(
    z.object({
      category: FindingCategorySchema,
      kind: z.enum(["ISSUE", "EVIDENCE"]),
      summary: z.string(),
    }),
  ),

  requiresMoreEvidence: z.boolean(),
});

export type IncidentAssessment = z.infer<typeof IncidentAssessmentSchema>;
