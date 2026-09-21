export type InvestigationJudgeCriterion = {
  id: string;
  description: string;
};

export type InvestigationEvalCase = {
  id: string;
  orderId: string;

  expectations: {
    diagnosisStatus: "DIAGNOSIS_READY" | "NEEDS_MORE_EVIDENCE";
    rootCauseCategory?: string;
    requiredFindingCategories?: string[];
    forbiddenRootCauseCategories?: string[];
    maxToolCalls?: number;
  };

  judge?: {
    referenceFacts: string[];
    criteria: InvestigationJudgeCriterion[];
  };
};

export const investigationEvalCases: InvestigationEvalCase[] = [
  {
    id: "completed-delivery-stale-order",

    orderId: "ORD-1001",

    expectations: {
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "INFRASTRUCTURE",
      requiredFindingCategories: [
        "ORDER_STATE",
        "PAYMENT",
        "FULFILLMENT",
        "DELIVERY",
      ],
      forbiddenRootCauseCategories: [
        "NOTIFICATION",
        "PAYMENT",
        "FULFILLMENT",
        "DELIVERY",
      ],
      maxToolCalls: 8,
    },

    judge: {
      referenceFacts: [
        "Payment PAY-1001 was captured.",
        "Fulfillment attempt FUL-1001 succeeded.",
        "The entitlement is active and account delivery succeeded.",
        "The completion handler attempted to transition the order from PROCESSING to FULFILLED.",
        "A database operation timed out before the FULFILLED transition was persisted.",
        "The email notification failed separately.",
      ],

      criteria: [
        {
          id: "causal-distinction",
          description:
            "The diagnosis distinguishes the stale PROCESSING order state from the causal database timeout that prevented the final status transition from being persisted.",
        },
        {
          id: "notification-separation",
          description:
            "The diagnosis treats the notification failure as a separate issue rather than the cause of the stuck order.",
        },
        {
          id: "evidence-grounding",
          description:
            "The diagnosis does not introduce causal claims that are unsupported by the reference facts.",
        },
      ],
    },
  },
];
