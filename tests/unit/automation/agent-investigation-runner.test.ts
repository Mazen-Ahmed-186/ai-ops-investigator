import { describe, expect, it, vi } from "vitest";

import {
  createAgentInvestigationRunner,
  type AgentInvestigationExecutor,
} from "../../../src/automation/agent-investigation-runner.js";

describe("createAgentInvestigationRunner", () => {
  it("maps a ready diagnosis into the automation contract", async () => {
    const execute = vi.fn<AgentInvestigationExecutor>(async () => ({
      investigationRunId: "INV-1",

      diagnosisStatus: "DIAGNOSIS_READY",
    }));

    const runner = createAgentInvestigationRunner(execute);

    const result = await runner.run({
      orderId: "ORD-1001",
      investigationRunId: "INV-AUTO-1",
      automationRunId: "AUTO-1",
    });

    expect(result).toEqual({
      status: "DIAGNOSIS_READY",

      investigationRunId: "INV-1",
    });

    expect(execute).toHaveBeenCalledWith({
      orderId: "ORD-1001",
      investigationRunId: "INV-AUTO-1",
      automationRunId: "AUTO-1",
    });
  });

  it("maps insufficient evidence into escalation-compatible output", async () => {
    const execute: AgentInvestigationExecutor = async () => ({
      investigationRunId: "INV-2",

      diagnosisStatus: "NEEDS_MORE_EVIDENCE",
    });

    const runner = createAgentInvestigationRunner(execute);

    await expect(
      runner.run({
        orderId: "ORD-1001",
        investigationRunId: "INV-AUTO-1",
        automationRunId: "AUTO-2",
      }),
    ).resolves.toEqual({
      status: "NEEDS_MORE_EVIDENCE",

      investigationRunId: "INV-2",
    });
  });

  it("does not swallow investigation failures", async () => {
    const runner = createAgentInvestigationRunner(async () => {
      throw new Error("Investigation failed.");
    });

    await expect(
      runner.run({
        orderId: "ORD-1001",
        investigationRunId: "INV-AUTO-1",
        automationRunId: "AUTO-3",
      }),
    ).rejects.toThrow("Investigation failed.");
  });
});
