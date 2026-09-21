import { runAgentInvestigation } from "./ai/run-agent-investigation.js";
import { runRemediationRecommendation } from "./ai/run-remediation-recommendation.js";

async function main() {
  const investigation = await runAgentInvestigation("ORD-1001");

  console.log("Investigation result:");

  console.dir(investigation, {
    depth: null,
  });

  if (investigation.status !== "COMPLETED") {
    return;
  }

  const remediation = await runRemediationRecommendation(
    investigation.assessment,
  );

  console.log("Retrieved runbooks:");

  console.dir(remediation.retrievedRunbooks, {
    depth: null,
  });

  console.log("Remediation recommendation:");

  console.dir(remediation.recommendation, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
