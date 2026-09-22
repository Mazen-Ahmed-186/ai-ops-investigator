import { describe, expect, it } from "vitest";

import {
  createPendingApproval,
  type ActionApproval,
} from "../../../src/actions/approval.js";
import type { ApprovalStore } from "../../../src/actions/approval-store.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import {
  createAutomationApprovalId,
  routeAutomationRemediationAction,
} from "../../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

class TestApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ActionApproval>();

  saveCalls = 0;

  async save(approval: ActionApproval) {
    this.saveCalls += 1;

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

function createRemediation(): RemediationRun {
  return {
    id: "REM-AUTO-1",

    orderId: "ORD-1001",

    automationRunId: "AUTO-1",

    investigationRunId: "INV-AUTO-1",

    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",

      summary: "Reconcile the stale order state.",

      actions: [
        {
          disposition: "PRIMARY",

          actionKind: "RECONCILE_ORDER_STATE",

          instruction: "Reconcile the stale order state.",

          supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
        },
      ],
    },

    retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],

    startedAt: "2026-09-22T15:00:00.000Z",

    updatedAt: "2026-09-22T15:01:00.000Z",

    failureReason: null,
  };
}

async function createPlanningState(args: {
  automationStore: InMemoryAutomationStore;

  remediationStore: InMemoryRemediationStore;
}) {
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

  run = {
    ...run,

    remediationRunId: "REM-AUTO-1",
  };

  await args.automationStore.save(run);

  await args.remediationStore.save(createRemediation());
}

describe("routeAutomationRemediationAction", () => {
  it("routes an allowed grounded action to EXECUTING", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    const result = await routeAutomationRemediationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,
    });

    expect(result.status).toBe("EXECUTION_READY");

    expect(result.run.status).toBe("EXECUTING");

    if (result.status !== "EXECUTION_READY") {
      throw new Error("Expected execution-ready routing.");
    }

    expect(result.action).toEqual({
      kind: "RECONCILE_ORDER_STATE",

      orderId: "ORD-1001",

      reason:
        "Grounded remediation requires reconciling the stale order state.",
    });

    expect(approvalStore.saveCalls).toBe(0);
  });

  it("creates a durable approval for an approval-required action", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    const result = await routeAutomationRemediationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      deriveAction: () => ({
        status: "ACTION_READY",

        action: {
          kind: "CREATE_FULFILLMENT_ATTEMPT",

          orderId: "ORD-1001",

          reason:
            "Grounded remediation requires creating a new fulfillment attempt.",
        },

        supportedByRunbookIds: ["TEST-RUNBOOK"],
      }),
    });

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    expect(result.run.status).toBe("WAITING_FOR_APPROVAL");

    expect(result.run.approvalId).toBe("APR-AUTO-1");

    const approval = await approvalStore.get("APR-AUTO-1");

    expect(approval).toMatchObject({
      id: "APR-AUTO-1",

      status: "PENDING",

      action: {
        kind: "CREATE_FULFILLMENT_ATTEMPT",

        orderId: "ORD-1001",

        reason:
          "Grounded remediation requires creating a new fulfillment attempt.",
      },
    });
  });

  it("reuses a previously persisted matching approval", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    const action = {
      kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

      orderId: "ORD-1001",

      reason:
        "Grounded remediation requires creating a new fulfillment attempt.",
    };

    await approvalStore.save(
      createPendingApproval({
        id: createAutomationApprovalId("AUTO-1"),

        action,

        now: new Date("2026-09-22T15:00:00.000Z"),
      }),
    );

    expect(approvalStore.saveCalls).toBe(1);

    const result = await routeAutomationRemediationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      deriveAction: () => ({
        status: "ACTION_READY",

        action,

        supportedByRunbookIds: ["TEST-RUNBOOK"],
      }),
    });

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    expect(approvalStore.saveCalls).toBe(1);
  });

  it("escalates a policy-denied action", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    const result = await routeAutomationRemediationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      deriveAction: () => ({
        status: "ACTION_READY",

        action: {
          kind: "CANCEL_ORDER",

          orderId: "ORD-1001",

          reason: "Grounded remediation requires cancelling the order.",
        },

        supportedByRunbookIds: ["TEST-RUNBOOK"],
      }),
    });

    expect(result.status).toBe("ESCALATED");

    expect(result.run.status).toBe("ESCALATED");
  });

  it("escalates when action derivation fails closed", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    const result = await routeAutomationRemediationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      approvalStore,

      deriveAction: () => ({
        status: "ESCALATE",

        reason: "No supported primary action.",
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",

        reason: "No supported primary action.",

        run: expect.objectContaining({
          status: "ESCALATED",
        }),
      }),
    );
  });

  it("rejects a persisted approval that does not match the derived action", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    const approvalStore = new TestApprovalStore();

    await createPlanningState({
      automationStore,
      remediationStore,
    });

    await approvalStore.save(
      createPendingApproval({
        id: "APR-AUTO-1",

        action: {
          kind: "CREATE_FULFILLMENT_ATTEMPT",

          orderId: "ORD-OTHER",

          reason: "Different action.",
        },
      }),
    );

    await expect(
      routeAutomationRemediationAction({
        automationRunId: "AUTO-1",

        automationStore,

        remediationStore,

        approvalStore,

        deriveAction: () => ({
          status: "ACTION_READY",

          action: {
            kind: "CREATE_FULFILLMENT_ATTEMPT",

            orderId: "ORD-1001",

            reason:
              "Grounded remediation requires creating a new fulfillment attempt.",
          },

          supportedByRunbookIds: ["TEST-RUNBOOK"],
        }),
      }),
    ).rejects.toThrow(
      "Approval APR-AUTO-1 does not match the derived automation action.",
    );
  });
});
