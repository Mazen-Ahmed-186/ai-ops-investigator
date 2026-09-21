import { zodResponsesFunction } from "openai/helpers/zod";

import type { ToolCapability } from "./capability.js";
import type { ToolResult } from "./types.js";

function invalidArguments(toolName: string): ToolResult<never> {
  return {
    ok: false,
    error: {
      code: "TOOL_ARGUMENT_VALIDATION_FAILED",
      category: "VALIDATION",
      retryable: false,
      message: `Arguments for ${toolName} did not match the required schema.`,
    },
  };
}

export function createOpenAIRegisteredCapability<TInput>(
  capability: ToolCapability<TInput>,
) {
  const definition = zodResponsesFunction({
    name: capability.name,
    description: capability.description,
    parameters: capability.inputSchema,
  });

  return {
    definition,

    execute(args: unknown): ToolResult<unknown> {
      const parsed = capability.inputSchema.safeParse(args);

      if (!parsed.success) {
        return invalidArguments(capability.name);
      }

      return capability.execute(parsed.data);
    },
  };
}
