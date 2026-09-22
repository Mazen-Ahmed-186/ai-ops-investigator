import { createRemediationRun } from "../remediations/create-remediation-run.js";
import type { RemediationStore } from "../remediations/store.js";
import type { RemediationRun } from "../remediations/types.js";
import type { AutomationRemediationRunner } from "./remediation-runner.js";

type RemediationRecommendation = NonNullable<RemediationRun["recommendation"]>;

export type RemediationPlannerResult = {
  recommendation: RemediationRecommendation;

  retrievedRunbookIds: string[];
};

export type RemediationPlanner = (args: {
  orderId: string;

  investigationRunId: string;
}) => Promise<RemediationPlannerResult>;

export function createDurableRemediationRunner(args: {
  store: RemediationStore;

  planner: RemediationPlanner;

  now?: () => Date;
}): AutomationRemediationRunner {
  const now = args.now ?? (() => new Date());

  return {
    async run(request) {
      let run = await args.store.get(request.remediationRunId);

      if (run) {
        if (
          run.orderId !== request.orderId ||
          run.automationRunId !== request.automationRunId ||
          run.investigationRunId !== request.investigationRunId
        ) {
          throw new Error(
            `Remediation ${run.id} does not belong to the requested automation context.`,
          );
        }

        if (run.status === "COMPLETED") {
          return {
            status: "COMPLETED",

            remediationRunId: run.id,
          };
        }

        if (run.status === "FAILED") {
          throw new Error(run.failureReason ?? `Remediation ${run.id} failed.`);
        }
      } else {
        run = createRemediationRun({
          id: request.remediationRunId,

          orderId: request.orderId,

          automationRunId: request.automationRunId,

          investigationRunId: request.investigationRunId,

          now: now(),
        });

        await args.store.save(run);
      }

      try {
        const result = await args.planner({
          orderId: request.orderId,

          investigationRunId: request.investigationRunId,
        });

        run = {
          ...run,

          status: "COMPLETED",

          recommendation: result.recommendation,

          retrievedRunbookIds: Array.from(new Set(result.retrievedRunbookIds)),

          updatedAt: now().toISOString(),

          failureReason: null,
        };

        await args.store.save(run);

        return {
          status: "COMPLETED",

          remediationRunId: run.id,
        };
      } catch (error) {
        run = {
          ...run,

          status: "FAILED",

          updatedAt: now().toISOString(),

          failureReason:
            error instanceof Error
              ? error.message
              : "Unknown remediation planning failure.",
        };

        await args.store.save(run);

        throw error;
      }
    },
  };
}
