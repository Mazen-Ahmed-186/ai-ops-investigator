import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAutomationRun } from "../../../src/automation/create-automation-run.js";
import { FileAutomationStore } from "../../../src/automation/file-automation-store.js";
import { transitionAutomationRun } from "../../../src/automation/state-machine.js";

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
  const directory = await mkdtemp(path.join(os.tmpdir(), "automation-store-"));

  directories.push(directory);

  return {
    directory,

    store: new FileAutomationStore(directory),
  };
}

describe("FileAutomationStore", () => {
  it("persists and retrieves an automation run", async () => {
    const { store } = await createStore();

    const run = createAutomationRun({
      id: "AUTO-1",

      orderId: "ORD-1001",

      now: new Date("2026-09-22T14:00:00.000Z"),
    });

    await store.save(run);

    await expect(store.get("AUTO-1")).resolves.toEqual(run);
  });

  it("returns null for an unknown automation run", async () => {
    const { store } = await createStore();

    await expect(store.get("AUTO-MISSING")).resolves.toBeNull();
  });

  it("persists workflow progress across store instances", async () => {
    const { directory, store } = await createStore();

    const pending = createAutomationRun({
      id: "AUTO-1",

      orderId: "ORD-1001",

      now: new Date("2026-09-22T14:00:00.000Z"),
    });

    await store.save(pending);

    const investigating = transitionAutomationRun(
      pending,

      "INVESTIGATING",

      new Date("2026-09-22T14:01:00.000Z"),
    );

    await store.save(investigating);

    const freshProcessStore = new FileAutomationStore(directory);

    const restored = await freshProcessStore.get("AUTO-1");

    expect(restored).toEqual(investigating);

    expect(restored?.status).toBe("INVESTIGATING");
  });

  it("persists a workflow paused for approval", async () => {
    const { directory, store } = await createStore();

    let run = createAutomationRun({
      id: "AUTO-1",

      orderId: "ORD-1001",

      now: new Date("2026-09-22T14:00:00.000Z"),
    });

    run = transitionAutomationRun(run, "INVESTIGATING");

    run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

    run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL");

    run = {
      ...run,

      investigationRunId: "INV-1",

      approvalId: "APR-1",
    };

    await store.save(run);

    const freshProcessStore = new FileAutomationStore(directory);

    const restored = await freshProcessStore.get("AUTO-1");

    expect(restored).toMatchObject({
      status: "WAITING_FOR_APPROVAL",

      investigationRunId: "INV-1",

      approvalId: "APR-1",
    });
  });

  it("lists runs belonging to one order", async () => {
    const { store } = await createStore();

    await store.save(
      createAutomationRun({
        id: "AUTO-1",

        orderId: "ORD-1001",

        now: new Date("2026-09-22T14:00:00.000Z"),
      }),
    );

    await store.save(
      createAutomationRun({
        id: "AUTO-2",

        orderId: "ORD-2000",

        now: new Date("2026-09-22T14:01:00.000Z"),
      }),
    );

    await store.save(
      createAutomationRun({
        id: "AUTO-3",

        orderId: "ORD-1001",

        now: new Date("2026-09-22T14:02:00.000Z"),
      }),
    );

    const runs = await store.listByOrderId("ORD-1001");

    expect(runs.map((run) => run.id)).toEqual(["AUTO-1", "AUTO-3"]);
  });
});
