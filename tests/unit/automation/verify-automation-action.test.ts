import { describe, expect, it } from "vitest";

import type { ActionExecutionRepository } from "../../../src/actions/action-execution-repository.js";
import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../../src/automation/in-memory-automation-store.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../../src/automation/verify-automation-action.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

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

async function createVerifyingState(args: {
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

  run = transitionAutomationRun(run, "EXECUTING");

  run = {
    ...run,

    actionExecutionId: "ACT-1",
  };

  run = transitionAutomationRun(run, "VERIFYING");

  await args.automationStore.save(run);

  await args.remediationStore.save(createRemediation());
}

function createRepository(
  overrides: {
    orderStatus?:
      | "PENDING_PAYMENT"
      | "PROCESSING"
      | "AWAITING_STOCK"
      | "FULFILLED"
      | "FAILED"
      | "CANCELLED"
      | "EXPIRED";

    paymentCaptured?: boolean;

    fulfillmentSucceeded?: boolean;

    entitlementActive?: boolean;

    accountDeliveryDelivered?: boolean;
  } = {},
): ActionExecutionRepository {
  return {
    async getExecutionContext() {
      return {
        orderStatus: overrides.orderStatus ?? "FULFILLED",

        paymentCaptured: overrides.paymentCaptured ?? true,

        fulfillmentSucceeded: overrides.fulfillmentSucceeded ?? true,

        entitlementActive: overrides.entitlementActive ?? true,

        accountDeliveryDelivered: overrides.accountDeliveryDelivered ?? true,

        notificationFailed: true,

        hasBlockingFulfillmentAttempt: false,

        refundAllowedByBusinessPolicy: false,

        refundAlreadyIssued: false,
      };
    },

    async reconcileOrderStateToFulfilled() {
      throw new Error("Verification must not perform a write.");
    },
  };
}

describe("verifyAutomationAction", () => {
  it("completes when the reconcile postcondition is confirmed", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository: createRepository(),
    });

    expect(result.status).toBe("COMPLETED");

    expect(result.run.status).toBe("COMPLETED");

    expect(result.run.actionExecutionId).toBe("ACT-1");
  });

  it("escalates when the order did not reach FULFILLED", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository: createRepository({
        orderStatus: "PROCESSING",
      }),
    });

    expect(result.status).toBe("ESCALATED");

    if (result.status !== "ESCALATED") {
      throw new Error("Expected escalation.");
    }

    expect(result.verificationReasons).toContain(
      "Expected order status FULFILLED, received PROCESSING.",
    );
  });

  it("escalates when completion evidence no longer holds", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
    });

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository: createRepository({
        entitlementActive: false,

        accountDeliveryDelivered: false,
      }),
    });

    expect(result.status).toBe("ESCALATED");

    if (result.status !== "ESCALATED") {
      throw new Error("Expected escalation.");
    }

    expect(result.verificationReasons).toEqual(
      expect.arrayContaining([
        "Entitlement is no longer confirmed as active.",

        "Account delivery is no longer confirmed as delivered.",
      ]),
    );
  });

  it("escalates when the order disappears during verification", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
    });

    const repository: ActionExecutionRepository = {
      async getExecutionContext() {
        return null;
      },

      async reconcileOrderStateToFulfilled() {
        throw new Error("Verification must not perform a write.");
      },
    };

    const result = await verifyAutomationAction({
      automationRunId: "AUTO-1",

      automationStore,

      remediationStore,

      repository,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ESCALATED",

        reason: "Order ORD-1001 was not found during verification.",

        run: expect.objectContaining({
          status: "ESCALATED",
        }),
      }),
    );
  });

  it("marks the automation FAILED when verification infrastructure fails", async () => {
    const automationStore = new InMemoryAutomationStore();

    const remediationStore = new InMemoryRemediationStore();

    await createVerifyingState({
      automationStore,
      remediationStore,
    });

    const repository: ActionExecutionRepository = {
      async getExecutionContext() {
        throw new Error("Database unavailable.");
      },

      async reconcileOrderStateToFulfilled() {
        throw new Error("Verification must not perform a write.");
      },
    };

    await expect(
      verifyAutomationAction({
        automationRunId: "AUTO-1",

        automationStore,

        remediationStore,

        repository,
      }),
    ).rejects.toThrow("Database unavailable.");

    await expect(automationStore.get("AUTO-1")).resolves.toMatchObject({
      status: "FAILED",

      failureReason: "Database unavailable.",
    });
  });
});
