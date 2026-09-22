import {
  resumeAgentInvestigation,
  runAgentInvestigation,
} from "../ai/run-agent-investigation.js";
import { FileInvestigationStore } from "../investigations/file-investigation-store.js";
import type { InvestigationStore } from "../investigations/store.js";
import type { TelemetrySink } from "../observability/events.js";
import type {
  AgentInvestigationExecutor,
  AgentInvestigationOutcome,
} from "./agent-investigation-runner.js";

type RunAgentInvestigation = typeof runAgentInvestigation;

type ResumeAgentInvestigation = typeof resumeAgentInvestigation;

type InvestigationResult = Awaited<ReturnType<typeof runAgentInvestigation>>;

function mapInvestigationResult(
  result: InvestigationResult,
): AgentInvestigationOutcome {
  switch (result.status) {
    case "COMPLETED":
      return {
        investigationRunId: result.runId,

        diagnosisStatus: result.assessment.diagnosisStatus,
      };

    case "TOOL_BUDGET_EXHAUSTED":
    case "TIME_BUDGET_EXHAUSTED":
    case "REPEATED_TOOL_CALL":
      return {
        investigationRunId: result.runId,

        diagnosisStatus: "NEEDS_MORE_EVIDENCE",
      };
  }
}

export function createRunAgentInvestigationExecutor(
  args: {
    store?: InvestigationStore;
    telemetry?: TelemetrySink;
    runInvestigation?: RunAgentInvestigation;
    resumeInvestigation?: ResumeAgentInvestigation;
  } = {},
): AgentInvestigationExecutor {
  const store = args.store ?? new FileInvestigationStore();

  const start = args.runInvestigation ?? runAgentInvestigation;

  const resume = args.resumeInvestigation ?? resumeAgentInvestigation;

  return async ({ orderId, investigationRunId }) => {
    const existing = await store.get(investigationRunId);

    if (!existing) {
      const result = await start(orderId, {
        runId: investigationRunId,
        store,

        ...(args.telemetry
          ? {
              telemetry: args.telemetry,
            }
          : {}),
      });

      return mapInvestigationResult(result);
    }

    switch (existing.status) {
      case "RUNNING": {
        const result = await resume(investigationRunId, {
          store,

          ...(args.telemetry
            ? {
                telemetry: args.telemetry,
              }
            : {}),
        });

        return mapInvestigationResult(result);
      }

      case "COMPLETED":
        if (!existing.assessment) {
          throw new Error(
            `Investigation ${existing.id} is COMPLETED without an assessment.`,
          );
        }

        return {
          investigationRunId: existing.id,

          diagnosisStatus: existing.assessment.diagnosisStatus,
        };

      case "TOOL_BUDGET_EXHAUSTED":
      case "TIME_BUDGET_EXHAUSTED":
      case "REPEATED_TOOL_CALL":
        return {
          investigationRunId: existing.id,

          diagnosisStatus: "NEEDS_MORE_EVIDENCE",
        };

      case "FAILED":
        throw new Error(
          existing.failureReason ?? `Investigation ${existing.id} failed.`,
        );
    }
  };
}
