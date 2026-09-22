import { describe, expect, it } from "vitest";

import {
  createPendingApproval,
  type ActionApproval,
} from "../../../src/actions/approval.js";
import type { ApprovalStore } from "../../../src/actions/approval-store.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import { resumeAutomationAfterApproval } from "../../../src/automation/resume-automation-after-approval.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

class TestApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ActionApproval>();

  async save(approval: ActionApproval) {
    this.approvals.set(approval.id, structuredClone(approval));
  }

  async get(approvalId: string) {
    const approval = this.approvals.get(approvalId);

    return approval ? structuredClone(approval) : null;
  }

  async listByOrderId(orderId: string) {
    return [...this.approvals.values()]
      .filter((approval) => approval.action.orderId === orderId)
      .map((approval) => structuredClone(approval));
  }
}

const approvalAction = {
  kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

  orderId: "ORD-2001",

  reason: "Grounded remediation requires creating a new fulfillment attempt.",
};

function createRemediation(): RemediationRun {
  return {
    id: "REM-AUTO-1",

    orderId: "ORD-2001",

    automationRunId: "AUTO-1",

    investigationRunId: "INV-AUTO-1",

    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",

      summary: "The previous fulfillment attempt definitively failed.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "CREATE_FULFILLMENT_ATTEMPT",

          instruction:
            "Create a replacement fulfillment attempt after approval.",

          supportedByRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],
        },
      ],
    },

    retrievedRunbookIds: ["RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE"],

    startedAt: "2026-09-22T15:00:00.000Z",

    updatedAt: "2026-09-22T15:01:00.000Z",

    failureReason: null,
  };
}

async function createWaitingState(args: {
  automationStore: InMemoryAutomationStore;

  remediationStore: InMemoryRemediationStore;
}) {
  let run = createAutomationRun({
    id: "AUTO-1",

    orderId: "ORD-2001",
  });

  run = transitionAutomationRun(run, "INVESTIGATING");

  run = {
    ...run,

    investigationRunId: "INV-AUTO-1",
  };

  run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

  run = {
    ...run,

    remediationRunId: "REM-AUTO-1",

    approvalId: "APR-AUTO-1",
  };

  run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL");

  await args.automationStore.save(run);

  await args.remediationStore.save(createRemediation());
}

function approved(approval: ActionApproval): ActionApproval {
  return {
    ...approval,

    status: "APPROVED",

    resolvedAt: "2026-09-22T15:05:00.000Z",

    resolvedBy: "admin-1",
  };
}

function rejected(approval: ActionApproval): ActionApproval {
  return {
    ...approval,

    status: "REJECTED",

    resolvedAt: "2026-09-22T15:05:00.000Z",

    resolvedBy: "admin-1",
  };
}

describe("resumeAutomationAfterApproval", () => {
  it("remains paused while approval is pending", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createWaitingState({
      automationStore,
      remediationStore,
    });

    await approvalStore.save(
      createPendingApproval({
        id: "APR-AUTO-1",

        action: approvalAction,

        now: new Date("2026-09-22T15:00:00.000Z"),

        ttlMs: 60 * 60 * 1000,
      }),
    );

    const result = await resumeAutomationAfterApproval({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      now: () => new Date("2026-09-22T15:10:00.000Z"),
    });

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    expect(result.run.status).toBe("WAITING_FOR_APPROVAL");
  });

  it("moves an approved action to EXECUTING", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createWaitingState({
      automationStore,
      remediationStore,
    });

    const pending = createPendingApproval({
      id: "APR-AUTO-1",

      action: approvalAction,

      now: new Date("2026-09-22T15:00:00.000Z"),

      ttlMs: 60 * 60 * 1000,
    });

    await approvalStore.save(approved(pending));

    const result = await resumeAutomationAfterApproval({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      now: () => new Date("2026-09-22T15:10:00.000Z"),
    });

    expect(result.status).toBe("EXECUTION_READY");

    expect(result.run.status).toBe("EXECUTING");

    if (result.status !== "EXECUTION_READY") {
      throw new Error("Expected execution-ready approval.");
    }

    expect(result.action).toEqual(approvalAction);
  });

  it("escalates a rejected approval", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createWaitingState({
      automationStore,
      remediationStore,
    });

    const pending = createPendingApproval({
      id: "APR-AUTO-1",

      action: approvalAction,
    });

    await approvalStore.save(rejected(pending));

    const result = await resumeAutomationAfterApproval({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,
    });

    expect(result.status).toBe("ESCALATED");

    expect(result.run.status).toBe("ESCALATED");
  });

  it("expires and persists a stale approval before escalating", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createWaitingState({
      automationStore,
      remediationStore,
    });

    await approvalStore.save(
      createPendingApproval({
        id: "APR-AUTO-1",

        action: approvalAction,

        now: new Date("2026-09-22T15:00:00.000Z"),

        ttlMs: 60_000,
      }),
    );

    const result = await resumeAutomationAfterApproval({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      now: () => new Date("2026-09-22T15:05:00.000Z"),
    });

    expect(result.status).toBe("ESCALATED");

    expect(result.run.status).toBe("ESCALATED");

    await expect(approvalStore.get("APR-AUTO-1")).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });

  it("escalates when the persisted approval does not match the durable action", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createWaitingState({
      automationStore,
      remediationStore,
    });

    await approvalStore.save(
      createPendingApproval({
        id: "APR-AUTO-1",

        action: {
          ...approvalAction,

          orderId: "ORD-OTHER",
        },
      }),
    );

    const result = await resumeAutomationAfterApproval({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",

        reason:
          "Approval APR-AUTO-1 does not match the derived automation action.",

        run: expect.objectContaining({
          status: "ESCALATED",
        }),
      }),
    );
  });
});
