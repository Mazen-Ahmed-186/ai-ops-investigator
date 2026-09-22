import type { AutomationRemediationRunner } from "./remediation-runner.js";
import { createAutomationRemediationRunId } from "./remediation-runner.js";
import type { AutomationStore } from "./automation-store.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

export async function continueAutomationRemediationPlanning(args: {
  automationRunId: string;

  store: AutomationStore;

  remediationRunner: AutomationRemediationRunner;

  now?: () => Date;
}): Promise<AutomationRun> {
  const now = args.now ?? (() => new Date());

  let run = await args.store.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  if (run.status !== "PLANNING_REMEDIATION") {
    throw new Error(
      `Automation ${run.id} cannot plan remediation from status ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(`Automation ${run.id} has no investigation run id.`);
  }

  const investigationRunId = run.investigationRunId;

  const remediationRunId =
    run.remediationRunId ?? createAutomationRemediationRunId(run.id);

  if (!run.remediationRunId) {
    run = {
      ...run,

      remediationRunId,

      updatedAt: now().toISOString(),
    };

    await args.store.save(run);
  }

  try {
    const result = await args.remediationRunner.run({
      orderId: run.orderId,

      automationRunId: run.id,

      investigationRunId,

      remediationRunId,
    });

    if (result.remediationRunId !== remediationRunId) {
      throw new Error(
        `Remediation identity mismatch: expected ${remediationRunId}, received ${result.remediationRunId}.`,
      );
    }

    run = {
      ...run,

      updatedAt: now().toISOString(),
    };

    await args.store.save(run);

    return run;
  } catch (error) {
    run = transitionAutomationRun(run, "FAILED", now());

    run = {
      ...run,

      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown remediation planning failure.",
    };

    await args.store.save(run);

    throw error;
  }
}
