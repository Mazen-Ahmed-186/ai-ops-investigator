import { describe, expect, it, vi } from "vitest";

import type { IncidentAssessment } from "../../../src/ai/schemas.js";
import {
  createInvestigationBackedRemediationPlanner,
  type RemediationGenerator,
} from "../../../src/automation/investigation-backed-remediation-planner.js";
import type { InvestigationStore } from "../../../src/investigations/store.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

function createStore(state: InvestigationRunState | null): InvestigationStore {
  let current = state ? structuredClone(state) : null;

  return {
    async save(next) {
      current = structuredClone(next);
    },

    async get(runId) {
      if (!current || current.id !== runId) {
        return null;
      }

      return structuredClone(current);
    },
  };
}

function createAssessment(): IncidentAssessment {
  return {
    diagnosisStatus: "DIAGNOSIS_READY",

    rootCauseCategory: "INFRASTRUCTURE",

    confidence: "HIGH",

    summary: "The final order-state persistence timed out.",

    findings: [],

    requiresMoreEvidence: false,
  };
}

function createInvestigation(
  overrides: Partial<InvestigationRunState> = {},
): InvestigationRunState {
  return {
    id: "INV-AUTO-1",

    orderId: "ORD-1001",

    goal: "Determine why order ORD-1001 is stuck.",

    status: "COMPLETED",

    workingMemory: {
      facts: [],
      unresolvedQuestions: [],
    },

    startedAt: "2026-09-22T14:00:00.000Z",

    updatedAt: "2026-09-22T14:01:00.000Z",

    toolCalls: 7,

    executedToolCallSignatures: [],

    toolExecutions: [],

    continuation: null,

    assessment: createAssessment(),

    failureReason: null,

    ...overrides,
  };
}

describe("createInvestigationBackedRemediationPlanner", () => {
  it("plans remediation from the persisted completed assessment", async () => {
    const assessment = createAssessment();

    const store = createStore(
      createInvestigation({
        assessment,
      }),
    );

    const generate = vi.fn<RemediationGenerator>(async () => ({
      recommendation: {
        status: "RECOMMENDATION_READY",

        summary: "Reconcile the stale order state.",

        actions: [
          {
            instruction: "Reconcile the stale order state.",

            supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
          },
        ],
      },

      retrievedRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
    }));

    const planner = createInvestigationBackedRemediationPlanner({
      investigationStore: store,

      generate,
    });

    const result = await planner({
      orderId: "ORD-1001",

      investigationRunId: "INV-AUTO-1",
    });

    expect(result.recommendation.status).toBe("RECOMMENDATION_READY");

    expect(generate).toHaveBeenCalledWith({
      orderId: "ORD-1001",

      investigationRunId: "INV-AUTO-1",

      assessment,
    });
  });

  it("rejects an unknown investigation", async () => {
    const planner = createInvestigationBackedRemediationPlanner({
      investigationStore: createStore(null),

      generate: vi.fn(),
    });

    await expect(
      planner({
        orderId: "ORD-1001",

        investigationRunId: "INV-MISSING",
      }),
    ).rejects.toThrow("Investigation INV-MISSING was not found.");
  });

  it("rejects an investigation belonging to another order", async () => {
    const planner = createInvestigationBackedRemediationPlanner({
      investigationStore: createStore(
        createInvestigation({
          orderId: "ORD-2000",
        }),
      ),

      generate: vi.fn(),
    });

    await expect(
      planner({
        orderId: "ORD-1001",

        investigationRunId: "INV-AUTO-1",
      }),
    ).rejects.toThrow(
      "Investigation INV-AUTO-1 belongs to order ORD-2000, not ORD-1001.",
    );
  });

  it("rejects an investigation that has not completed", async () => {
    const planner = createInvestigationBackedRemediationPlanner({
      investigationStore: createStore(
        createInvestigation({
          status: "RUNNING",

          assessment: null,
        }),
      ),

      generate: vi.fn(),
    });

    await expect(
      planner({
        orderId: "ORD-1001",

        investigationRunId: "INV-AUTO-1",
      }),
    ).rejects.toThrow("Investigation INV-AUTO-1 is not completed.");
  });

  it("rejects a diagnosis that still needs more evidence", async () => {
    const planner = createInvestigationBackedRemediationPlanner({
      investigationStore: createStore(
        createInvestigation({
          assessment: {
            ...createAssessment(),

            diagnosisStatus: "NEEDS_MORE_EVIDENCE",

            rootCauseCategory: "UNKNOWN",

            confidence: "LOW",

            requiresMoreEvidence: true,
          },
        }),
      ),

      generate: vi.fn(),
    });

    await expect(
      planner({
        orderId: "ORD-1001",

        investigationRunId: "INV-AUTO-1",
      }),
    ).rejects.toThrow(
      "Investigation INV-AUTO-1 does not have a remediation-ready diagnosis.",
    );
  });
});
