import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStartedActionExecutionAudit } from "../../../src/actions/action-execution-audit.js";
import { FileActionExecutionAuditStore } from "../../../src/actions/file-action-execution-audit-store.js";

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
  const directory = await mkdtemp(path.join(os.tmpdir(), "action-audit-"));

  directories.push(directory);

  return new FileActionExecutionAuditStore(directory);
}

describe("FileActionExecutionAuditStore", () => {
  it("persists and retrieves execution records", async () => {
    const store = await createStore();

    const record = createStartedActionExecutionAudit({
      id: "ACT-1",

      now: new Date("2026-09-21T13:00:00.000Z"),

      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",

        reason: "Reconcile stale order.",
      },

      initiatedBy: {
        type: "AGENT",

        id: "RUN-1",
      },
    });

    await store.save(record);

    await expect(store.get("ACT-1")).resolves.toEqual(record);
  });

  it("lists execution history for an order", async () => {
    const store = await createStore();

    await store.save(
      createStartedActionExecutionAudit({
        id: "ACT-1",

        action: {
          kind: "RECONCILE_ORDER_STATE",

          orderId: "ORD-1001",

          reason: "First attempt.",
        },

        initiatedBy: {
          type: "AGENT",

          id: "RUN-1",
        },
      }),
    );

    await store.save(
      createStartedActionExecutionAudit({
        id: "ACT-2",

        action: {
          kind: "RECONCILE_ORDER_STATE",

          orderId: "ORD-2000",

          reason: "Other order.",
        },

        initiatedBy: {
          type: "AGENT",

          id: "RUN-2",
        },
      }),
    );

    const records = await store.listByOrderId("ORD-1001");

    expect(records.map((record) => record.id)).toEqual(["ACT-1"]);
  });
});
