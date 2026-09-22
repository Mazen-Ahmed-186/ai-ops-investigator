import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRemediationRun } from "../../../src/remediations/create-remediation-run.js";
import { FileRemediationStore } from "../../../src/remediations/file-remediation-store.js";

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
  const directory = await mkdtemp(path.join(os.tmpdir(), "remediation-store-"));

  directories.push(directory);

  return {
    directory,

    store: new FileRemediationStore(directory),
  };
}

describe("FileRemediationStore", () => {
  it("persists and restores a running remediation", async () => {
    const { directory, store } = await createStore();

    const run = createRemediationRun({
      id: "REM-AUTO-1",

      orderId: "ORD-1001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      now: new Date("2026-09-22T14:00:00.000Z"),
    });

    await store.save(run);

    const freshStore = new FileRemediationStore(directory);

    await expect(freshStore.get("REM-AUTO-1")).resolves.toEqual(run);
  });

  it("returns null for an unknown remediation", async () => {
    const { store } = await createStore();

    await expect(store.get("REM-MISSING")).resolves.toBeNull();
  });

  it("lists only remediations belonging to the requested order", async () => {
    const { store } = await createStore();

    await store.save(
      createRemediationRun({
        id: "REM-1",

        orderId: "ORD-1001",

        automationRunId: "AUTO-1",

        investigationRunId: "INV-1",
      }),
    );

    await store.save(
      createRemediationRun({
        id: "REM-2",

        orderId: "ORD-2000",

        automationRunId: "AUTO-2",

        investigationRunId: "INV-2",
      }),
    );

    const runs = await store.listByOrderId("ORD-1001");

    expect(runs.map((run) => run.id)).toEqual(["REM-1"]);
  });
});
