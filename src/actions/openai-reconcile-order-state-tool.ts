import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import type { ActionExecutionRepository } from "./action-execution-repository.js";
import { createReconcileOrderStateActionTool } from "./reconcile-order-state.action-tool.js";

export const ModelReconcileOrderStateInputSchema = z.object({
  reason: z.string().min(1),
});

export type ModelReconcileOrderStateInput = z.infer<
  typeof ModelReconcileOrderStateInputSchema
>;

export function createOpenAIReconcileOrderStateTool(args: {
  orderId: string;

  runId: string;

  repository: ActionExecutionRepository;

  auditStore: ActionExecutionAuditStore;
}) {
  const actionTool = createReconcileOrderStateActionTool({
    repository: args.repository,

    auditStore: args.auditStore,

    initiatedBy: {
      type: "AGENT",

      id: args.runId,
    },
  });

  const definition = zodResponsesFunction({
    name: actionTool.name,

    description:
      "Safely reconcile the scoped order from PROCESSING to FULFILLED when deterministic payment, fulfillment, entitlement, and delivery invariants still hold. The order being modified is fixed by the execution runtime.",

    parameters: ModelReconcileOrderStateInputSchema,
  });

  return {
    definition,

    async execute(input: ModelReconcileOrderStateInput) {
      const parsed = ModelReconcileOrderStateInputSchema.parse(input);

      return actionTool.execute({
        orderId: args.orderId,

        reason: parsed.reason,
      });
    },
  };
}
