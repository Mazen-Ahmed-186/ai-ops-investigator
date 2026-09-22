import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import type { ApprovalStore } from "./approval-store.js";
import { createFulfillmentAttemptActionTool } from "./create-fulfillment-attempt.action-tool.js";
import type { FulfillmentActionExecutionRepository } from "./fulfillment-action-execution-repository.js";

export const ModelCreateFulfillmentAttemptInputSchema = z.object({});

export type ModelCreateFulfillmentAttemptInput = z.infer<
  typeof ModelCreateFulfillmentAttemptInputSchema
>;

export function createOpenAICreateFulfillmentAttemptTool(args: {
  orderId: string;

  reason: string;

  approvalId?: string;

  runId: string;

  approvalStore: ApprovalStore;

  repository: FulfillmentActionExecutionRepository;

  auditStore: ActionExecutionAuditStore;
}) {
  const actionTool = createFulfillmentAttemptActionTool({
    orderId: args.orderId,

    reason: args.reason,

    approvalStore: args.approvalStore,

    repository: args.repository,

    auditStore: args.auditStore,

    initiatedBy: {
      type: "AGENT",

      id: args.runId,
    },

    ...(args.approvalId
      ? {
          approvalId: args.approvalId,
        }
      : {}),
  });

  const definition = zodResponsesFunction({
    name: actionTool.name,
    description:
      "Create one new fulfillment attempt for the runtime-scoped order. The target order, exact action reason, approval reference, and initiating identity are fixed by the execution runtime and cannot be supplied or changed by the model.",
    parameters: ModelCreateFulfillmentAttemptInputSchema,
  });

  return {
    definition,

    execute(input: ModelCreateFulfillmentAttemptInput) {
      const parsed = ModelCreateFulfillmentAttemptInputSchema.parse(input);

      return actionTool.execute(parsed);
    },
  };
}
