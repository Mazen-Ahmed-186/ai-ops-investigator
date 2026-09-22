import type { IncidentAssessment } from "../ai/schemas.js";
import type { InvestigationStore } from "../investigations/store.js";
import type {
  RemediationPlanner,
  RemediationPlannerResult,
} from "./durable-remediation-runner.js";

export type RemediationGenerator = (args: {
  orderId: string;
  investigationRunId: string;
  assessment: IncidentAssessment;
}) => Promise<RemediationPlannerResult>;

export function createInvestigationBackedRemediationPlanner(args: {
  investigationStore: InvestigationStore;
  generate: RemediationGenerator;
}): RemediationPlanner {
  return async ({ orderId, investigationRunId }) => {
    const investigation = await args.investigationStore.get(investigationRunId);

    if (!investigation) {
      throw new Error(`Investigation ${investigationRunId} was not found.`);
    }

    if (investigation.orderId !== orderId) {
      throw new Error(
        `Investigation ${investigation.id} belongs to order ${investigation.orderId}, not ${orderId}.`,
      );
    }

    if (investigation.status !== "COMPLETED") {
      throw new Error(`Investigation ${investigation.id} is not completed.`);
    }

    if (!investigation.assessment) {
      throw new Error(
        `Investigation ${investigation.id} is completed without an assessment.`,
      );
    }

    if (investigation.assessment.diagnosisStatus !== "DIAGNOSIS_READY") {
      throw new Error(
        `Investigation ${investigation.id} does not have a remediation-ready diagnosis.`,
      );
    }

    if (investigation.assessment.requiresMoreEvidence) {
      throw new Error(
        `Investigation ${investigation.id} still requires more evidence.`,
      );
    }

    return args.generate({
      orderId,
      investigationRunId,
      assessment: investigation.assessment,
    });
  };
}
