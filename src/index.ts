import { resumeAgentInvestigation } from "./ai/run-agent-investigation.js";

async function main() {
  const result = await resumeAgentInvestigation("RUN-RESUME-DEMO");

  console.dir(result, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
