import { describe, expect, it, vi } from "vitest";

import { continueAutomationRemediationPlanning } from "../../../src/automation/continue-remediation-planning.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import type { AutomationRemediationRunner } from "../../../src/automation/remediation-runner.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";

async function createPlanningRun(store: InMemoryAutomationStore) {
  let run = createAutomationRun({
    id: "AUTO-1",

    orderId: "ORD-1001",
  });

  run = transitionAutomationRun(run, "INVESTIGATING");

  run = {
    ...run,

    investigationRunId: "INV-AUTO-1",
  };

  run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

  await store.save(run);

  return run;
}

describe("continueAutomationRemediationPlanning", () => {
  it("persists remediation identity before invoking the planner", async () => {
    const store = new InMemoryAutomationStore();

    await createPlanningRun(store);

    const remediationRunner: AutomationRemediationRunner = {
      run: vi.fn<AutomationRemediationRunner["run"]>(
        async ({ automationRunId, remediationRunId }) => {
          const persisted = await store.get(automationRunId);

          expect(persisted).toMatchObject({
            status: "PLANNING_REMEDIATION",

            remediationRunId: "REM-AUTO-1",
          });

          return {
            status: "COMPLETED",

            remediationRunId,
          };
        },
      ),
    };

    const result = await continueAutomationRemediationPlanning({
      automationRunId: "AUTO-1",

      store,

      remediationRunner,
    });

    expect(result).toMatchObject({
      status: "PLANNING_REMEDIATION",

      investigationRunId: "INV-AUTO-1",

      remediationRunId: "REM-AUTO-1",

      failureReason: null,
    });
  });

  it("persists FAILED when remediation planning throws", async () => {
    const store = new InMemoryAutomationStore();

    await createPlanningRun(store);

    const remediationRunner: AutomationRemediationRunner = {
      async run() {
        throw new Error("Remediation planner unavailable.");
      },
    };

    await expect(
      continueAutomationRemediationPlanning({
        automationRunId: "AUTO-1",

        store,

        remediationRunner,
      }),
    ).rejects.toThrow("Remediation planner unavailable.");

    await expect(store.get("AUTO-1")).resolves.toMatchObject({
      status: "FAILED",

      remediationRunId: "REM-AUTO-1",

      failureReason: "Remediation planner unavailable.",
    });
  });
});
