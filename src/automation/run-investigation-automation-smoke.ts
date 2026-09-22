import { randomUUID } from "node:crypto";

import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import { createAgentInvestigationRunner } from "./agent-investigation-runner.js";
import { FileAutomationStore } from "./file-automation-store.js";
import { createRunAgentInvestigationExecutor } from "./run-agent-investigation-executor.js";
import { startAutomationInvestigation } from "./start-automation-investigation.js";

async function main() {
  const automationRunId = `AUTO-${randomUUID()}`;

  const automationStore = new FileAutomationStore();

  const investigationStore = new FileInvestigationStore();

  const investigationRunner = createAgentInvestigationRunner(
    createRunAgentInvestigationExecutor({
      store: investigationStore,
    }),
  );

  console.log("Starting automation:", automationRunId);

  const result = await startAutomationInvestigation({
    orderId: "ORD-1001",
    automationRunId,
    store: automationStore,
    investigationRunner,
  });

  console.log("\nAutomation result:");

  console.dir(result, {
    depth: null,
  });

  if (!result.investigationRunId) {
    throw new Error(
      "Automation completed the investigation stage without persisting an investigation run id.",
    );
  }

  const investigation = await investigationStore.get(result.investigationRunId);

  if (!investigation) {
    throw new Error(
      `Investigation ${result.investigationRunId} was not found after automation execution.`,
    );
  }

  console.log("\nPersisted investigation:");

  console.dir(
    {
      id: investigation.id,
      status: investigation.status,
      toolCalls: investigation.toolCalls,
      diagnosisStatus: investigation.assessment?.diagnosisStatus ?? null,
      rootCauseCategory: investigation.assessment?.rootCauseCategory ?? null,
    },
    {
      depth: null,
    },
  );

  console.log("\nPersisted automation:");

  console.dir(await automationStore.get(automationRunId), {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
