import { describe, expect, it } from "vitest";

import { executeGetNotificationState } from "../../../src/tools/get-notification-state.tool.js";

describe("executeGetNotificationState", () => {
  it("returns notification state for an existing order", () => {
    const result = executeGetNotificationState({
      orderId: "ORD-1001",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected get_notification_state to succeed");
    }

    expect(result.data.notifications).toEqual([
      {
        id: "NOT-1001",
        orderId: "ORD-1001",
        type: "EMAIL",
        status: "FAILED",
        updatedAt: "2026-09-16T09:05:00.000Z",
      },
    ]);
  });
});
