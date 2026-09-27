import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { getDeliveryStateCapability } from "../tools/get-delivery-state.tool.js";
import { getFulfillmentAttemptsCapability } from "../tools/get-fulfillment-attempts.tool.js";
import { getNotificationStateCapability } from "../tools/get-notification-state.tool.js";
import { getOrderEventHistoryCapability } from "../tools/get-order-event-history.tool.js";
import { getOrderCapability } from "../tools/get-order.tool.js";
import { getPaymentStateCapability } from "../tools/get-payment-state.tool.js";
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

function assertMcpReadCapability(capability: {
  name: string;
  annotations: {
    readOnly: boolean;
    destructive: boolean;
    idempotent: boolean;
  };
}) {
  if (!capability.annotations.readOnly) {
    throw new Error(`MCP capability ${capability.name} must be read-only.`);
  }

  if (capability.annotations.destructive) {
    throw new Error(
      `MCP capability ${capability.name} must not be destructive.`,
    );
  }

  if (!capability.annotations.idempotent) {
    throw new Error(`MCP capability ${capability.name} must be idempotent.`);
  }
}

serveStdio(() => {
  const server = new McpServer({
    name: "ai-ops-investigator",
    version: "0.1.0",
  });

  assertMcpReadCapability(getOrderCapability);

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

  assertMcpReadCapability(getPaymentStateCapability);

  server.registerTool(
    getPaymentStateCapability.name,
    {
      title: getPaymentStateCapability.title,

      description: getPaymentStateCapability.description,

      inputSchema: getPaymentStateCapability.inputSchema,

      annotations: {
        readOnlyHint: getPaymentStateCapability.annotations.readOnly,

        destructiveHint: getPaymentStateCapability.annotations.destructive,

        idempotentHint: getPaymentStateCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getPaymentStateCapability.execute(args)),
  );

  assertMcpReadCapability(getFulfillmentAttemptsCapability);

  server.registerTool(
    getFulfillmentAttemptsCapability.name,
    {
      title: getFulfillmentAttemptsCapability.title,

      description: getFulfillmentAttemptsCapability.description,

      inputSchema: getFulfillmentAttemptsCapability.inputSchema,

      annotations: {
        readOnlyHint: getFulfillmentAttemptsCapability.annotations.readOnly,

        destructiveHint:
          getFulfillmentAttemptsCapability.annotations.destructive,

        idempotentHint: getFulfillmentAttemptsCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getFulfillmentAttemptsCapability.execute(args)),
  );

  assertMcpReadCapability(getDeliveryStateCapability);

  server.registerTool(
    getDeliveryStateCapability.name,
    {
      title: getDeliveryStateCapability.title,

      description: getDeliveryStateCapability.description,

      inputSchema: getDeliveryStateCapability.inputSchema,

      annotations: {
        readOnlyHint: getDeliveryStateCapability.annotations.readOnly,

        destructiveHint: getDeliveryStateCapability.annotations.destructive,

        idempotentHint: getDeliveryStateCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getDeliveryStateCapability.execute(args)),
  );

  assertMcpReadCapability(getNotificationStateCapability);

  server.registerTool(
    getNotificationStateCapability.name,
    {
      title: getNotificationStateCapability.title,

      description: getNotificationStateCapability.description,

      inputSchema: getNotificationStateCapability.inputSchema,

      annotations: {
        readOnlyHint: getNotificationStateCapability.annotations.readOnly,

        destructiveHint: getNotificationStateCapability.annotations.destructive,

        idempotentHint: getNotificationStateCapability.annotations.idempotent,
      },
    },

    async (args) => toMcpResult(getNotificationStateCapability.execute(args)),
  );

  assertMcpReadCapability(getOrderEventHistoryCapability);

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
