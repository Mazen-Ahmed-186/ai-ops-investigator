import { describe, expect, it, vi } from "vitest";

import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import type { AutomationInvestigationRunner } from "../../../src/automation/investigation-runner.js";
import {
  resumeAutomationInvestigation,
  startAutomationInvestigation,
} from "../../../src/automation/start-automation-investigation.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";

function createClock() {
  let time = Date.parse("2026-09-22T14:00:00.000Z");

  return () => {
    const current = new Date(time);

    time += 1_000;

    return current;
  };
}

describe("startAutomationInvestigation", () => {
  it("advances a diagnosed incident to remediation planning", async () => {
    const store = new InMemoryAutomationStore();

    const investigationRunner: AutomationInvestigationRunner = {
      run: vi.fn<AutomationInvestigationRunner["run"]>(
        async ({ investigationRunId }) => ({
          status: "DIAGNOSIS_READY",
          investigationRunId,
        }),
      ),
    };

    const result = await startAutomationInvestigation({
      orderId: "ORD-1001",
      automationRunId: "AUTO-1",
      store,
      investigationRunner,
      now: createClock(),
    });

    expect(result).toMatchObject({
      id: "AUTO-1",
      orderId: "ORD-1001",
      status: "PLANNING_REMEDIATION",
      investigationRunId: "INV-AUTO-1",
      approvalId: null,
      actionExecutionId: null,
      failureReason: null,
    });

    await expect(store.get("AUTO-1")).resolves.toEqual(result);

    expect(investigationRunner.run).toHaveBeenCalledWith({
      orderId: "ORD-1001",
      automationRunId: "AUTO-1",
      investigationRunId: "INV-AUTO-1",
    });
  });

  it("escalates when investigation cannot establish a diagnosis", async () => {
    const store = new InMemoryAutomationStore();

    const investigationRunner: AutomationInvestigationRunner = {
      async run({ investigationRunId }) {
        return {
          status: "NEEDS_MORE_EVIDENCE",
          investigationRunId,
        };
      },
    };

    const result = await startAutomationInvestigation({
      orderId: "ORD-1001",
      automationRunId: "AUTO-2",
      store,
      investigationRunner,
      now: createClock(),
    });

    expect(result).toMatchObject({
      status: "ESCALATED",
      investigationRunId: "INV-AUTO-2",
      failureReason: null,
    });
  });

  it("persists INVESTIGATING before invoking the investigation subsystem", async () => {
    const store = new InMemoryAutomationStore();

    const investigationRunner: AutomationInvestigationRunner = {
      async run({ automationRunId, investigationRunId }) {
        const persisted = await store.get(automationRunId);

        expect(persisted).toMatchObject({
          status: "INVESTIGATING",
          investigationRunId,
        });

        return {
          status: "DIAGNOSIS_READY",
          investigationRunId,
        };
      },
    };

    await startAutomationInvestigation({
      orderId: "ORD-1001",
      automationRunId: "AUTO-3",
      store,
      investigationRunner,
      now: createClock(),
    });
  });

  it("persists investigation identity before advancing workflow state", async () => {
    const store = new InMemoryAutomationStore();

    const investigationRunner: AutomationInvestigationRunner = {
      async run({ investigationRunId }) {
        return {
          status: "DIAGNOSIS_READY",
          investigationRunId,
        };
      },
    };

    const save = vi.spyOn(store, "save");

    await startAutomationInvestigation({
      orderId: "ORD-1001",
      automationRunId: "AUTO-4",
      store,
      investigationRunner,
      now: createClock(),
    });

    const persistedRuns = save.mock.calls.map(([run]) => structuredClone(run));

    expect(
      persistedRuns.some(
        (run) =>
          run.status === "INVESTIGATING" &&
          run.investigationRunId === "INV-AUTO-4",
      ),
    ).toBe(true);

    expect(persistedRuns.at(-1)).toMatchObject({
      status: "PLANNING_REMEDIATION",
      investigationRunId: "INV-AUTO-4",
    });
  });

  it("persists FAILED when investigation throws", async () => {
    const store = new InMemoryAutomationStore();

    const investigationRunner: AutomationInvestigationRunner = {
      async run() {
        throw new Error("Investigation provider unavailable.");
      },
    };

    await expect(
      startAutomationInvestigation({
        orderId: "ORD-1001",
        automationRunId: "AUTO-5",
        store,
        investigationRunner,
        now: createClock(),
      }),
    ).rejects.toThrow("Investigation provider unavailable.");

    const persisted = await store.get("AUTO-5");

    expect(persisted).toMatchObject({
      status: "FAILED",
      investigationRunId: "INV-AUTO-5",
      failureReason: "Investigation provider unavailable.",
    });
  });

  it("resumes an automation already paused inside investigation", async () => {
    const store = new InMemoryAutomationStore();

    let run = createAutomationRun({
      id: "AUTO-RESUME-1",
      orderId: "ORD-1001",
      now: new Date("2026-09-22T14:00:00.000Z"),
    });

    run = transitionAutomationRun(
      run,
      "INVESTIGATING",
      new Date("2026-09-22T14:01:00.000Z"),
    );

    run = {
      ...run,
      investigationRunId: "INV-AUTO-RESUME-1",
    };

    await store.save(run);

    const investigationRunner: AutomationInvestigationRunner = {
      async run(args) {
        expect(args).toEqual({
          orderId: "ORD-1001",
          automationRunId: "AUTO-RESUME-1",
          investigationRunId: "INV-AUTO-RESUME-1",
        });

        return {
          status: "DIAGNOSIS_READY",
          investigationRunId: "INV-AUTO-RESUME-1",
        };
      },
    };

    const result = await resumeAutomationInvestigation({
      automationRunId: "AUTO-RESUME-1",
      store,
      investigationRunner,
      now: createClock(),
    });

    expect(result).toMatchObject({
      status: "PLANNING_REMEDIATION",
      investigationRunId: "INV-AUTO-RESUME-1",
    });
  });

  it("rejects resuming an automation outside the investigation stage", async () => {
    const store = new InMemoryAutomationStore();

    await store.save(
      createAutomationRun({
        id: "AUTO-PENDING",
        orderId: "ORD-1001",
      }),
    );

    const investigationRunner: AutomationInvestigationRunner = {
      async run() {
        throw new Error("should not execute");
      },
    };

    await expect(
      resumeAutomationInvestigation({
        automationRunId: "AUTO-PENDING",
        store,
        investigationRunner,
      }),
    ).rejects.toThrow(
      "Automation AUTO-PENDING cannot continue investigation from status PENDING.",
    );
  });
});
