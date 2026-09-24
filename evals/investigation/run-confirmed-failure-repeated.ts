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

const trials = 5;

type TrialResult = {
  trial: number;
  passed: boolean;
  status: string;
  diagnosisStatus: string;
  rootCauseCategory: string;
  confidence: string;
  requiresMoreEvidence: boolean;
  toolCalls: number;
  fulfillmentIssue: boolean;
};

const results: TrialResult[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Confirmed failure investigation trial ${trial}/${trials} ===\n`,
  );

  const store = new EvalInvestigationStore();

  const result = await runAgentInvestigation("ORD-2001", {
    runId: `RUN-EVAL-CONFIRMED-FAILURE-${trial}`,
    store,
  });

  if (result.status !== "COMPLETED") {
    results.push({
      trial,
      passed: false,
      status: result.status,
      diagnosisStatus: "-",
      rootCauseCategory: "-",
      confidence: "-",
      requiresMoreEvidence: true,
      toolCalls: result.toolCalls,
      fulfillmentIssue: false,
    });

    continue;
  }

  const assessment = result.assessment;

  const fulfillmentIssue = assessment.findings.some(
    (finding) => finding.category === "FULFILLMENT" && finding.kind === "ISSUE",
  );

  const passed =
    assessment.diagnosisStatus === "DIAGNOSIS_READY" &&
    assessment.rootCauseCategory === "FULFILLMENT" &&
    assessment.requiresMoreEvidence === false &&
    fulfillmentIssue &&
    result.toolCalls <= 8;

  results.push({
    trial,
    passed,
    status: result.status,
    diagnosisStatus: assessment.diagnosisStatus,
    rootCauseCategory: assessment.rootCauseCategory,
    confidence: assessment.confidence,
    requiresMoreEvidence: assessment.requiresMoreEvidence,
    toolCalls: result.toolCalls,
    fulfillmentIssue,
  });
}

console.log("\n=== Confirmed failure investigation stability ===\n");

console.table(results);

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

console.log({
  trials,
  passed,
  failed: trials - passed,
  passRate: passed / trials,
  diagnosisCounts,
  rootCauseCounts,
});

if (passed !== trials) {
  throw new Error(
    "Confirmed fulfillment failure investigation is not yet stable across repeated trials.",
  );
}

console.log(
  `\n${passed}/${trials} confirmed failure investigation trials passed`,
);
