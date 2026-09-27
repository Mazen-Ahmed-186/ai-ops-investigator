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

const orderId = "ORD-3001";
const runId = "RUN-EVAL-UNKNOWN-FULFILLMENT";

console.log("\n=== Unknown fulfillment investigation ===\n");

const store = new EvalInvestigationStore();

const investigation = await runAgentInvestigation(orderId, {
  runId,
  store,
});

if (investigation.status !== "COMPLETED") {
  throw new Error(
    `Expected COMPLETED investigation; received ${investigation.status}.`,
  );
}

const assessment = investigation.assessment;

if (assessment.rootCauseCategory !== "FULFILLMENT") {
  throw new Error(
    `Expected FULFILLMENT root cause category; received ${assessment.rootCauseCategory}.`,
  );
}

if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error(
    "The operational cause is already established: the provider request timed out after the possible side-effect boundary and left fulfillment outcome UNKNOWN.",
  );
}

const fulfillmentIssue = assessment.findings.find(
  (finding) => finding.kind === "ISSUE" && finding.category === "FULFILLMENT",
);

if (!fulfillmentIssue) {
  throw new Error(
    "Expected a FULFILLMENT issue describing the ambiguous provider outcome.",
  );
}

const persisted = await store.get(runId);

if (!persisted) {
  throw new Error(`Investigation ${runId} was not persisted.`);
}

const fulfillmentObservation = persisted.toolExecutions.find(
  (execution) => execution.tool === "get_fulfillment_attempts",
);

if (!fulfillmentObservation) {
  throw new Error("Investigation did not inspect fulfillment attempts.");
}

const eventHistoryObservation = persisted.toolExecutions.find(
  (execution) => execution.tool === "get_order_event_history",
);

if (!eventHistoryObservation) {
  throw new Error("Investigation did not inspect order event history.");
}

const processingTraceObservation = persisted.toolExecutions.find(
  (execution) => execution.tool === "get_order_processing_trace",
);

if (!processingTraceObservation) {
  throw new Error(
    "Investigation did not inspect the provider execution trace.",
  );
}

const assessmentText = [
  assessment.summary,
  ...assessment.findings.map((finding) => finding.summary),
]
  .join(" ")
  .toLowerCase();

const incorrectlyClaimsConfirmedFailure =
  assessmentText.includes("provider confirmed failure") ||
  assessmentText.includes("confirmed fulfillment failure") ||
  assessmentText.includes("definitively failed") ||
  assessmentText.includes("terminal failure");

if (incorrectlyClaimsConfirmedFailure) {
  throw new Error(
    "Investigation incorrectly converted an unknown provider outcome into a confirmed failure.",
  );
}

const recognizesUnknownOutcome =
  assessmentText.includes("unknown") ||
  assessmentText.includes("unconfirmed") ||
  assessmentText.includes("cannot determine") ||
  assessmentText.includes("could not determine");

if (!recognizesUnknownOutcome) {
  throw new Error(
    "Investigation did not explicitly recognize the fulfillment outcome as unknown or unconfirmed.",
  );
}

console.log({
  status: investigation.status,

  diagnosisStatus: assessment.diagnosisStatus,

  rootCauseCategory: assessment.rootCauseCategory,

  confidence: assessment.confidence,

  requiresMoreEvidence: assessment.requiresMoreEvidence,

  toolCalls: investigation.toolCalls,

  fulfillmentIssue: fulfillmentIssue.summary,
});

console.log("\nAssessment:");
console.dir(assessment, {
  depth: null,
});

console.log("\nUnknown fulfillment investigation passed");
