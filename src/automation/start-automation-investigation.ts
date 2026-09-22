import { createAutomationRun } from "./create-automation-run.js";
import {
  createAutomationInvestigationRunId,
  type AutomationInvestigationRunner,
} from "./investigation-runner.js";
import type { AutomationStore } from "./automation-store.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

type ContinueInvestigationArgs = {
  run: AutomationRun;
  store: AutomationStore;
  investigationRunner: AutomationInvestigationRunner;
  now: () => Date;
};

async function continueInvestigation({
  run,
  store,
  investigationRunner,
  now,
}: ContinueInvestigationArgs): Promise<AutomationRun> {
  if (run.status !== "INVESTIGATING") {
    throw new Error(
      `Automation ${run.id} cannot continue investigation from status ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(`Automation ${run.id} has no investigation run id.`);
  }

  try {
    const result = await investigationRunner.run({
      orderId: run.orderId,
      automationRunId: run.id,
      investigationRunId: run.investigationRunId,
    });

    if (result.investigationRunId !== run.investigationRunId) {
      throw new Error(
        `Investigation identity mismatch: expected ${run.investigationRunId}, received ${result.investigationRunId}.`,
      );
    }

    switch (result.status) {
      case "DIAGNOSIS_READY":
        run = transitionAutomationRun(run, "PLANNING_REMEDIATION", now());

        break;

      case "NEEDS_MORE_EVIDENCE":
        run = transitionAutomationRun(run, "ESCALATED", now());

        break;
    }

    await store.save(run);

    return run;
  } catch (error) {
    run = transitionAutomationRun(run, "FAILED", now());

    run = {
      ...run,

      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown investigation failure.",
    };

    await store.save(run);

    throw error;
  }
}

export async function startAutomationInvestigation(args: {
  orderId: string;
  store: AutomationStore;
  investigationRunner: AutomationInvestigationRunner;
  automationRunId?: string;
  now?: () => Date;
}): Promise<AutomationRun> {
  const now = args.now ?? (() => new Date());

  let run = createAutomationRun({
    orderId: args.orderId,

    ...(args.automationRunId
      ? {
          id: args.automationRunId,
        }
      : {}),

    now: now(),
  });

  await args.store.save(run);

  run = transitionAutomationRun(run, "INVESTIGATING", now());

  run = {
    ...run,
    investigationRunId: createAutomationInvestigationRunId(run.id),
  };

  await args.store.save(run);

  return continueInvestigation({
    run,
    store: args.store,
    investigationRunner: args.investigationRunner,
    now,
  });
}

export async function resumeAutomationInvestigation(args: {
  automationRunId: string;
  store: AutomationStore;
  investigationRunner: AutomationInvestigationRunner;
  now?: () => Date;
}): Promise<AutomationRun> {
  const now = args.now ?? (() => new Date());

  const run = await args.store.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  return continueInvestigation({
    run,
    store: args.store,
    investigationRunner: args.investigationRunner,
    now,
  });
}
