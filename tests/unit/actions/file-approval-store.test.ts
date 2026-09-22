import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPendingApproval } from "../../../src/actions/approval.js";
import { FileApprovalStore } from "../../../src/actions/file-approval-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "approval-store-"));

  directories.push(directory);

  return new FileApprovalStore(directory);
}

describe("FileApprovalStore", () => {
  it("persists and retrieves an approval", async () => {
    const store = await createStore();

    const approval = createPendingApproval({
      id: "APR-1",

      now: new Date("2026-09-21T12:00:00.000Z"),

      action: {
        kind: "ISSUE_REFUND",

        orderId: "ORD-1001",

        reason: "Refund customer.",
      },
    });

    await store.save(approval);

    await expect(store.get("APR-1")).resolves.toEqual(approval);
  });

  it("returns null for an unknown approval", async () => {
    const store = await createStore();

    await expect(store.get("APR-404")).resolves.toBeNull();
  });

  it("lists approvals belonging to an order", async () => {
    const store = await createStore();

    await store.save(
      createPendingApproval({
        id: "APR-1",

        action: {
          kind: "ISSUE_REFUND",

          orderId: "ORD-1001",

          reason: "Refund customer.",
        },
      }),
    );

    await store.save(
      createPendingApproval({
        id: "APR-2",

        action: {
          kind: "ISSUE_REFUND",

          orderId: "ORD-2000",

          reason: "Refund another customer.",
        },
      }),
    );

    const approvals = await store.listByOrderId("ORD-1001");

    expect(approvals.map((approval) => approval.id)).toEqual(["APR-1"]);
  });
});
