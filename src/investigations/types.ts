import type { IncidentAssessment } from "../ai/schemas.js";

export type InvestigationRunStatus =
  | "RUNNING"
  | "COMPLETED"
  | "TOOL_BUDGET_EXHAUSTED"
  | "TIME_BUDGET_EXHAUSTED"
  | "REPEATED_TOOL_CALL"
  | "FAILED";

export type InvestigationContinuation =
  | {
      kind: "INITIAL";
      prompt: string;
    }
  | {
      kind: "TOOL_OUTPUT";
      previousResponseId: string;
      callId: string;
      output: string;
    };

export type InvestigationToolExecution = {
  sequence: number;
  tool: string;
  arguments: unknown;
  result: unknown;
  executedAt: string;
};

export type InvestigationRunState = {
  id: string;
  orderId: string;
  goal: string;

  status: InvestigationRunStatus;
  workingMemory: InvestigationWorkingMemory;

  startedAt: string;
  updatedAt: string;

  toolCalls: number;

  executedToolCallSignatures: string[];

  toolExecutions: InvestigationToolExecution[];

  continuation: InvestigationContinuation | null;

  assessment: IncidentAssessment | null;

  failureReason: string | null;
};

export type InvestigationFact = {
  id: string;
  statement: string;
  sourceTool: string;
  sourceSequence: number;
};

export type InvestigationWorkingMemory = {
  facts: InvestigationFact[];
  unresolvedQuestions: string[];
};
