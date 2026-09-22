import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPendingApproval } from "../../../src/actions/approval.js";
import { decideApproval } from "../../../src/actions/approval-lifecycle.js";
import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { FileApprovalStore } from "../../../src/actions/file-approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { createOpenAICreateFulfillmentAttemptTool } from "../../../src/actions/openai-create-fulfillment-attempt-tool.js";

async function createApprovalStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "openai-fulfillment-approval-"),
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

const reason =
  "Create another fulfillment attempt after the previous attempt was confirmed failed.";

describe("OpenAI create fulfillment attempt tool", () => {
  it("cannot execute without persisted approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const tool = createOpenAICreateFulfillmentAttemptTool({
        orderId: "ORD-1001",

        reason,

        runId: "RUN-NO-APPROVAL",

        approvalStore: approvals.store,

        repository,

        auditStore: new InMemoryActionExecutionAuditStore(),
      });

      const result = await tool.execute({});

      expect(result.status).toBe("PENDING_APPROVAL");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(1);
    } finally {
      await approvals.cleanup();
    }
  });

  it("executes with a matching persisted approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const action = {
        kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

        orderId: "ORD-1001",

        reason,
      };

      const approved = decideApproval({
        approval: createPendingApproval({
          id: "APR-1",

          action,
        }),

        decision: "APPROVE",

        decidedBy: "admin-1",
      });

      await approvals.store.save(approved);

      const tool = createOpenAICreateFulfillmentAttemptTool({
        orderId: "ORD-1001",

        reason,

        approvalId: approved.id,

        runId: "RUN-APPROVED",

        approvalStore: approvals.store,

        repository,

        auditStore: new InMemoryActionExecutionAuditStore(),
      });

      const result = await tool.execute({});

      expect(result.status).toBe("EXECUTED");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(2);

      const storedApproval = await approvals.store.get("APR-1");

      expect(storedApproval).toMatchObject({
        status: "CONSUMED",

        consumedByExecutionId: result.executionId,
      });
    } finally {
      await approvals.cleanup();
    }
  });
});
