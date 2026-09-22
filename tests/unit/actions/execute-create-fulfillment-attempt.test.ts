import { describe, expect, it } from "vitest";

import { createPendingApproval } from "../../../src/actions/approval.js";
import { decideApproval } from "../../../src/actions/approval-lifecycle.js";
import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { executeCreateFulfillmentAttempt } from "../../../src/actions/execute-create-fulfillment-attempt.js";
import { FileApprovalStore } from "../../../src/actions/file-approval-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function createApprovalStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "fulfillment-approval-"),
  );

  return {
    store: new FileApprovalStore(directory),

    async cleanup() {
      await rm(directory, {
        recursive: true,
        force: true,
      });
    },
  };
}

function createRetryableFixture() {
  const fixture = createOrder1001ActionFixture();

  fixture.fulfillmentAttempts = [
    {
      status: "CONFIRMED_FAILED",
    },
  ];

  fixture.entitlements = [];

  fixture.accountDeliveries = [];

  return fixture;
}

const action = {
  kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

  orderId: "ORD-1001",

  reason:
    "Create another fulfillment attempt after the previous attempt was confirmed failed.",
};

describe("executeCreateFulfillmentAttempt", () => {
  it("does not execute without a persisted approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const result = await executeCreateFulfillmentAttempt({
        action,
        executionId: "ACT-NO-APPROVAL",
        approvalId: "APR-MISSING",

        approvalStore: approvals.store,

        repository,
      });

      expect(result.status).toBe("PENDING_APPROVAL");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(1);
    } finally {
      await approvals.cleanup();
    }
  });

  it("executes when a matching persisted approval is approved", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const pending = createPendingApproval({
        id: "APR-1",

        now: new Date("2026-09-22T12:00:00.000Z"),

        action,
      });

      const approved = decideApproval({
        approval: pending,

        decision: "APPROVE",

        decidedBy: "admin-1",

        now: new Date("2026-09-22T12:01:00.000Z"),
      });

      await approvals.store.save(approved);

      const result = await executeCreateFulfillmentAttempt({
        action,
        executionId: "ACT-APPROVED",
        approvalId: approved.id,

        approvalStore: approvals.store,

        repository,

        now: new Date("2026-09-22T12:02:00.000Z"),
      });

      expect(result.status).toBe("EXECUTED");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(2);
    } finally {
      await approvals.cleanup();
    }
  });

  it("does not execute a rejected approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const rejected = decideApproval({
        approval: createPendingApproval({
          id: "APR-2",
          action,
        }),

        decision: "REJECT",

        decidedBy: "admin-1",
      });

      await approvals.store.save(rejected);

      const result = await executeCreateFulfillmentAttempt({
        action,
        executionId: "ACT-REJECTED",
        approvalId: rejected.id,

        approvalStore: approvals.store,

        repository,
      });

      expect(result.status).toBe("APPROVAL_REJECTED");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(1);
    } finally {
      await approvals.cleanup();
    }
  });

  it("does not allow approval reuse for a different action", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const approved = decideApproval({
        approval: createPendingApproval({
          id: "APR-3",
          action,
        }),

        decision: "APPROVE",

        decidedBy: "admin-1",
      });

      await approvals.store.save(approved);

      const result = await executeCreateFulfillmentAttempt({
        action: {
          ...action,

          reason: "Different execution intent.",
        },

        approvalId: approved.id,
        executionId: "ACT-MISMATCH",
        approvalStore: approvals.store,

        repository,
      });

      expect(result.status).toBe("DENIED");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(1);
    } finally {
      await approvals.cleanup();
    }
  });

  it("blocks an approved action when the current state becomes unsafe", async () => {
    const approvals = await createApprovalStore();

    try {
      const fixture = createRetryableFixture();

      fixture.fulfillmentAttempts.push({
        status: "UNKNOWN",
      });

      const repository = new InMemoryActionExecutionRepository([fixture]);

      const approved = decideApproval({
        approval: createPendingApproval({
          id: "APR-4",
          action,
        }),

        decision: "APPROVE",

        decidedBy: "admin-1",
      });

      await approvals.store.save(approved);

      const result = await executeCreateFulfillmentAttempt({
        action,

        approvalId: approved.id,
        executionId: "ACT_BLOCKED",
        approvalStore: approvals.store,

        repository,
      });

      expect(result.status).toBe("BLOCKED_BY_CURRENT_STATE");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(2);
    } finally {
      await approvals.cleanup();
    }
  });
});
