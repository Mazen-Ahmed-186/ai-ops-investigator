import { describe, expect, it } from "vitest";

import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../../src/automation/verify-automation-action.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";

const action = {
  kind: "RETRY_NOTIFICATION" as const,
  orderId: "ORD-NOT-1",
  reason:
    "Grounded remediation requires retrying the failed customer notification.",
};

async function createVerificationState(args: {
  notificationStatus?: "PENDING" | "SENT" | "FAILED";
  includeNotification?: boolean;
  includeEffect?: boolean;
}) {
  const automationStore = new InMemoryAutomationStore();
  const remediationStore = new InMemoryRemediationStore();
  const auditStore = new InMemoryActionExecutionAuditStore();

  let run = createAutomationRun({
    id: "AUTO-NOT-1",
    orderId: "ORD-NOT-1",
  });

  run = transitionAutomationRun(run, "INVESTIGATING");

  run = {
    ...run,
    investigationRunId: "INV-NOT-1",
  };

  run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

  run = {
    ...run,
    remediationRunId: "REM-NOT-1",
  };

  run = transitionAutomationRun(run, "EXECUTING");

  run = {
    ...run,
    actionExecutionId: "ACT-NOT-1",
  };

  run = transitionAutomationRun(run, "VERIFYING");

  await automationStore.save(run);

  await remediationStore.save({
    id: "REM-NOT-1",
    orderId: "ORD-NOT-1",
    automationRunId: "AUTO-NOT-1",
    investigationRunId: "INV-NOT-1",
    status: "COMPLETED",

    recommendation: {
      status: "RECOMMENDATION_READY",
      summary: "Retry the failed notification.",
      actions: [
        {
          disposition: "PRIMARY",
          actionKind: "RETRY_NOTIFICATION",
          instruction: "Retry the failed customer notification.",
          supportedByRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
        },
      ],
    },

    retrievedRunbookIds: ["RUNBOOK-NOTIFICATION-FAILURE"],
    startedAt: "2026-09-22T18:00:00.000Z",
    updatedAt: "2026-09-22T18:01:00.000Z",
    failureReason: null,
  });

  await auditStore.save({
    id: "ACT-NOT-1",
    action,
    initiatedBy: {
      type: "SYSTEM",
      id: "AUTO-NOT-1",
    },
    approvalId: null,
    status: "EXECUTED",
    startedAt: "2026-09-22T18:02:00.000Z",
    completedAt: "2026-09-22T18:02:01.000Z",
    reason: "Created notification retry NOT-NEW-1 with status PENDING.",
    validationReasons: [],
    error: null,
    effect:
      args.includeEffect === false
        ? null
        : {
            kind: "NOTIFICATION_RETRY_CREATED",
            notificationId: "NOT-NEW-1",
            notificationStatus: "PENDING",
          },
  });

  const repository = new InMemoryActionExecutionRepository([
    {
      order: {
        id: "ORD-NOT-1",
        status: "FULFILLED",
      },
      payments: [
        {
          status: "CAPTURED",
        },
      ],
      fulfillmentAttempts: [
        {
          id: "FUL-NOT-1",
          status: "SUCCEEDED",
        },
      ],
      entitlements: [
        {
          status: "ACTIVE",
        },
      ],
      accountDeliveries: [
        {
          status: "DELIVERED",
        },
      ],
      notifications:
        args.includeNotification === false
          ? [
              {
                id: "NOT-OLD-1",
                status: "FAILED",
              },
            ]
          : [
              {
                id: "NOT-OLD-1",
                status: "FAILED",
              },
              {
                id: "NOT-NEW-1",
                status: args.notificationStatus ?? "PENDING",
              },
            ],
      refunds: [],
      refundAllowedByBusinessPolicy: true,
    },
  ]);

  return {
    automationStore,
    remediationStore,
    auditStore,
    repository,
  };
}

describe("notification automation verification", () => {
  it("completes when the exact audited notification retry exists as PENDING", async () => {
    const state = await createVerificationState({});

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-NOT-1",
      ...state,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.run.status).toBe("COMPLETED");
  });

  it("completes when the exact audited notification retry has progressed to SENT", async () => {
    const state = await createVerificationState({
      notificationStatus: "SENT",
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-NOT-1",
      ...state,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.run.status).toBe("COMPLETED");
  });

  it("escalates when the exact audited notification retry is missing", async () => {
    const state = await createVerificationState({
      includeNotification: false,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-NOT-1",
      ...state,
    });

    expect(result.status).toBe("ESCALATED");
    expect(result.run.status).toBe("ESCALATED");
  });

  it("escalates when the execution audit has no notification retry effect", async () => {
    const state = await createVerificationState({
      includeEffect: false,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-NOT-1",
      ...state,
    });

    expect(result.status).toBe("ESCALATED");
    expect(result.run.status).toBe("ESCALATED");
  });

  it("escalates when the exact audited notification retry is FAILED", async () => {
    const state = await createVerificationState({
      notificationStatus: "FAILED",
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-NOT-1",
      ...state,
    });

    expect(result.status).toBe("ESCALATED");
    expect(result.run.status).toBe("ESCALATED");
  });
});
