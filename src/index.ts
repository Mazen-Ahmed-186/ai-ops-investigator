import { runAgentInvestigation } from "./ai/run-agent-investigation.js";
import { runRemediationRecommendation } from "./ai/run-remediation-recommendation.js";
import { runAgenticRemediation } from "./ai/run-agentic-remediation.js";

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

  const agenticRemediation = await runAgenticRemediation(
    investigation.assessment,
  );

  console.log("Agentic remediation:");

  console.dir(agenticRemediation, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
