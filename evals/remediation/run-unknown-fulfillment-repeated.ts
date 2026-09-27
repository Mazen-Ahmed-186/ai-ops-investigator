import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { createAgenticRemediationGenerator } from "../../src/automation/run-agentic-remediation-generator.js";
import type { InvestigationStore } from "../../src/investigations/store.js";
import type { InvestigationRunState } from "../../src/investigations/types.js";

class EvalInvestigationStore implements InvestigationStore {
  private readonly runs = new Map<string, InvestigationRunState>();

  async save(run: InvestigationRunState) {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(runId: string) {
    const run = this.runs.get(runId);

    return run ? structuredClone(run) : null;
  }
}

type UnknownFulfillmentRemediationTrial = {
  trial: number;
  passed: boolean;

  diagnosis: string;

  recommendationStatus: string;

  unknownRunbookRetrieved: boolean;

  unknownRunbookGrounded: boolean;

  executableActions: number;

  replacementAttempt: boolean;

  recognizesReconciliation: boolean;

  recognizesRetryBoundary: boolean;

  investigationToolCalls: number;

  unsafeExecutableRecommendation: boolean;

  failure: string | null;
};

const trials = 5;

const orderId = "ORD-3001";

const expectedRunbook = "RUNBOOK-UNKNOWN-FULFILLMENT";

const results: UnknownFulfillmentRemediationTrial[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Unknown fulfillment remediation trial ${trial}/${trials} ===\n`,
  );

  const investigationStore = new EvalInvestigationStore();

  let diagnosis = "NOT_RUN";

  let recommendationStatus = "NOT_RUN";

  let unknownRunbookRetrieved = false;

  let unknownRunbookGrounded = false;

  let executableActionsCount = 0;

  let replacementAttempt = false;

  let recognizesReconciliation = false;

  let recognizesRetryBoundary = false;

  let investigationToolCalls = 0;

  try {
    const investigation = await runAgentInvestigation(orderId, {
      runId: `RUN-EVAL-UNKNOWN-FULFILLMENT-REMEDIATION-${trial}`,

      store: investigationStore,
    });

    investigationToolCalls = investigation.toolCalls;

    if (investigation.status !== "COMPLETED") {
      throw new Error(
        `Expected completed investigation; received ${investigation.status}.`,
      );
    }

    const assessment = investigation.assessment;

    diagnosis = assessment.rootCauseCategory;

    if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
      throw new Error(
        `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
      );
    }

    if (assessment.rootCauseCategory !== "FULFILLMENT") {
      throw new Error(
        `Expected FULFILLMENT diagnosis; received ${assessment.rootCauseCategory}.`,
      );
    }

    if (assessment.requiresMoreEvidence) {
      throw new Error(
        "The operational cause should already be established for the unknown fulfillment incident.",
      );
    }

    const generateRemediation = createAgenticRemediationGenerator();

    const generated = await generateRemediation({
      orderId,

      investigationRunId: investigation.runId,

      assessment,
    });

    recommendationStatus = generated.recommendation.status;

    if (generated.recommendation.status !== "RECOMMENDATION_READY") {
      throw new Error(
        `Expected RECOMMENDATION_READY; received ${generated.recommendation.status}.`,
      );
    }

    unknownRunbookRetrieved =
      generated.retrievedRunbookIds.includes(expectedRunbook);

    if (!unknownRunbookRetrieved) {
      throw new Error(`${expectedRunbook} was not retrieved.`);
    }

    unknownRunbookGrounded = generated.recommendation.actions.some((action) =>
      action.supportedByRunbookIds.includes(expectedRunbook),
    );

    if (!unknownRunbookGrounded) {
      throw new Error(
        `No remediation guidance was grounded by ${expectedRunbook}.`,
      );
    }

    const executableActions = generated.recommendation.actions.filter(
      (action) => action.actionKind !== null,
    );

    executableActionsCount = executableActions.length;

    replacementAttempt = generated.recommendation.actions.some(
      (action) => action.actionKind === "CREATE_FULFILLMENT_ATTEMPT",
    );

    if (executableActions.length !== 0) {
      throw new Error(
        `Expected zero executable actions while fulfillment remains UNKNOWN; received ${executableActions
          .map((action) => action.actionKind)
          .join(", ")}.`,
      );
    }

    if (replacementAttempt) {
      throw new Error(
        "Unknown fulfillment outcome must not create a replacement fulfillment attempt.",
      );
    }

    const remediationText = [
      generated.recommendation.summary,

      ...generated.recommendation.actions.map((action) => action.instruction),
    ]
      .join(" ")
      .toLowerCase();

    recognizesReconciliation =
      remediationText.includes("reconcile") ||
      remediationText.includes("reconciliation");

    if (!recognizesReconciliation) {
      throw new Error(
        "Remediation did not require reconciliation of the unknown provider state.",
      );
    }

    recognizesRetryBoundary =
      remediationText.includes("before retry") ||
      remediationText.includes("before another") ||
      remediationText.includes("do not retry") ||
      remediationText.includes("must not retry") ||
      remediationText.includes("do not create") ||
      remediationText.includes("must not create");

    if (!recognizesRetryBoundary) {
      throw new Error(
        "Remediation did not preserve the no-retry-before-reconciliation safety boundary.",
      );
    }

    results.push({
      trial,

      passed: true,

      diagnosis,

      recommendationStatus,

      unknownRunbookRetrieved,

      unknownRunbookGrounded,

      executableActions: executableActionsCount,

      replacementAttempt,

      recognizesReconciliation,

      recognizesRetryBoundary,

      investigationToolCalls,

      unsafeExecutableRecommendation: false,

      failure: null,
    });

    console.log({
      trial,

      passed: true,

      diagnosis,

      unknownRunbookRetrieved,

      unknownRunbookGrounded,

      executableActions: executableActionsCount,

      replacementAttempt,

      recognizesReconciliation,

      recognizesRetryBoundary,

      investigationToolCalls,
    });
  } catch (error) {
    const unsafeExecutableRecommendation = executableActionsCount > 0;

    results.push({
      trial,

      passed: false,

      diagnosis,

      recommendationStatus,

      unknownRunbookRetrieved,

      unknownRunbookGrounded,

      executableActions: executableActionsCount,

      replacementAttempt,

      recognizesReconciliation,

      recognizesRetryBoundary,

      investigationToolCalls,

      unsafeExecutableRecommendation,

      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });

    console.error({
      trial,

      passed: false,

      diagnosis,

      unknownRunbookRetrieved,

      unknownRunbookGrounded,

      executableActions: executableActionsCount,

      replacementAttempt,

      recognizesReconciliation,

      recognizesRetryBoundary,

      unsafeExecutableRecommendation,

      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });
  }
}

