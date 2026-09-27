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

type NotificationTrialResult = {
  trial: number;
  passed: boolean;
  status: string;
  diagnosisStatus: string;
  rootCauseCategory: string;
  confidence: string;
  requiresMoreEvidence: boolean;
  toolCalls: number;
  notificationIssue: boolean;
  unrelatedIssues: number;
  inspectedNotification: boolean;
  inspectedCompletionEvidence: boolean;
  usedProcessingTrace: boolean;
  failure: string | null;
};

const trials = 5;
const results: NotificationTrialResult[] = [];

for (let trial = 1; trial <= trials; trial += 1) {
  console.log(
    `\n=== Notification-only investigation trial ${trial}/${trials} ===\n`,
  );

  const store = new EvalInvestigationStore();

  const runId = `RUN-EVAL-NOTIFICATION-ONLY-${trial}`;

  try {
    const investigation = await runAgentInvestigation("ORD-4001", {
      runId,
      store,
    });

    if (investigation.status !== "COMPLETED") {
      throw new Error(
        `Expected COMPLETED investigation; received ${investigation.status}.`,
      );
    }

    const assessment = investigation.assessment;

    const notificationIssue = assessment.findings.some(
      (finding) =>
        finding.kind === "ISSUE" && finding.category === "NOTIFICATION",
    );

    const unrelatedIssues = assessment.findings.filter(
      (finding) =>
        finding.kind === "ISSUE" && finding.category !== "NOTIFICATION",
    ).length;

    const persisted = await store.get(runId);

    if (!persisted) {
      throw new Error(`Investigation ${runId} was not persisted.`);
    }

    const inspectedNotification = persisted.toolExecutions.some(
      (execution) => execution.tool === "get_notification_state",
    );

    const inspectedCompletionEvidence = persisted.toolExecutions.some(
      (execution) =>
        execution.tool === "get_delivery_state" ||
        execution.tool === "get_order_event_history" ||
        execution.tool === "get_fulfillment_attempts",
    );

    const usedProcessingTrace = persisted.toolExecutions.some(
      (execution) => execution.tool === "get_order_processing_trace",
    );

    const passed =
      assessment.diagnosisStatus === "DIAGNOSIS_READY" &&
      assessment.rootCauseCategory === "NOTIFICATION" &&
      assessment.requiresMoreEvidence === false &&
      notificationIssue &&
      unrelatedIssues === 0 &&
      inspectedNotification &&
      inspectedCompletionEvidence;

    results.push({
      trial,
      passed,
      status: investigation.status,
      diagnosisStatus: assessment.diagnosisStatus,
      rootCauseCategory: assessment.rootCauseCategory,
      confidence: assessment.confidence,
      requiresMoreEvidence: assessment.requiresMoreEvidence,
      toolCalls: investigation.toolCalls,
      notificationIssue,
      unrelatedIssues,
      inspectedNotification,
      inspectedCompletionEvidence,
      usedProcessingTrace,
      failure: passed
        ? null
        : "Investigation did not satisfy the notification-only semantic contract.",
    });

    console.log({
      trial,
      passed,
      diagnosisStatus: assessment.diagnosisStatus,
      rootCauseCategory: assessment.rootCauseCategory,
      confidence: assessment.confidence,
      requiresMoreEvidence: assessment.requiresMoreEvidence,
      toolCalls: investigation.toolCalls,
      notificationIssue,
      unrelatedIssues,
      inspectedNotification,
      inspectedCompletionEvidence,
      usedProcessingTrace,
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
      notificationIssue: false,
      unrelatedIssues: 0,
      inspectedNotification: false,
      inspectedCompletionEvidence: false,
      usedProcessingTrace: false,
      failure:
        error instanceof Error ? error.message : "Unknown evaluation failure.",
    });

    console.error(`Trial ${trial} failed:`, error);
  }
}

console.log("\n=== Notification-only investigation stability ===\n");

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
    notificationIssue: result.notificationIssue,
    unrelatedIssues: result.unrelatedIssues,
    processingTrace: result.usedProcessingTrace,
  })),
);

const passed = results.filter((result) => result.passed).length;

const notificationDiagnoses = results.filter(
  (result) => result.rootCauseCategory === "NOTIFICATION",
).length;

const unrelatedIssueTrials = results.filter(
  (result) => result.unrelatedIssues > 0,
).length;

const processingTraceCalls = results.filter(
  (result) => result.usedProcessingTrace,
).length;

console.log({
  trials,
  passed,
  failed: trials - passed,
  passRate: passed / trials,
  notificationDiagnoses,
  unrelatedIssueTrials,
  processingTraceCalls,
});

if (passed !== trials) {
  throw new Error(
    `${trials - passed} notification-only investigation trial(s) failed.`,
  );
}

console.log(
  `\n${passed}/${trials} notification-only investigation trials passed`,
);
