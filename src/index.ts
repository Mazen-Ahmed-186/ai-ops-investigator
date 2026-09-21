import { runAgentInvestigation } from "./ai/run-agent-investigation.js";
import { runAgenticRemediation } from "./ai/run-agentic-remediation.js";
import { runRemediationRecommendation } from "./ai/run-remediation-recommendation.js";
import { InMemoryTelemetrySink } from "./observability/in-memory-telemetry.js";
import { summarizeInvestigationTelemetry } from "./observability/summarize-investigation-telemetry.js";

async function main() {
  const telemetry = new InMemoryTelemetrySink();

  const investigation = await runAgentInvestigation("ORD-1001", {
    telemetry,
  });

  console.log("Investigation result:");

  console.dir(investigation, {
    depth: null,
  });

  console.log("Investigation telemetry:");

  console.dir(telemetry.getEvents(), {
    depth: null,
  });

  console.log("Investigation telemetry summary:");

  console.dir(summarizeInvestigationTelemetry(telemetry.getEvents()), {
    depth: null,
  });

  if (investigation.status !== "COMPLETED") {
    return;
  }

  const deterministicRemediation = await runRemediationRecommendation(
    investigation.assessment,
  );

  console.log("Deterministic remediation:");

  console.dir(deterministicRemediation, {
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
