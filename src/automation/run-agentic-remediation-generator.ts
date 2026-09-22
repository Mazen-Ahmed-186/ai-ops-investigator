import { runAgenticRemediation } from "../ai/run-agentic-remediation.js";
import type { RemediationGenerator } from "./investigation-backed-remediation-planner.js";

export type RunAgenticRemediation = typeof runAgenticRemediation;

export function createAgenticRemediationGenerator(
  runRemediation: RunAgenticRemediation = runAgenticRemediation,
): RemediationGenerator {
  return async ({ assessment }) => {
    const result = await runRemediation(assessment);

    return {
      recommendation: result.recommendation,

      retrievedRunbookIds: result.retrievedRunbooks.map(
        (runbook) => runbook.id,
      ),
    };
  };
}
