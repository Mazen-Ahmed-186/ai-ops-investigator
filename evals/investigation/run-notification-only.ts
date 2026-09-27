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

const orderId = "ORD-4001";
const runId = "RUN-EVAL-NOTIFICATION-ONLY";

console.log("\n=== Notification-only investigation ===\n");

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

if (assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
  throw new Error(
    `Expected DIAGNOSIS_READY; received ${assessment.diagnosisStatus}.`,
  );
}

if (assessment.rootCauseCategory !== "NOTIFICATION") {
  throw new Error(
    `Expected NOTIFICATION root cause category; received ${assessment.rootCauseCategory}.`,
  );
}

if (assessment.requiresMoreEvidence) {
  throw new Error(
    "Notification failure is already established by authoritative notification state and order history.",
  );
}

const notificationIssue = assessment.findings.find(
  (finding) => finding.kind === "ISSUE" && finding.category === "NOTIFICATION",
);

if (!notificationIssue) {
  throw new Error(
    "Expected a NOTIFICATION issue describing the failed customer notification.",
  );
}

const unrelatedIssues = assessment.findings.filter(
  (finding) => finding.kind === "ISSUE" && finding.category !== "NOTIFICATION",
);

if (unrelatedIssues.length > 0) {
  throw new Error(
    `Notification-only incident produced unrelated ISSUE findings: ${unrelatedIssues
      .map((finding) => finding.category)
      .join(", ")}.`,
  );
}

const persisted = await store.get(runId);

if (!persisted) {
  throw new Error(`Investigation ${runId} was not persisted.`);
}

const inspectedOrder = persisted.toolExecutions.some(
  (execution) => execution.tool === "get_order",
);

if (!inspectedOrder) {
  throw new Error("Investigation did not inspect the current order state.");
}

const inspectedNotification = persisted.toolExecutions.some(
  (execution) => execution.tool === "get_notification_state",
);

if (!inspectedNotification) {
  throw new Error("Investigation did not inspect notification state.");
}

const inspectedCompletionEvidence = persisted.toolExecutions.some(
  (execution) =>
    execution.tool === "get_delivery_state" ||
    execution.tool === "get_order_event_history",
);

if (!inspectedCompletionEvidence) {
  throw new Error(
    "Investigation did not inspect evidence that the commerce workflow completed successfully.",
  );
}

const assessmentText = [
  assessment.summary,
  ...assessment.findings.map((finding) => finding.summary),
]
  .join(" ")
  .toLowerCase();

const recognizesNotificationFailure =
  assessmentText.includes("notification") || assessmentText.includes("email");

if (!recognizesNotificationFailure) {
  throw new Error(
    "Investigation did not explicitly recognize the notification failure.",
  );
}

const recognizesCompletedOrder =
  assessmentText.includes("fulfilled") ||
  assessmentText.includes("delivery") ||
  assessmentText.includes("delivered");

if (!recognizesCompletedOrder) {
  throw new Error(
    "Investigation did not recognize that the order/fulfillment flow had already completed.",
  );
}

console.log({
  status: investigation.status,
  diagnosisStatus: assessment.diagnosisStatus,
  rootCauseCategory: assessment.rootCauseCategory,
  confidence: assessment.confidence,
  requiresMoreEvidence: assessment.requiresMoreEvidence,
  toolCalls: investigation.toolCalls,
  notificationIssue: notificationIssue.summary,
  unrelatedIssues: unrelatedIssues.length,
  recognizesCompletedOrder,
});

console.log("\nAssessment:");
console.dir(assessment, {
  depth: null,
});

console.log("\nNotification-only investigation passed");
