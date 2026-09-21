import type { RemediationRecommendation } from "./remediation-schema.js";

type RetrievedRunbook = {
  id: string;
};

export function validateRemediationGrounding(
  recommendation: RemediationRecommendation,
  retrievedRunbooks: RetrievedRunbook[],
) {
  const allowedRunbookIds = new Set(
    retrievedRunbooks.map((runbook) => runbook.id),
  );

  for (const action of recommendation.actions) {
    for (const runbookId of action.supportedByRunbookIds) {
      if (!allowedRunbookIds.has(runbookId)) {
        throw new Error(
          `Remediation action referenced unretrieved runbook ${runbookId}.`,
        );
      }
    }
  }

  if (
    recommendation.status === "NO_APPLICABLE_RUNBOOK" &&
    recommendation.actions.length > 0
  ) {
    throw new Error(
      "NO_APPLICABLE_RUNBOOK cannot contain remediation actions.",
    );
  }
}
