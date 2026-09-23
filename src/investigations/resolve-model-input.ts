import type { ResponseInput } from "openai/resources/responses/responses";

import { buildReconstructedInvestigationInput } from "./build-model-context.js";
import type { InvestigationRunState } from "./types.js";

export type InvestigationExecutionMode = "NEW" | "RESUME";

export type InvestigationModelInput = {
  previousResponseId: string | null;
  input: string | ResponseInput;
};

export function resolveInvestigationModelInput(
  state: InvestigationRunState,
  mode: InvestigationExecutionMode,
): InvestigationModelInput {
  if (!state.continuation) {
    throw new Error(`Investigation ${state.id} has no continuation state.`);
  }

  if (mode === "RESUME") {
    return {
      previousResponseId: null,

      input: buildReconstructedInvestigationInput(state),
    };
  }

  if (state.continuation.kind === "INITIAL") {
    return {
      previousResponseId: null,
      input: state.continuation.prompt,
    };
  }

  return {
    previousResponseId: state.continuation.previousResponseId,
    input: [
      {
        type: "function_call_output",
        call_id: state.continuation.callId,
        output: state.continuation.output,
      },
    ],
  };
}
