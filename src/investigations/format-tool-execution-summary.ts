import type { InvestigationRunState } from "./types.js";

type JsonRecord = Record<string, unknown>;

type ToolExecutionOutcome =
  | {
      status: "SUCCEEDED";
    }
  | {
      status: "FAILED";
      category: string;
    }
  | {
      status: "UNRECOGNIZED";
    };

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function readToolExecutionOutcome(result: unknown): ToolExecutionOutcome {
  const record = asRecord(result);

  if (!record) {
    return {
      status: "UNRECOGNIZED",
    };
  }

  if (record.ok === true) {
    return {
      status: "SUCCEEDED",
    };
  }

  if (record.ok !== false) {
    return {
      status: "UNRECOGNIZED",
    };
  }

  const error = asRecord(record.error);

  const category =
    error && typeof error.category === "string" ? error.category : null;

  if (!category) {
    return {
      status: "UNRECOGNIZED",
    };
  }

  return {
    status: "FAILED",
    category,
  };
}

export function formatToolExecutionSummary(
  state: Pick<InvestigationRunState, "toolExecutions">,
): string {
  if (state.toolExecutions.length === 0) {
    return "No tool executions have been persisted.";
  }

  return state.toolExecutions
    .map((execution) => {
      const args = JSON.stringify(execution.arguments);

      const outcome = readToolExecutionOutcome(execution.result);

      switch (outcome.status) {
        case "SUCCEEDED":
          return [
            `- #${execution.sequence}`,
            execution.tool,
            args,
            "-> SUCCEEDED",
            `at ${execution.executedAt}`,
          ].join(" ");

        case "FAILED":
          return [
            `- #${execution.sequence}`,
            execution.tool,
            args,
            `-> FAILED(${outcome.category})`,
            `at ${execution.executedAt}`,
          ].join(" ");

        case "UNRECOGNIZED":
          return [
            `- #${execution.sequence}`,
            execution.tool,
            args,
            "-> UNRECOGNIZED_RESULT",
            `at ${execution.executedAt}`,
          ].join(" ");
      }
    })
    .join("\n");
}