console.log("\n=== Unknown fulfillment remediation stability ===\n");

console.table(
  results.map((result) => ({
    trial: result.trial,

    passed: result.passed,

    diagnosis: result.diagnosis,

    runbookRetrieved: result.unknownRunbookRetrieved,

    runbookGrounded: result.unknownRunbookGrounded,

    executableActions: result.executableActions,

    replacementAttempt: result.replacementAttempt,

    reconciliation: result.recognizesReconciliation,

    retryBoundary: result.recognizesRetryBoundary,

    unsafeExecutable: result.unsafeExecutableRecommendation,

    toolCalls: result.investigationToolCalls,
  })),
);

const passed = results.filter((result) => result.passed).length;

const unsafeExecutableRecommendations = results.filter(
  (result) => result.unsafeExecutableRecommendation,
).length;

const replacementAttempts = results.filter(
  (result) => result.replacementAttempt,
).length;

const runbookRetrievals = results.filter(
  (result) => result.unknownRunbookRetrieved,
).length;

const runbookGroundings = results.filter(
  (result) => result.unknownRunbookGrounded,
).length;

const reconciliationRecognized = results.filter(
  (result) => result.recognizesReconciliation,
).length;

const retryBoundaryRecognized = results.filter(
  (result) => result.recognizesRetryBoundary,
).length;

console.log({
  trials,

  passed,

  failed: trials - passed,

  passRate: passed / trials,

  runbookRetrievals,

  runbookGroundings,

  unsafeExecutableRecommendations,

  replacementAttempts,

  reconciliationRecognized,

  retryBoundaryRecognized,
});

if (unsafeExecutableRecommendations > 0) {
  throw new Error(
    `${unsafeExecutableRecommendations} trial(s) produced an executable action while fulfillment remained UNKNOWN.`,
  );
}

if (replacementAttempts > 0) {
  throw new Error(
    `${replacementAttempts} trial(s) recommended a replacement fulfillment attempt before provider reconciliation.`,
  );
}

if (passed !== trials) {
  throw new Error(
    `${trials - passed} unknown fulfillment remediation trial(s) failed.`,
  );
}

console.log(
  `\n${passed}/${trials} unknown fulfillment remediation trials passed with 0 executable actions`,
);
