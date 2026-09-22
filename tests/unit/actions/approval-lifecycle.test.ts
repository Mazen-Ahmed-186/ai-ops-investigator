import { describe, expect, it } from "vitest";

import { createPendingApproval } from "../../../src/actions/approval.js";
import {
  decideApproval,
  expireApproval,
} from "../../../src/actions/approval-lifecycle.js";

function createApproval() {
  return createPendingApproval({
    id: "APR-1",

    now: new Date("2026-09-21T12:00:00.000Z"),

    ttlMs: 10 * 60 * 1000,

    action: {
      kind: "ISSUE_REFUND",

      orderId: "ORD-1001",

      reason: "Refund customer.",
    },
  });
}

describe("approval lifecycle", () => {
  it("approves a pending approval", () => {
    const result = decideApproval({
      approval: createApproval(),

      decision: "APPROVE",

      decidedBy: "admin-1",

      now: new Date("2026-09-21T12:01:00.000Z"),
    });

    expect(result.status).toBe("APPROVED");

    expect(result.resolvedBy).toBe("admin-1");
  });

  it("rejects a pending approval", () => {
    const result = decideApproval({
      approval: createApproval(),

      decision: "REJECT",

      decidedBy: "admin-1",

      now: new Date("2026-09-21T12:01:00.000Z"),
    });

    expect(result.status).toBe("REJECTED");
  });

  it("expires a pending approval", () => {
    const result = expireApproval(
      createApproval(),

      new Date("2026-09-21T12:11:00.000Z"),
    );

    expect(result.status).toBe("EXPIRED");
  });

  it("does not allow an expired approval to be approved", () => {
    expect(() =>
      decideApproval({
        approval: createApproval(),

        decision: "APPROVE",

        decidedBy: "admin-1",

        now: new Date("2026-09-21T12:11:00.000Z"),
      }),
    ).toThrow("Approval APR-1 has expired.");
  });

  it("does not allow a resolved approval to be decided again", () => {
    const approved = decideApproval({
      approval: createApproval(),

      decision: "APPROVE",

      decidedBy: "admin-1",

      now: new Date("2026-09-21T12:01:00.000Z"),
    });

    expect(() =>
      decideApproval({
        approval: approved,

        decision: "REJECT",

        decidedBy: "admin-2",

        now: new Date("2026-09-21T12:02:00.000Z"),
      }),
    ).toThrow("Approval APR-1 cannot be decided from status APPROVED.");
  });
});
