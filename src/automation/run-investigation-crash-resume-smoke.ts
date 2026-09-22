import { randomUUID } from "node:crypto";

import { runAgentInvestigation } from "../ai/run-agent-investigation.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import { createAgentInvestigationRunner } from "./agent-investigation-runner.js";
import { createAutomationRun } from "./create-automation-run.js";
import { FileAutomationStore } from "./file-automation-store.js";
import { createAutomationInvestigationRunId } from "./investigation-runner.js";
import { createRunAgentInvestigationExecutor } from "./run-agent-investigation-executor.js";
import { resumeAutomationInvestigation } from "./start-automation-investigation.js";
import { transitionAutomationRun } from "./state-machine.js";

async function main() {
  const orderId = "ORD-1001";

  const automationRunId = `AUTO-CRASH-${randomUUID()}`;

  const investigationRunId =
    createAutomationInvestigationRunId(automationRunId);

  console.log("\n=== Phase 1: prepare durable automation state ===");

  const automationStore = new FileAutomationStore();

  const investigationStore = new FileInvestigationStore();

  let automation = createAutomationRun({
    id: automationRunId,
    orderId,
  });

  await automationStore.save(automation);

  automation = transitionAutomationRun(automation, "INVESTIGATING");

  automation = {
    ...automation,
    investigationRunId,
  };

  await automationStore.save(automation);

  console.dir(automation, {
    depth: null,
  });

  console.log(
    "\n=== Phase 2: start real investigation and simulate process crash after 3 tools ===",
  );

  try {
    await runAgentInvestigation(orderId, {
      runId: investigationRunId,
      store: investigationStore,
      simulateCrashAfterToolCalls: 3,
    });

    throw new Error("Expected simulated investigation crash did not occur.");
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "SimulatedCrashError") {
      throw error;
    }

    console.log(error.message);
  }

  console.log("\n=== Phase 3: inspect durable state after interruption ===");

  const automationAfterCrash = await automationStore.get(automationRunId);

  const investigationAfterCrash =
    await investigationStore.get(investigationRunId);

  console.log("Automation after crash:");

  console.dir(automationAfterCrash, {
    depth: null,
  });

  console.log("Investigation after crash:");

  console.dir(
    {
      id: investigationAfterCrash?.id ?? null,
      status: investigationAfterCrash?.status ?? null,
      toolCalls: investigationAfterCrash?.toolCalls ?? null,
      continuation: investigationAfterCrash?.continuation?.kind ?? null,
    },
    {
      depth: null,
    },
  );

  if (automationAfterCrash?.status !== "INVESTIGATING") {
    throw new Error(
      `Expected automation to remain INVESTIGATING after interruption, received ${automationAfterCrash?.status ?? "missing"}.`,
    );
  }

  if (automationAfterCrash.investigationRunId !== investigationRunId) {
    throw new Error("Automation lost its durable investigation identity.");
  }

  if (investigationAfterCrash?.status !== "RUNNING") {
    throw new Error(
      `Expected investigation to remain RUNNING after interruption, received ${investigationAfterCrash?.status ?? "missing"}.`,
    );
  }

  if (investigationAfterCrash.toolCalls !== 3) {
    throw new Error(
      `Expected 3 persisted tool calls before interruption, received ${investigationAfterCrash.toolCalls}.`,
    );
  }

  console.log(
    "\n=== Phase 4: create fresh runtime objects and resume automation ===",
  );

  const freshAutomationStore = new FileAutomationStore();

  const freshInvestigationStore = new FileInvestigationStore();

  const investigationRunner = createAgentInvestigationRunner(
    createRunAgentInvestigationExecutor({
      store: freshInvestigationStore,
    }),
  );

  const resumed = await resumeAutomationInvestigation({
    automationRunId,
    store: freshAutomationStore,
    investigationRunner,
  });

  console.log("\nResumed automation:");

  console.dir(resumed, {
    depth: null,
  });

  const finalInvestigation =
    await freshInvestigationStore.get(investigationRunId);

  console.log("\nFinal investigation:");

  console.dir(
    {
      id: finalInvestigation?.id ?? null,
      status: finalInvestigation?.status ?? null,
      toolCalls: finalInvestigation?.toolCalls ?? null,
      diagnosisStatus: finalInvestigation?.assessment?.diagnosisStatus ?? null,
      rootCauseCategory:
        finalInvestigation?.assessment?.rootCauseCategory ?? null,
    },
    {
      depth: null,
    },
  );

  if (resumed.status !== "PLANNING_REMEDIATION") {
    throw new Error(
      `Expected resumed automation to reach PLANNING_REMEDIATION, received ${resumed.status}.`,
    );
  }

  if (finalInvestigation?.status !== "COMPLETED") {
    throw new Error(
      `Expected resumed investigation to complete, received ${finalInvestigation?.status ?? "missing"}.`,
    );
  }

  if (finalInvestigation.id !== investigationRunId) {
    throw new Error(
      "Resume created a different investigation instead of continuing the existing one.",
    );
  }

  console.log("\nCrash/resume automation smoke passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
