import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { executeRetryNotification } from "../../../src/actions/execute-retry-notification.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

const action = {
  kind: "RETRY_NOTIFICATION" as const,

  orderId: "ORD-1001",

  reason: "Grounded remediation requires retrying the failed notification.",
};

describe("executeRetryNotification", () => {
  it("creates a pending notification retry when current state is safe", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const result = await executeRetryNotification({
      action,
      repository,
    });

    expect(result.status).toBe("EXECUTED");

    if (result.status !== "EXECUTED") {
      throw new Error("Expected notification retry execution.");
    }

    expect(result.notificationStatus).toBe("PENDING");

    await expect(
      repository.getNotification("ORD-1001", result.notificationId),
    ).resolves.toEqual({
      id: result.notificationId,

      status: "PENDING",
    });
  });

  it("blocks execution when delivery is no longer confirmed", async () => {
    const fixture = createOrder1001ActionFixture();

    fixture.accountDeliveries = [
      {
        status: "FAILED",
      },
    ];

    const repository = new InMemoryActionExecutionRepository([fixture]);

    const result = await executeRetryNotification({
      action,
      repository,
    });

    expect(result.status).toBe("BLOCKED_BY_CURRENT_STATE");

    expect(repository.getNotifications("ORD-1001")).toHaveLength(1);
  });

  it("returns NOT_FOUND when the order does not exist", async () => {
    const repository = new InMemoryActionExecutionRepository([]);

    const result = await executeRetryNotification({
      action,
      repository,
    });

    expect(result).toEqual({
      status: "NOT_FOUND",

      reason: "Order ORD-1001 was not found.",
    });
  });

  it("blocks a duplicate retry when a pending notification already exists", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const first = await executeRetryNotification({
      action,
      repository,
    });

    expect(first.status).toBe("EXECUTED");

    const second = await executeRetryNotification({
      action,
      repository,
    });

    expect(second.status).toBe("BLOCKED_BY_CURRENT_STATE");

    expect(repository.getNotifications("ORD-1001")).toHaveLength(2);
  });
});
