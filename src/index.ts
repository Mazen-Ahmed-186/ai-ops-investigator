import { runAgentInvestigation } from "./ai/run-agent-investigation.js";

async function main() {
  const result = await runAgentInvestigation("ORD-1001");

  console.log("Investigation result:");

  console.dir(result, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
