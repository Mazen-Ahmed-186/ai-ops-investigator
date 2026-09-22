import { describe, expect, it, vi } from "vitest";

import { createDurableRemediationRunner } from "../../../src/automation/durable-remediation-runner.js";
import { InMemoryRemediationStore } from "../../../src/remediations/in-memory-remediation-store.js";
import type { RemediationRun } from "../../../src/remediations/types.js";

type Recommendation = NonNullable<RemediationRun["recommendation"]>;

function createRecommendation(): Recommendation {
  return {
    status: "RECOMMENDATION_READY",

    summary: "Reconcile the stale order state without repeating fulfillment.",

    actions: [
      {
        instruction: "Reconcile the stale order state.",

        supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
      },
    ],
  };
}

describe("createDurableRemediationRunner", () => {
  it("persists a completed remediation recommendation", async () => {
    const store = new InMemoryRemediationStore();

    const planner = vi.fn(async () => ({
      recommendation: createRecommendation(),

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    }));

    const runner = createDurableRemediationRunner({
      store,
      planner,
    });

    const result = await runner.run({
      orderId: "ORD-1001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      remediationRunId: "REM-AUTO-1",
    });

    expect(result).toEqual({
      status: "COMPLETED",

      remediationRunId: "REM-AUTO-1",
    });

    await expect(store.get("REM-AUTO-1")).resolves.toMatchObject({
      status: "COMPLETED",

      recommendation: createRecommendation(),

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],

      failureReason: null,
    });
  });

  it("reuses an already-completed remediation without planning again", async () => {
    const store = new InMemoryRemediationStore();

    const planner = vi.fn(async () => ({
      recommendation: createRecommendation(),

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    }));

    const runner = createDurableRemediationRunner({
      store,
      planner,
    });

    const request = {
      orderId: "ORD-1001",

      automationRunId: "AUTO-1",

      investigationRunId: "INV-AUTO-1",

      remediationRunId: "REM-AUTO-1",
    };

    await runner.run(request);

    await runner.run(request);

    expect(planner).toHaveBeenCalledTimes(1);
  });

  it("persists FAILED when planning throws", async () => {
    const store = new InMemoryRemediationStore();

    const runner = createDurableRemediationRunner({
      store,

      planner: async () => {
        throw new Error("Retrieval unavailable.");
      },
    });

    await expect(
      runner.run({
        orderId: "ORD-1001",

        automationRunId: "AUTO-1",

        investigationRunId: "INV-AUTO-1",

        remediationRunId: "REM-AUTO-1",
      }),
    ).rejects.toThrow("Retrieval unavailable.");

    await expect(store.get("REM-AUTO-1")).resolves.toMatchObject({
      status: "FAILED",

      failureReason: "Retrieval unavailable.",
    });
  });
});
