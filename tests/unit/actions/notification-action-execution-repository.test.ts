import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";

describe("notification action execution repository", () => {
  it("creates a new pending notification retry when delivery succeeded and notification failed", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const before = repository.getNotifications("ORD-1001");

    expect(before).toHaveLength(1);

    expect(before[0]).toMatchObject({
      status: "FAILED",
    });

    const result = await repository.retryNotification("ORD-1001");

    expect(result.status).toBe("CREATED");

    if (result.status !== "CREATED") {
      throw new Error("Expected notification retry to be created.");
    }

    expect(result.notificationStatus).toBe("PENDING");

    const created = await repository.getNotification(
      "ORD-1001",
      result.notificationId,
    );

    expect(created).toEqual({
      id: result.notificationId,

      status: "PENDING",
    });

    expect(repository.getNotifications("ORD-1001")).toHaveLength(2);
  });

  it("does not create another retry while one is already pending", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const first = await repository.retryNotification("ORD-1001");

    expect(first.status).toBe("CREATED");

    const second = await repository.retryNotification("ORD-1001");

    expect(second).toEqual({
      status: "PRECONDITION_FAILED",

      reasons: ["A notification retry is already pending."],
    });

    expect(repository.getNotifications("ORD-1001")).toHaveLength(2);
  });

  it("does not retry notification when delivery is no longer confirmed", async () => {
    const fixture = createOrder1001ActionFixture();

    fixture.accountDeliveries = [
      {
        status: "FAILED",
      },
    ];

    const repository = new InMemoryActionExecutionRepository([fixture]);

    const result = await repository.retryNotification("ORD-1001");

    expect(result.status).toBe("PRECONDITION_FAILED");

    if (result.status !== "PRECONDITION_FAILED") {
      throw new Error("Expected notification retry to be blocked.");
    }

    expect(result.reasons).toHaveLength(1);

    expect(repository.getNotifications("ORD-1001")).toHaveLength(1);
  });
});
