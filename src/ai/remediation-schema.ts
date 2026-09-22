import { z } from "zod";

import type { AgentActionRequest } from "../actions/types.js";

const remediationActionKinds = [
  "RECONCILE_ORDER_STATE",
  "RETRY_NOTIFICATION",
  "CREATE_FULFILLMENT_ATTEMPT",
  "ISSUE_REFUND",
  "CANCEL_ORDER",
] as const satisfies readonly AgentActionRequest["kind"][];

export const RemediationActionKindSchema = z.enum(remediationActionKinds);

export const RemediationActionSchema = z
  .object({
    disposition: z.enum(["PRIMARY", "FOLLOW_UP", "CONSTRAINT"]),
    actionKind: RemediationActionKindSchema.nullable(),
    instruction: z.string().min(1),
    supportedByRunbookIds: z.array(z.string().min(1)),
  })
  .superRefine((action, context) => {
    if (action.disposition === "CONSTRAINT" && action.actionKind !== null) {
      context.addIssue({
        code: "custom",
        path: ["actionKind"],
        message:
          "CONSTRAINT remediation actions cannot have an executable action kind.",
      });
    }

    if (action.disposition !== "CONSTRAINT" && action.actionKind === null) {
      context.addIssue({
        code: "custom",
        path: ["actionKind"],
        message: "Executable remediation actions require an action kind.",
      });
    }
  });

export const RemediationRecommendationSchema = z
  .object({
    status: z.enum(["RECOMMENDATION_READY", "NO_APPLICABLE_RUNBOOK"]),
    summary: z.string().min(1),
    actions: z.array(RemediationActionSchema),
  })
  .superRefine((recommendation, context) => {
    const primaryActions = recommendation.actions.filter(
      (action) => action.disposition === "PRIMARY",
    );

    if (primaryActions.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message:
          "A remediation recommendation cannot contain more than one PRIMARY action.",
      });
    }

    if (
      recommendation.status === "NO_APPLICABLE_RUNBOOK" &&
      recommendation.actions.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "NO_APPLICABLE_RUNBOOK cannot contain remediation actions.",
      });
    }
  });

export type RemediationRecommendation = z.infer<
  typeof RemediationRecommendationSchema
>;
