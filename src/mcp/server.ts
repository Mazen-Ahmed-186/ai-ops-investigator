import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import {
  executeGetOrder,
  GetOrderArgumentsSchema,
} from "../tools/get-order.tool.js";
import {
  executeGetOrderEventHistory,
  GetOrderEventHistoryArgumentsSchema,
} from "../tools/get-order-event-history.tool.js";
import type { ToolResult } from "../tools/types.js";

function toMcpResult(result: ToolResult<unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result),
      },
    ],
    isError: !result.ok,
  };
}

serveStdio(() => {
  const server = new McpServer({
    name: "ai-ops-investigator",
    version: "0.1.0",
  });

  server.registerTool(
    "get_order",
    {
      title: "Get Order",
      description:
        "Retrieve the current high-level state of exactly one order. Use this to inspect order status before investigating related payment, fulfillment, delivery, or historical evidence.",
      inputSchema: GetOrderArgumentsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      return toMcpResult(executeGetOrder(args));
    },
  );

  server.registerTool(
    "get_order_event_history",
    {
      title: "Get Order Event History",
      description:
        "Retrieve chronological business events for exactly one order. Use this when current state is inconsistent and historical evidence is needed to understand how the order reached that state.",
      inputSchema: GetOrderEventHistoryArgumentsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      return toMcpResult(executeGetOrderEventHistory(args));
    },
  );

  return server;
});
