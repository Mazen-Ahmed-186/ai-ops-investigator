import { z } from "zod";

import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import type { ActionExecutionInitiator } from "./action-execution-audit.js";
import type { ActionExecutionRepository } from "./action-execution-repository.js";
import { executeAuditedReconcileOrderState } from "./execute-audited-reconcile-order-state.js";

export const ReconcileOrderStateActionInputSchema = z.object({
  orderId: z.string().min(1),

  reason: z.string().min(1),
});

export type ReconcileOrderStateActionInput = z.infer<
  typeof ReconcileOrderStateActionInputSchema
>;

export type ReconcileOrderStateActionOutput = {
  executionId: string;

  status:
    | "EXECUTED"
    | "NO_OP"
    | "NOT_FOUND"
    | "BLOCKED_BY_CURRENT_STATE"
    | "DENIED";

  reason: string | null;

  validationReasons: string[];
};

export type ReconcileOrderStateActionTool = {
  name: "reconcile_order_state";

  title: string;

  description: string;

  inputSchema: typeof ReconcileOrderStateActionInputSchema;

  annotations: {
    readOnly: false;
    destructive: false;
    idempotent: true;
  };

  execute(
    input: ReconcileOrderStateActionInput,
  ): Promise<ReconcileOrderStateActionOutput>;
};

export function createReconcileOrderStateActionTool(args: {
  repository: ActionExecutionRepository;

  auditStore: ActionExecutionAuditStore;

  initiatedBy: ActionExecutionInitiator;
}): ReconcileOrderStateActionTool {
  return {
    name: "reconcile_order_state",

    title: "Reconcile order state",

    description:
      "Safely reconcile a stale PROCESSING order to FULFILLED when payment, fulfillment, entitlement, and account-delivery invariants still hold.",

    inputSchema: ReconcileOrderStateActionInputSchema,

    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: true,
    },

    async execute(input) {
      const parsed = ReconcileOrderStateActionInputSchema.parse(input);

      const execution = await executeAuditedReconcileOrderState({
        action: {
          kind: "RECONCILE_ORDER_STATE",

          orderId: parsed.orderId,

          reason: parsed.reason,
        },

        repository: args.repository,

        auditStore: args.auditStore,

        initiatedBy: args.initiatedBy,
      });

      switch (execution.result.status) {
        case "EXECUTED":
          return {
            executionId: execution.executionId,

            status: "EXECUTED",

            reason: `Order transitioned from ${execution.result.previousStatus} to ${execution.result.currentStatus}.`,

            validationReasons: [],
          };

        case "NO_OP":
          return {
            executionId: execution.executionId,

            status: "NO_OP",

            reason: execution.result.reason,

            validationReasons: [],
          };

        case "NOT_FOUND":
          return {
            executionId: execution.executionId,

            status: "NOT_FOUND",

            reason: execution.result.reason,

            validationReasons: [],
          };

        case "DENIED":
          return {
            executionId: execution.executionId,

            status: "DENIED",

            reason: execution.result.reason,

            validationReasons: [],
          };

        case "BLOCKED_BY_CURRENT_STATE":
          return {
            executionId: execution.executionId,

            status: "BLOCKED_BY_CURRENT_STATE",

            reason: execution.result.reason,

            validationReasons: execution.result.validationReasons,
          };
      }
    },
  };
}
