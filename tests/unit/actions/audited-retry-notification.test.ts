import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { executeAuditedRetryNotification } from "../../../src/actions/execute-audited-retry-notification.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

describe("executeAuditedRetryNotification", () => {
  it("persists the exact created notification retry as a structured effect", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const result = await executeAuditedRetryNotification({
      action: {
        kind: "RETRY_NOTIFICATION",

        orderId: "ORD-1001",

        reason:
          "Grounded remediation requires retrying the failed notification.",
      },

      repository,

      auditStore,

      initiatedBy: {
        type: "SYSTEM",

        id: "AUTO-1",
      },
    });

    expect(result.result.status).toBe("EXECUTED");

    if (result.result.status !== "EXECUTED") {
      throw new Error("Expected notification retry execution.");
    }

    const audit = await auditStore.get(result.executionId);

    expect(audit).toMatchObject({
      id: result.executionId,

      status: "EXECUTED",

      approvalId: null,

      effect: {
        kind: "NOTIFICATION_RETRY_CREATED",

        notificationId: result.result.notificationId,

        notificationStatus: "PENDING",
      },
    });
  });

  it("does not persist an execution effect when current state blocks the retry", async () => {
    const fixture = createOrder1001ActionFixture();

    fixture.accountDeliveries = [
      {
        status: "FAILED",
      },
    ];

    const repository = new InMemoryActionExecutionRepository([fixture]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const result = await executeAuditedRetryNotification({
      action: {
        kind: "RETRY_NOTIFICATION",

        orderId: "ORD-1001",

        reason:
          "Grounded remediation requires retrying the failed notification.",
      },

      repository,

      auditStore,

      initiatedBy: {
        type: "SYSTEM",

        id: "AUTO-1",
      },
    });

    expect(result.result.status).toBe("BLOCKED_BY_CURRENT_STATE");

    const audit = await auditStore.get(result.executionId);

    expect(audit).toMatchObject({
      status: "BLOCKED_BY_CURRENT_STATE",

      effect: null,
    });
  });
});
