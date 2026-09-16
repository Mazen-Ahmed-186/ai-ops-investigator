import {
  executeGetFulfillmentAttempts,
  GetFulfillmentAttemptsArgumentsSchema,
  getFulfillmentAttemptsTool,
} from "./get-fulfillment-attempts.tool.js";
import {
  executeGetOrder,
  GetOrderArgumentsSchema,
  getOrderTool,
} from "./get-order.tool.js";
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

export const toolRegistry = {
  get_order: {
    definition: getOrderTool,

    execute(args: unknown): ToolResult<unknown> {
      const parsed = GetOrderArgumentsSchema.safeParse(args);

      if (!parsed.success) {
        return invalidArguments("get_order");
      }

      return executeGetOrder(parsed.data);
    },
  },

  get_fulfillment_attempts: {
    definition: getFulfillmentAttemptsTool,

    execute(args: unknown): ToolResult<unknown> {
      const parsed = GetFulfillmentAttemptsArgumentsSchema.safeParse(args);

      if (!parsed.success) {
        return invalidArguments("get_fulfillment_attempts");
      }

      return executeGetFulfillmentAttempts(parsed.data);
    },
  },
} as const;

export type ToolName = keyof typeof toolRegistry;

export const modelTools = Object.values(toolRegistry).map(
  (entry) => entry.definition,
);

export function executeRegisteredTool(
  name: string,
  args: unknown,
): ToolResult<unknown> {
  const entry = toolRegistry[name as ToolName];

  if (!entry) {
    return {
      ok: false,
      error: {
        code: "TOOL_NOT_REGISTERED",
        category: "VALIDATION",
        retryable: false,
        message: `Tool ${name} is not registered.`,
      },
    };
  }

  return entry.execute(args);
}
