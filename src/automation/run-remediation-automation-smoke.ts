import { randomUUID } from "node:crypto";

import type { IncidentAssessment } from "../ai/schemas.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import type { InvestigationRunState } from "../investigations/types.js";
import { FileRemediationStore } from "../remediations/file-remediation-store.js";
import { continueAutomationRemediationPlanning } from "./continue-remediation-planning.js";
import { createAutomationRun } from "./create-automation-run.js";
import { createDurableRemediationRunner } from "./durable-remediation-runner.js";
import { FileAutomationStore } from "./file-automation-store.js";
import { createInvestigationBackedRemediationPlanner } from "./investigation-backed-remediation-planner.js";
import { createAgenticRemediationGenerator } from "./run-agentic-remediation-generator.js";
import { transitionAutomationRun } from "./state-machine.js";

function createAssessment(): IncidentAssessment {
  return {
    diagnosisStatus: "DIAGNOSIS_READY",

    rootCauseCategory: "INFRASTRUCTURE",

    confidence: "HIGH",

    summary:
      "Order ORD-1001 is stuck in PROCESSING because the completion handler attempted to transition it to FULFILLED after successful payment, fulfillment, entitlement creation, and account delivery, but a database timeout prevented the final order-state update from being persisted. The failed email notification is a separate issue and is not established as the cause.",

    findings: [
      {
        category: "ORDER_STATE",
        kind: "ISSUE",
        summary:
          "The order remains PROCESSING despite successful fulfillment and account delivery.",
      },
      {
        category: "PAYMENT",
        kind: "EVIDENCE",
        summary: "The payment was captured successfully.",
      },
      {
        category: "FULFILLMENT",
        kind: "EVIDENCE",
        summary: "The fulfillment attempt succeeded.",
      },
      {
        category: "DELIVERY",
        kind: "EVIDENCE",
        summary: "The entitlement is active and account delivery succeeded.",
      },
      {
        category: "ORDER_STATE",
        kind: "EVIDENCE",
        summary:
          "The completion handler attempted the PROCESSING to FULFILLED transition, but a database timeout occurred before persistence.",
      },
      {
        category: "NOTIFICATION",
        kind: "ISSUE",
        summary:
          "The customer email notification failed separately and is not established as the cause of the stale order state.",
      },
    ],

    requiresMoreEvidence: false,
  };
}

function createCompletedInvestigation(args: {
  investigationRunId: string;
  orderId: string;
}): InvestigationRunState {
  const timestamp = new Date().toISOString();

  return {
    id: args.investigationRunId,

    orderId: args.orderId,

    goal: `Determine why order ${args.orderId} is stuck.`,

    status: "COMPLETED",

    workingMemory: {
      facts: [],
      unresolvedQuestions: [],
    },

    startedAt: timestamp,

    updatedAt: timestamp,

    toolCalls: 7,

    executedToolCallSignatures: [],

    toolExecutions: [],

    continuation: null,

    assessment: createAssessment(),

    failureReason: null,
  };
}

async function main() {
  const orderId = "ORD-1001";

  const automationRunId = `AUTO-RAG-${randomUUID()}`;

  const investigationRunId = `INV-${automationRunId}`;

  const automationStore = new FileAutomationStore();

  const investigationStore = new FileInvestigationStore();

  const remediationStore = new FileRemediationStore();

  console.log("\n=== Phase 1: persist completed investigation fixture ===");

  await investigationStore.save(
    createCompletedInvestigation({
      investigationRunId,
      orderId,
    }),
  );

  let automation = createAutomationRun({
    id: automationRunId,
    orderId,
  });

  automation = transitionAutomationRun(automation, "INVESTIGATING");

  automation = {
    ...automation,

    investigationRunId,
  };

  automation = transitionAutomationRun(automation, "PLANNING_REMEDIATION");

  await automationStore.save(automation);

  console.dir(automation, {
    depth: null,
  });

  console.log("\n=== Phase 2: real grounded remediation planning ===");

  const remediationRunner = createDurableRemediationRunner({
    store: remediationStore,

    planner: createInvestigationBackedRemediationPlanner({
      investigationStore,

      generate: createAgenticRemediationGenerator(),
    }),
  });

  const planned = await continueAutomationRemediationPlanning({
    automationRunId,

    store: automationStore,

    remediationRunner,
  });

  console.log("\nAutomation after remediation planning:");

  console.dir(planned, {
    depth: null,
  });

  if (!planned.remediationRunId) {
    throw new Error("Automation did not persist a remediation run id.");
  }

  const remediation = await remediationStore.get(planned.remediationRunId);

  if (!remediation) {
    throw new Error(`Remediation ${planned.remediationRunId} was not found.`);
  }

  console.log("\nPersisted remediation:");

  console.dir(remediation, {
    depth: null,
  });

  if (remediation.status !== "COMPLETED") {
    throw new Error(
      `Expected remediation COMPLETED, received ${remediation.status}.`,
    );
  }

  if (remediation.recommendation?.status !== "RECOMMENDATION_READY") {
    throw new Error(
      `Expected RECOMMENDATION_READY, received ${remediation.recommendation?.status ?? "missing"}.`,
    );
  }

  if (remediation.retrievedRunbookIds.length === 0) {
    throw new Error(
      "Expected the recommendation to be grounded in at least one retrieved runbook.",
    );
  }

  console.log("\nInvestigation → grounded remediation smoke passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
