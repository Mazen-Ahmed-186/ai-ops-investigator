import { describe, expect, it } from "vitest";

import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import type { AutomationRun } from "../../../src/automation/types.js";

function createRun(status: AutomationRun["status"] = "PENDING"): AutomationRun {
  return {
    id: "AUTO-1",

    orderId: "ORD-1001",

    status,

    createdAt: "2026-09-22T14:00:00.000Z",

    updatedAt: "2026-09-22T14:00:00.000Z",

    investigationRunId: null,

    approvalId: null,

    actionExecutionId: null,

    failureReason: null,
  };
}

describe("automation state machine", () => {
  it("moves from pending into investigation", () => {
    const run = transitionAutomationRun(
      createRun(),
      "INVESTIGATING",
      new Date("2026-09-22T14:01:00.000Z"),
    );

    expect(run).toMatchObject({
      status: "INVESTIGATING",

      updatedAt: "2026-09-22T14:01:00.000Z",
    });
  });

  it("can pause for approval during remediation planning", () => {
    const run = transitionAutomationRun(
      createRun("PLANNING_REMEDIATION"),

      "WAITING_FOR_APPROVAL",
    );

    expect(run.status).toBe("WAITING_FOR_APPROVAL");
  });

  it("can resume execution after approval", () => {
    const run = transitionAutomationRun(
      createRun("WAITING_FOR_APPROVAL"),

      "EXECUTING",
    );

    expect(run.status).toBe("EXECUTING");
  });

  it("does not allow approval waiting to skip directly to completion", () => {
    expect(() =>
      transitionAutomationRun(
        createRun("WAITING_FOR_APPROVAL"),

        "COMPLETED",
      ),
    ).toThrow(
      "Invalid automation transition: WAITING_FOR_APPROVAL -> COMPLETED.",
    );
  });

  it("does not allow a completed workflow to restart", () => {
    expect(() =>
      transitionAutomationRun(
        createRun("COMPLETED"),

        "INVESTIGATING",
      ),
    ).toThrow("Invalid automation transition: COMPLETED -> INVESTIGATING.");
  });
});
