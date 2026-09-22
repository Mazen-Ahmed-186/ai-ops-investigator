import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPendingApproval } from "../../../src/actions/approval.js";
import { decideApproval } from "../../../src/actions/approval-lifecycle.js";
import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { createFulfillmentAttemptActionTool } from "../../../src/actions/create-fulfillment-attempt.action-tool.js";
import { FileApprovalStore } from "../../../src/actions/file-approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

async function createApprovalStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "action-tool-approval-"),
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

describe("create_fulfillment_attempt action tool", () => {
  it("declares a consequential non-idempotent write capability", async () => {
    const approvals = await createApprovalStore();

    try {
      const tool = createFulfillmentAttemptActionTool({
        orderId: "ORD-1001",

        reason,

        approvalStore: approvals.store,

        repository: new InMemoryActionExecutionRepository([
          createRetryableFixture(),
        ]),

        auditStore: new InMemoryActionExecutionAuditStore(),

        initiatedBy: {
          type: "AGENT",

          id: "RUN-1",
        },
      });

      expect(tool.annotations).toEqual({
        readOnly: false,
        destructive: false,
        idempotent: false,
      });

      expect(tool.inputSchema.parse({})).toEqual({});
    } finally {
      await approvals.cleanup();
    }
  });

  it("cannot execute without persisted approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const auditStore = new InMemoryActionExecutionAuditStore();

      const tool = createFulfillmentAttemptActionTool({
        orderId: "ORD-1001",

        reason,

        approvalStore: approvals.store,

        repository,

        auditStore,

        initiatedBy: {
          type: "AGENT",

          id: "RUN-NO-APPROVAL",
        },
      });

      const result = await tool.execute({});

      expect(result.status).toBe("PENDING_APPROVAL");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(1);

      const audit = await auditStore.get(result.executionId);

      expect(audit).toMatchObject({
        approvalId: null,

        status: "PENDING_APPROVAL",

        initiatedBy: {
          type: "AGENT",

          id: "RUN-NO-APPROVAL",
        },

        effect: null,
      });
    } finally {
      await approvals.cleanup();
    }
  });

  it("executes only with the matching persisted approval", async () => {
    const approvals = await createApprovalStore();

    try {
      const repository = new InMemoryActionExecutionRepository([
        createRetryableFixture(),
      ]);

      const auditStore = new InMemoryActionExecutionAuditStore();

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

      const tool = createFulfillmentAttemptActionTool({
        orderId: "ORD-1001",

        reason,

        approvalId: approved.id,

        approvalStore: approvals.store,

        repository,

        auditStore,

        initiatedBy: {
          type: "AGENT",

          id: "RUN-APPROVED",
        },
      });

      const result = await tool.execute({});

      expect(result.status).toBe("EXECUTED");

      if (result.status !== "EXECUTED") {
        throw new Error("Expected successful fulfillment-attempt execution.");
      }

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(2);

      const audit = await auditStore.get(result.executionId);

      expect(audit).toMatchObject({
        approvalId: "APR-1",

        status: "EXECUTED",

        initiatedBy: {
          type: "AGENT",

          id: "RUN-APPROVED",
        },

        effect: {
          kind: "FULFILLMENT_ATTEMPT_CREATED",

          attemptId: result.attemptId,

          attemptStatus: "PENDING",
        },
      });
    } finally {
      await approvals.cleanup();
    }
  });

  it("cannot create a duplicate attempt on replay", async () => {
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

      const auditStore = new InMemoryActionExecutionAuditStore();

      const tool = createFulfillmentAttemptActionTool({
        orderId: "ORD-1001",

        reason,

        approvalId: approved.id,

        approvalStore: approvals.store,

        repository,

        auditStore,

        initiatedBy: {
          type: "AGENT",

          id: "RUN-1",
        },
      });

      const first = await tool.execute({});

      const second = await tool.execute({});

      expect(first.status).toBe("EXECUTED");

      expect(second.status).toBe("APPROVAL_CONSUMED");

      expect(repository.getFulfillmentAttempts("ORD-1001")).toHaveLength(2);

      const storedApproval = await approvals.store.get("APR-1");

      expect(storedApproval).toMatchObject({
        status: "CONSUMED",
        consumedByExecutionId: first.executionId,
      });

      const secondAudit = await auditStore.get(second.executionId);

      expect(secondAudit).toMatchObject({
        status: "APPROVAL_CONSUMED",
        effect: null,
      });

      if (second.status === "BLOCKED_BY_CURRENT_STATE") {
        expect(second.validationReasons).toContain(
          "A blocking fulfillment attempt already exists.",
        );
      }
    } finally {
      await approvals.cleanup();
    }
  });
});
