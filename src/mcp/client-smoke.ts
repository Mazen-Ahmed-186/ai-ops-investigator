import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

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
        inputSchema: tool.inputSchema,
      })),
    );

    const result = await client.callTool({
      name: "get_order",
      arguments: {
        orderId: "ORD-1001",
      },
    });

    console.log("get_order result:");

    console.dir(result, {
      depth: null,
    });

    const missingOrderResult = await client.callTool({
      name: "get_order",
      arguments: {
        orderId: "ORD-DOES-NOT-EXIST",
      },
    });

    console.log("Missing order result:");

    console.dir(missingOrderResult, {
      depth: null,
    });

    const invalidArgumentsResult = await client.callTool({
      name: "get_order",
      arguments: {},
    });

    console.log("Invalid arguments result:");

    console.dir(invalidArgumentsResult, {
      depth: null,
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
