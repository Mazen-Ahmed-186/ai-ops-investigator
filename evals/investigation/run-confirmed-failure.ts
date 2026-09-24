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

const orderId = "ORD-2001";

const store = new EvalInvestigationStore();

console.log("\n=== Confirmed fulfillment failure investigation ===\n");

const result = await runAgentInvestigation(orderId, {
  runId: "RUN-EVAL-CONFIRMED-FAILURE",

  store,
});

if (result.status !== "COMPLETED") {
  throw new Error(
    `Expected completed investigation; received ${result.status}.`,
  );
}

const assessment = result.assessment;

console.log("\nInvestigation assessment:");

console.dir(assessment, {
  depth: null,
});

const persisted = await store.get(result.runId);

if (!persisted) {
  throw new Error(`Investigation ${result.runId} was not persisted.`);
}

console.log(
  "\nTool sequence:",
  persisted.toolExecutions.map((execution) => execution.tool),
);

if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error(
    "Confirmed failure investigation unexpectedly requires more evidence.",
  );
}

const fulfillmentFindings = assessment.findings.filter(
  (finding) => finding.category === "FULFILLMENT",
);

if (fulfillmentFindings.length === 0) {
  throw new Error("Investigation produced no FULFILLMENT finding.");
}

if (result.toolCalls > 8) {
  throw new Error(
    `Investigation exceeded the 8-call budget with ${result.toolCalls} calls.`,
  );
}

console.log("Investigation result:", {
  status: result.status,

  diagnosisStatus: assessment.diagnosisStatus,

  rootCauseCategory: assessment.rootCauseCategory,

  confidence: assessment.confidence,

  requiresMoreEvidence: assessment.requiresMoreEvidence,

  toolCalls: result.toolCalls,
});

console.log("\nSummary:\n", assessment.summary);

console.log("\nFindings:");

console.table(
  assessment.findings.map((finding) => ({
    category: finding.category,

    kind: finding.kind,

    summary: finding.summary,
  })),
);

console.log(
  "\nConfirmed fulfillment failure investigation passed structural checks.",
);
