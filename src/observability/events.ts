export type ModelUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type BaseTelemetryEvent = {
  runId: string;
  occurredAt: string;
};

export type InvestigationStartedEvent = BaseTelemetryEvent & {
  type: "INVESTIGATION_STARTED";
  orderId: string;
};

export type ModelStepCompletedEvent = BaseTelemetryEvent & {
  type: "MODEL_STEP_COMPLETED";
  step: number;
  durationMs: number;
  usage: ModelUsage;
};

export type ToolExecutionCompletedEvent = BaseTelemetryEvent & {
  type: "TOOL_EXECUTION_COMPLETED";
  step: number;
  toolName: string;
  durationMs: number;
  ok: boolean;
  errorCategory: string | null;
};

export type InvestigationFinishedEvent = BaseTelemetryEvent & {
  type: "INVESTIGATION_FINISHED";
  durationMs: number;
  toolCalls: number;
  status:
    | "COMPLETED"
    | "TOOL_BUDGET_EXHAUSTED"
    | "TIME_BUDGET_EXHAUSTED"
    | "REPEATED_TOOL_CALL";
};

export type InvestigationFailedEvent = BaseTelemetryEvent & {
  type: "INVESTIGATION_FAILED";
  durationMs: number;
  reason: string;
};

export type InvestigationTelemetryEvent =
  | InvestigationStartedEvent
  | ModelStepCompletedEvent
  | ToolExecutionCompletedEvent
  | InvestigationFinishedEvent
  | InvestigationFailedEvent;

export interface TelemetrySink {
  record(event: InvestigationTelemetryEvent): void;
}
