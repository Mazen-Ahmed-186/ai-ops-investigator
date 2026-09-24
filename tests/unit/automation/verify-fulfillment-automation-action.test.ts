import { describe, expect, it } from "vitest";

import { createStartedActionExecutionAudit } from "../../../src/actions/action-execution-audit.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../../src/automation/verify-automation-action.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

const action = {
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

function createRepository(args?: {
  includeCreatedAttempt?: boolean;
  createdAttemptStatus?:
    | "PENDING"
    | "ACTIVE"
    | "UNKNOWN"
    | "RECONCILING"
    | "SUCCEEDED"
    | "CONFIRMED_FAILED"
    | "ABORTED"
    | "MANUAL_REVIEW";
}) {
  return new InMemoryActionExecutionRepository([
    {
      order: {
        id: "ORD-2001",

        status: "PROCESSING",
      },

      payments: [
        {
          status: "CAPTURED",
        },
      ],

      fulfillmentAttempts: [
        {
          id: "FUL-OLD-1",

          status: "CONFIRMED_FAILED",
        },

        ...(args?.includeCreatedAttempt === false
          ? []
          : [
              {
                id: "FUL-NEW-1",

                status: args?.createdAttemptStatus ?? "PENDING",
              } as const,
            ]),
      ],

      entitlements: [],

      accountDeliveries: [],

      notifications: [],

      refunds: [],

      refundAllowedByBusinessPolicy: true,
    },
  ]);
}

async function createVerifyingState(args: {
  automationStore: InMemoryAutomationStore;

  remediationStore: InMemoryRemediationStore;

  auditStore: InMemoryActionExecutionAuditStore;

  effect?: {
    kind: "FULFILLMENT_ATTEMPT_CREATED";
    attemptId: string;
    attemptStatus: "PENDING";
  } | null;

  auditStatus?: "EXECUTED" | "BLOCKED_BY_CURRENT_STATE";
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

  run = transitionAutomationRun(run, "EXECUTING");

  run = {
    ...run,

    actionExecutionId: "ACT-FUL-1",
  };

  run = transitionAutomationRun(run, "VERIFYING");

  await args.automationStore.save(run);

  await args.remediationStore.save(createRemediation());

  const started = createStartedActionExecutionAudit({
    id: "ACT-FUL-1",

    action,

    initiatedBy: {
      type: "SYSTEM",

      id: "AUTO-1",
    },

    approvalId: "APR-AUTO-1",

    now: new Date("2026-09-22T15:05:00.000Z"),
  });

  await args.auditStore.save({
    ...started,

    status: args.auditStatus ?? "EXECUTED",

    completedAt: "2026-09-22T15:05:01.000Z",

    reason: "Created fulfillment attempt FUL-NEW-1 with status PENDING.",

    effect:
      args.effect === undefined
        ? {
            kind: "FULFILLMENT_ATTEMPT_CREATED",

            attemptId: "FUL-NEW-1",

            attemptStatus: "PENDING",
          }
        : args.effect,
  });
}

describe("fulfillment automation verification", () => {
  it("completes when the exact audited fulfillment attempt exists as PENDING", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();
    const auditStore = new InMemoryActionExecutionAuditStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
      auditStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",
      automationStore,
      remediationStore,
      auditStore,
      repository: createRepository(),
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.run.status).toBe("COMPLETED");
  });

  it("completes when the exact audited fulfillment attempt has progressed to ACTIVE", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();
    const auditStore = new InMemoryActionExecutionAuditStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
      auditStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",
      automationStore,
      remediationStore,
      auditStore,
      repository: createRepository({
        createdAttemptStatus: "ACTIVE",
      }),
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.run.status).toBe("COMPLETED");
  });

  it("completes when the exact audited fulfillment attempt has progressed to SUCCEEDED", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();
    const auditStore = new InMemoryActionExecutionAuditStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
      auditStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",
      automationStore,
      remediationStore,
      auditStore,
      repository: createRepository({
        createdAttemptStatus: "SUCCEEDED",
      }),
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.run.status).toBe("COMPLETED");
  });

  it("escalates when the exact audited attempt cannot be found", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();
    const auditStore = new InMemoryActionExecutionAuditStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
      auditStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",
      automationStore,
      remediationStore,
      auditStore,
      repository: createRepository({
        includeCreatedAttempt: false,
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",
        reason:
          "Fulfillment attempt FUL-NEW-1 was not found during verification.",
      }),
    );
  });

  it("escalates when the execution audit has no structured fulfillment effect", async () => {
    const automationStore = new InMemoryAutomationStore();
    const remediationStore = new InMemoryRemediationStore();
    const auditStore = new InMemoryActionExecutionAuditStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
      auditStore,
      effect: null,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",
      automationStore,
      remediationStore,
      auditStore,
      repository: createRepository(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",
        reason:
          "Action execution audit ACT-FUL-1 does not contain a fulfillment-attempt creation effect.",
      }),
    );
  });

  it.each([
    "UNKNOWN",
    "RECONCILING",
    "CONFIRMED_FAILED",
    "ABORTED",
    "MANUAL_REVIEW",
  ] as const)(
    "escalates when the exact audited fulfillment attempt is %s",
    async (createdAttemptStatus) => {
      const automationStore = new InMemoryAutomationStore();
      const remediationStore = new InMemoryRemediationStore();
      const auditStore = new InMemoryActionExecutionAuditStore();

      await createVerifyingState({
        automationStore,
        remediationStore,
        auditStore,
      });

      const result = await verifyAutomationAction({
        automationRunId: "AUTO-1",
        automationStore,
        remediationStore,
        auditStore,
        repository: createRepository({
          createdAttemptStatus,
        }),
      });

      expect(result.status).toBe("ESCALATED");
      expect(result.run.status).toBe("ESCALATED");
    },
  );
});
