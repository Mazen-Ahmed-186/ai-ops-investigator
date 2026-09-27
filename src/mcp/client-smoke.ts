import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const expectedReadTools = [
  "get_order",
  "get_payment_state",
  "get_fulfillment_attempts",
  "get_delivery_state",
  "get_notification_state",
  "get_order_event_history",
] as const;

const prohibitedActionTools = [
  "reconcile_order_state",
  "retry_notification",
  "create_fulfillment_attempt",
  "issue_refund",
  "cancel_order",
] as const;

async function main() {
  const client = new Client({
    name: "ai-ops-investigator-smoke-client",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "pnpm",

    args: ["exec", "tsx", "src/mcp/server.ts"],

    cwd: process.cwd(),
  });

  try {
    await client.connect(transport);

    console.log("Connected to MCP server.");

    const { tools } = await client.listTools();

    console.log(
      "Discovered tools:",
      tools.map((tool) => ({
        name: tool.name,

        description: tool.description,

        annotations: tool.annotations,
      })),
    );

    const discoveredNames = new Set(tools.map((tool) => tool.name));

    for (const expectedTool of expectedReadTools) {
      if (!discoveredNames.has(expectedTool)) {
        throw new Error(
          `Expected MCP read tool ${expectedTool} was not discovered.`,
        );
      }
    }

    for (const prohibitedTool of prohibitedActionTools) {
      if (discoveredNames.has(prohibitedTool)) {
        throw new Error(
          `Consequential action ${prohibitedTool} must not be exposed through MCP.`,
        );
      }
    }

    for (const tool of tools) {
      if (
        !expectedReadTools.includes(
          tool.name as (typeof expectedReadTools)[number],
        )
      ) {
        throw new Error(`Unexpected MCP capability discovered: ${tool.name}.`);
      }

      if (tool.annotations?.readOnlyHint !== true) {
        throw new Error(`${tool.name} must declare readOnlyHint=true.`);
      }

      if (tool.annotations?.destructiveHint !== false) {
        throw new Error(`${tool.name} must declare destructiveHint=false.`);
      }

      if (tool.annotations?.idempotentHint !== true) {
        throw new Error(`${tool.name} must declare idempotentHint=true.`);
      }
    }

    console.log("\nMCP least-privilege surface validated.");

    for (const toolName of expectedReadTools) {
      const result = await client.callTool({
        name: toolName,

        arguments: {
          orderId: "ORD-1001",
        },
      });

      if (result.isError) {
        throw new Error(`${toolName} unexpectedly returned an MCP error.`);
      }

      console.log(`${toolName}: OK`);
    }

    const missingOrderResult = await client.callTool({
      name: "get_order",

      arguments: {
        orderId: "ORD-DOES-NOT-EXIST",
      },
    });

    console.log("\nMissing order result:");

    console.dir(missingOrderResult, {
      depth: null,
    });

    if (!missingOrderResult.isError) {
      throw new Error("Missing order should produce an MCP error result.");
    }

    const invalidArgumentsResult = await client.callTool({
      name: "get_order",
      arguments: {},
    });

    console.log("\nInvalid arguments result:");

    console.dir(invalidArgumentsResult, {
      depth: null,
    });

    if (!invalidArgumentsResult.isError) {
      throw new Error("Invalid MCP arguments should be rejected.");
    }

    console.log("\nMCP read-only capability smoke passed");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
