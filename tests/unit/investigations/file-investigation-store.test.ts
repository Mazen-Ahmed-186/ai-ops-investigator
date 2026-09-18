import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileInvestigationStore } from "../../../src/investigations/file-investigation-store.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

const directories: string[] = [];

async function createStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "ai-ops-investigator-"),
  );

  directories.push(directory);

  return new FileInvestigationStore(directory);
}

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

describe("FileInvestigationStore", () => {
  it("persists and reloads investigation state", async () => {
    const store = await createStore();

    const state: InvestigationRunState = {
      id: "RUN-1001",
      orderId: "ORD-1001",
      goal: "Determine why ORD-1001 is stuck.",

      status: "RUNNING",

      startedAt: "2026-09-18T16:00:00.000Z",
      updatedAt: "2026-09-18T16:00:00.000Z",

      toolCalls: 1,

      executedToolCallSignatures: [
        '{"name":"get_order","arguments":{"orderId":"ORD-1001"}}',
      ],

      toolExecutions: [
        {
          sequence: 1,
          tool: "get_order",
          arguments: {
            orderId: "ORD-1001",
          },
          result: {
            ok: true,
          },
          executedAt: "2026-09-18T16:00:01.000Z",
        },
      ],

      continuation: {
        kind: "TOOL_OUTPUT",
        previousResponseId: "resp_123",
        callId: "call_123",
        output: '{"ok":true}',
      },

      assessment: null,
      failureReason: null,
    };

    await store.save(state);

    const restored = await store.get("RUN-1001");

    expect(restored).toEqual(state);
  });

  it("returns null for an unknown run", async () => {
    const store = await createStore();

    expect(await store.get("RUN-UNKNOWN")).toBeNull();
  });
});
