import type {
  AutomationInvestigationRequest,
  AutomationInvestigationResult,
  AutomationInvestigationRunner,
} from "./investigation-runner.js";

export type AgentInvestigationOutcome = {
  investigationRunId: string;

  diagnosisStatus: "DIAGNOSIS_READY" | "NEEDS_MORE_EVIDENCE";
};

export type AgentInvestigationExecutor = (
  args: AutomationInvestigationRequest,
) => Promise<AgentInvestigationOutcome>;

export function createAgentInvestigationRunner(
  execute: AgentInvestigationExecutor,
): AutomationInvestigationRunner {
  return {
    async run(args): Promise<AutomationInvestigationResult> {
      const result = await execute(args);

      switch (result.diagnosisStatus) {
        case "DIAGNOSIS_READY":
          return {
            status: "DIAGNOSIS_READY",
            investigationRunId: result.investigationRunId,
          };

        case "NEEDS_MORE_EVIDENCE":
          return {
            status: "NEEDS_MORE_EVIDENCE",
            investigationRunId: result.investigationRunId,
          };
      }
    },
  };
}
