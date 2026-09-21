import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { getOrderEventHistoryCapability } from "../tools/get-order-event-history.tool.js";
import { getOrderCapability } from "../tools/get-order.tool.js";
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
    getOrderCapability.name,
    {
      title: getOrderCapability.title,
      description: getOrderCapability.description,
      inputSchema: getOrderCapability.inputSchema,

      annotations: {
        readOnlyHint: getOrderCapability.annotations.readOnly,
        destructiveHint: getOrderCapability.annotations.destructive,
        idempotentHint: getOrderCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getOrderCapability.execute(args)),
  );

  server.registerTool(
    getOrderEventHistoryCapability.name,
    {
      title: getOrderEventHistoryCapability.title,
      description: getOrderEventHistoryCapability.description,
      inputSchema: getOrderEventHistoryCapability.inputSchema,

      annotations: {
        readOnlyHint: getOrderEventHistoryCapability.annotations.readOnly,
        destructiveHint: getOrderEventHistoryCapability.annotations.destructive,
        idempotentHint: getOrderEventHistoryCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getOrderEventHistoryCapability.execute(args)),
  );

  return server;
});
