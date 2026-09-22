import { describe, expect, it, vi } from "vitest";

import type { IncidentAssessment } from "../../../src/ai/schemas.js";
import {
  resumeAgentInvestigation,
  runAgentInvestigation,
} from "../../../src/ai/run-agent-investigation.js";
import { createRunAgentInvestigationExecutor } from "../../../src/automation/run-agent-investigation-executor.js";
import type { InvestigationStore } from "../../../src/investigations/store.js";
import type { InvestigationRunState } from "../../../src/investigations/types.js";

function createInvestigationStore(
  initial: InvestigationRunState | null = null,
): InvestigationStore {
  let state = initial ? structuredClone(initial) : null;

  return {
    async save(next) {
      state = structuredClone(next);
    },

    async get(runId) {
      if (!state || state.id !== runId) {
        return null;
      }

      return structuredClone(state);
    },
  };
}

function createAssessment(
  diagnosisStatus: IncidentAssessment["diagnosisStatus"],
): IncidentAssessment {
  return {
    diagnosisStatus,

    rootCauseCategory:
      diagnosisStatus === "DIAGNOSIS_READY" ? "INFRASTRUCTURE" : "UNKNOWN",

    confidence: diagnosisStatus === "DIAGNOSIS_READY" ? "HIGH" : "LOW",

    summary:
      diagnosisStatus === "DIAGNOSIS_READY"
        ? "The final order-state persistence timed out."
        : "Available evidence is insufficient.",

    findings: [],

    requiresMoreEvidence: diagnosisStatus === "NEEDS_MORE_EVIDENCE",
  };
}

describe("createRunAgentInvestigationExecutor", () => {
  it("runs the investigator with a deterministic automation-linked run id", async () => {
    const store = createInvestigationStore();

    const runInvestigation = vi.fn<typeof runAgentInvestigation>(async () => ({
      status: "COMPLETED",
      runId: "INV-AUTO-1",
      assessment: createAssessment("DIAGNOSIS_READY"),
      toolCalls: 7,
    }));

    const execute = createRunAgentInvestigationExecutor({
      store,
      runInvestigation,
    });

    const result = await execute({
      orderId: "ORD-1001",
      automationRunId: "AUTO-1",
      investigationRunId: "INV-AUTO-1",
    });

    expect(result).toEqual({
      investigationRunId: "INV-AUTO-1",
      diagnosisStatus: "DIAGNOSIS_READY",
    });

    expect(runInvestigation).toHaveBeenCalledWith("ORD-1001", {
      runId: "INV-AUTO-1",
      store,
    });
  });

  it("preserves a completed needs-more-evidence assessment", async () => {
    const store = createInvestigationStore();

    const execute = createRunAgentInvestigationExecutor({
      store,

      runInvestigation: async () => ({
        status: "COMPLETED",
        runId: "INV-AUTO-2",
        assessment: createAssessment("NEEDS_MORE_EVIDENCE"),
        toolCalls: 6,
      }),
    });

    await expect(
      execute({
        orderId: "ORD-1001",
        automationRunId: "AUTO-2",
        investigationRunId: "INV-AUTO-2",
      }),
    ).resolves.toEqual({
      investigationRunId: "INV-AUTO-2",
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
    });
  });

  it("fails closed when the investigation exhausts its tool budget", async () => {
    const store = createInvestigationStore();

    const execute = createRunAgentInvestigationExecutor({
      store,

      runInvestigation: async () => ({
        status: "TOOL_BUDGET_EXHAUSTED",
        runId: "INV-AUTO-3",
        toolCalls: 8,
      }),
    });

    await expect(
      execute({
        orderId: "ORD-1001",
        automationRunId: "AUTO-3",
        investigationRunId: "INV-AUTO-3",
      }),
    ).resolves.toEqual({
      investigationRunId: "INV-AUTO-3",
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
    });
  });

  it("fails closed when the investigation exhausts its time budget", async () => {
    const store = createInvestigationStore();

    const execute = createRunAgentInvestigationExecutor({
      store,

      runInvestigation: async () => ({
        status: "TIME_BUDGET_EXHAUSTED",
        runId: "INV-AUTO-4",
        toolCalls: 5,
      }),
    });

    await expect(
      execute({
        orderId: "ORD-1001",
        automationRunId: "AUTO-4",
        investigationRunId: "INV-AUTO-4",
      }),
    ).resolves.toEqual({
      investigationRunId: "INV-AUTO-4",
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
    });
  });

  it("fails closed on repeated tool-call termination", async () => {
    const store = createInvestigationStore();

    const execute = createRunAgentInvestigationExecutor({
      store,

      runInvestigation: async () => ({
        status: "REPEATED_TOOL_CALL",
        runId: "INV-AUTO-5",
        toolCalls: 4,
        tool: "get_order",
      }),
    });

    await expect(
      execute({
        orderId: "ORD-1001",
        automationRunId: "AUTO-5",
        investigationRunId: "INV-AUTO-5",
      }),
    ).resolves.toEqual({
      investigationRunId: "INV-AUTO-5",
      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
    });
  });

  it("does not convert unexpected investigator failures into a diagnosis", async () => {
    const store = createInvestigationStore();

    const execute = createRunAgentInvestigationExecutor({
      store,

      runInvestigation: async () => {
        throw new Error("Provider unavailable.");
      },
    });

    await expect(
      execute({
        orderId: "ORD-1001",
        automationRunId: "AUTO-6",
        investigationRunId: "INV-AUTO-6",
      }),
    ).rejects.toThrow("Provider unavailable.");
  });

  it("resumes an already-running durable investigation instead of starting another one", async () => {
    const store = createInvestigationStore({
      id: "INV-AUTO-1",

      orderId: "ORD-1001",

      goal: "Determine why order ORD-1001 is stuck.",

      status: "RUNNING",

      workingMemory: {
        facts: [],
        unresolvedQuestions: [],
      },

      startedAt: "2026-09-22T14:00:00.000Z",

      updatedAt: "2026-09-22T14:01:00.000Z",

      toolCalls: 3,

      executedToolCallSignatures: [],

      toolExecutions: [],

      continuation: {
        kind: "INITIAL",
        prompt: "Why is order ORD-1001 stuck?",
      },

      assessment: null,

      failureReason: null,
    });

    const runInvestigation = vi.fn<typeof runAgentInvestigation>();

    const resumeInvestigation = vi.fn<typeof resumeAgentInvestigation>(
      async () => ({
        status: "COMPLETED",
        runId: "INV-AUTO-1",
        assessment: createAssessment("DIAGNOSIS_READY"),
        toolCalls: 7,
      }),
    );

    const execute = createRunAgentInvestigationExecutor({
      store,
      runInvestigation,
      resumeInvestigation,
    });

    const result = await execute({
      orderId: "ORD-1001",
      automationRunId: "AUTO-1",
      investigationRunId: "INV-AUTO-1",
    });

    expect(runInvestigation).not.toHaveBeenCalled();

    expect(resumeInvestigation).toHaveBeenCalledWith("INV-AUTO-1", {
      store,
    });

    expect(result).toEqual({
      investigationRunId: "INV-AUTO-1",
      diagnosisStatus: "DIAGNOSIS_READY",
    });
  });
});
