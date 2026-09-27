import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
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

type UnknownFulfillmentTrialResult = {
  trial: number;
  passed: boolean;
  status: string;
  diagnosisStatus: string;
  rootCauseCategory: string;
  confidence: string;
  requiresMoreEvidence: boolean;
  toolCalls: number;
  fulfillmentIssue: boolean;
  recognizesUnknownOutcome: boolean;
  incorrectlyClaimsConfirmedFailure: boolean;
  failure: string | null;
};

const trials = 5;

const results: UnknownFulfillmentTrialResult[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Unknown fulfillment investigation trial ${trial}/${trials} ===\n`,
  );

  const store = new EvalInvestigationStore();

  try {
    const investigation = await runAgentInvestigation("ORD-3001", {
      runId: `RUN-EVAL-UNKNOWN-FULFILLMENT-${trial}`,
      store,
    });

    if (investigation.status !== "COMPLETED") {
      throw new Error(
        `Expected COMPLETED investigation; received ${investigation.status}.`,
      );
    }

    const assessment = investigation.assessment;

    const fulfillmentIssue = assessment.findings.some(
      (finding) =>
        finding.kind === "ISSUE" && finding.category === "FULFILLMENT",
    );

    const assessmentText = [
      assessment.summary,
      ...assessment.findings.map((finding) => finding.summary),
    ]
      .join(" ")
      .toLowerCase();

    const recognizesUnknownOutcome =
      assessmentText.includes("unknown") ||
      assessmentText.includes("unconfirmed") ||
      assessmentText.includes("cannot determine") ||
      assessmentText.includes("could not determine");

    const incorrectlyClaimsConfirmedFailure =
      assessmentText.includes("provider confirmed failure") ||
      assessmentText.includes("confirmed fulfillment failure") ||
      assessmentText.includes("definitively failed") ||
      assessmentText.includes("terminal failure");

    const persisted = await store.get(investigation.runId);

    if (!persisted) {
      throw new Error(
        `Investigation ${investigation.runId} was not persisted.`,
      );
    }

    const inspectedFulfillment = persisted.toolExecutions.some(
      (execution) => execution.tool === "get_fulfillment_attempts",
    );

    const inspectedHistory = persisted.toolExecutions.some(
      (execution) => execution.tool === "get_order_event_history",
    );

    const inspectedTrace = persisted.toolExecutions.some(
      (execution) => execution.tool === "get_order_processing_trace",
    );

    const passed =
      assessment.diagnosisStatus === "DIAGNOSIS_READY" &&
      assessment.rootCauseCategory === "FULFILLMENT" &&
      assessment.requiresMoreEvidence === false &&
      fulfillmentIssue &&
      recognizesUnknownOutcome &&
      !incorrectlyClaimsConfirmedFailure &&
      inspectedFulfillment &&
      inspectedHistory &&
      inspectedTrace;

    results.push({
      trial,
      passed,
      status: investigation.status,
      diagnosisStatus: assessment.diagnosisStatus,
      rootCauseCategory: assessment.rootCauseCategory,
      confidence: assessment.confidence,
      requiresMoreEvidence: assessment.requiresMoreEvidence,
      toolCalls: investigation.toolCalls,
      fulfillmentIssue,
      recognizesUnknownOutcome,
      incorrectlyClaimsConfirmedFailure,
      failure: passed
        ? null
        : "Investigation did not satisfy the unknown-fulfillment semantic contract.",
    });

    console.log({
      trial,
      passed,
      diagnosisStatus: assessment.diagnosisStatus,
      rootCauseCategory: assessment.rootCauseCategory,
      confidence: assessment.confidence,
      requiresMoreEvidence: assessment.requiresMoreEvidence,
      toolCalls: investigation.toolCalls,
      fulfillmentIssue,
      recognizesUnknownOutcome,
      incorrectlyClaimsConfirmedFailure,
    });
  } catch (error) {
    results.push({
      trial,
      passed: false,
      status: "FAILED",
      diagnosisStatus: "UNKNOWN",
      rootCauseCategory: "UNKNOWN",
      confidence: "UNKNOWN",
      requiresMoreEvidence: false,
      toolCalls: 0,
      fulfillmentIssue: false,
      recognizesUnknownOutcome: false,
      incorrectlyClaimsConfirmedFailure: false,
      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });

    console.error(`Trial ${trial} failed:`, error);
  }
}

console.log("\n=== Unknown fulfillment investigation stability ===\n");

console.table(
  results.map((result) => ({
    trial: result.trial,
    passed: result.passed,
    status: result.status,
    diagnosisStatus: result.diagnosisStatus,
    rootCauseCategory: result.rootCauseCategory,
    confidence: result.confidence,
    requiresMoreEvidence: result.requiresMoreEvidence,
    toolCalls: result.toolCalls,
    fulfillmentIssue: result.fulfillmentIssue,
    recognizesUnknown: result.recognizesUnknownOutcome,
    falseConfirmedFailure: result.incorrectlyClaimsConfirmedFailure,
  })),
);

const passed = results.filter((result) => result.passed).length;

const diagnosisCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.diagnosisStatus] = (counts[result.diagnosisStatus] ?? 0) + 1;

    return counts;
  },
  {},
);

const rootCauseCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    counts[result.rootCauseCategory] =
      (counts[result.rootCauseCategory] ?? 0) + 1;

    return counts;
  },
  {},
);

const falseConfirmedFailures = results.filter(
  (result) => result.incorrectlyClaimsConfirmedFailure,
).length;

console.log({
  trials,
  passed,
  failed: trials - passed,
  passRate: passed / trials,
  falseConfirmedFailures,
  diagnosisCounts,
  rootCauseCounts,
});

if (passed !== trials) {
  throw new Error(
    `${trials - passed} unknown fulfillment investigation trial(s) failed.`,
  );
}

if (falseConfirmedFailures > 0) {
  throw new Error(
    `${falseConfirmedFailures} trial(s) incorrectly converted UNKNOWN fulfillment into confirmed failure.`,
  );
}

console.log(
  `\n${passed}/${trials} unknown fulfillment investigation trials passed`,
);
