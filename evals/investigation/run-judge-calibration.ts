import type { IncidentAssessment } from "../../src/ai/schemas.js";
import { investigationEvalCases } from "./cases.js";
import { judgeInvestigationAssessment } from "./judge-assessment.js";

type CalibrationCase = {
  id: string;
  assessment: IncidentAssessment;
  expectedPass: boolean;
};

const baseCase = investigationEvalCases.find(
  (evalCase) => evalCase.id === "completed-delivery-stale-order",
);

const judgeConfig = baseCase?.judge;

if (!judgeConfig) {
  throw new Error("Missing judge configuration for calibration case.");
}

const calibrationCases: CalibrationCase[] = [
  {
    id: "good-diagnosis",

    expectedPass: true,

    assessment: {
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "INFRASTRUCTURE",
      confidence: "HIGH",

      summary:
        "The order remains PROCESSING because the completion handler attempted to persist the FULFILLED transition, but a database timeout prevented the update from being saved. The notification failure is separate.",

      findings: [
        {
          category: "ORDER_STATE",
          kind: "ISSUE",
          summary:
            "The order remains PROCESSING after successful fulfillment and delivery.",
        },
        {
          category: "ORDER_STATE",
          kind: "EVIDENCE",
          summary:
            "The completion handler attempted the transition to FULFILLED but the database operation timed out before persistence.",
        },
        {
          category: "NOTIFICATION",
          kind: "ISSUE",
          summary: "The email notification failed separately.",
        },
      ],

      requiresMoreEvidence: false,
    },
  },

  {
    id: "wrong-notification-causality",

    expectedPass: false,

    assessment: {
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "NOTIFICATION",
      confidence: "HIGH",

      summary:
        "The failed email notification caused the order to remain PROCESSING.",

      findings: [
        {
          category: "NOTIFICATION",
          kind: "ISSUE",
          summary: "The email failure prevented the order from completing.",
        },
      ],

      requiresMoreEvidence: false,
    },
  },

  {
    id: "symptom-as-root-cause",

    expectedPass: false,

    assessment: {
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "ORDER_STATE",
      confidence: "HIGH",

      summary: "The root cause is that the order remained PROCESSING.",

      findings: [
        {
          category: "ORDER_STATE",
          kind: "ISSUE",
          summary: "The order did not transition to FULFILLED.",
        },
      ],

      requiresMoreEvidence: false,
    },
  },

  {
    id: "unsupported-causal-claim",

    expectedPass: false,

    assessment: {
      diagnosisStatus: "DIAGNOSIS_READY",
      rootCauseCategory: "PAYMENT",
      confidence: "HIGH",

      summary:
        "The payment capture caused the database timeout and prevented order completion.",

      findings: [
        {
          category: "PAYMENT",
          kind: "ISSUE",
          summary: "The captured payment overloaded the database.",
        },
      ],

      requiresMoreEvidence: false,
    },
  },
];

async function evaluate() {
  const results = [];

  for (const calibrationCase of calibrationCases) {
    const judgment = await judgeInvestigationAssessment({
      assessment: calibrationCase.assessment,
      referenceFacts: judgeConfig.referenceFacts,
      criteria: judgeConfig.criteria,
    });

    const passed = judgment.passed === calibrationCase.expectedPass;

    results.push({
      id: calibrationCase.id,
      expectedPass: calibrationCase.expectedPass,
      actualPass: judgment.passed,
      calibratedCorrectly: passed,
    });

    console.log(`\n=== ${calibrationCase.id} ===`);

    console.table(judgment.criteria);

    console.log({
      expectedPass: calibrationCase.expectedPass,
      actualPass: judgment.passed,
      calibratedCorrectly: passed,
    });
  }

  const correct = results.filter((result) => result.calibratedCorrectly).length;

  console.log("\nJudge calibration:");

  console.log({
    cases: results.length,
    correct,
    accuracy: correct / results.length,
  });
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
