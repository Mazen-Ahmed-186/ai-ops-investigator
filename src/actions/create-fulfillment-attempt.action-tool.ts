import { z } from "zod";

import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";
import type { ActionExecutionInitiator } from "./action-execution-audit.js";
import type { ApprovalStore } from "./approval-store.js";
import { executeAuditedCreateFulfillmentAttempt } from "./execute-audited-create-fulfillment-attempt.js";
import type { FulfillmentActionExecutionRepository } from "./fulfillment-action-execution-repository.js";

export const CreateFulfillmentAttemptActionInputSchema = z.object({});

export type CreateFulfillmentAttemptActionInput = z.infer<
  typeof CreateFulfillmentAttemptActionInputSchema
>;

export type CreateFulfillmentAttemptActionOutput =
  | {
      executionId: string;
      status: "EXECUTED";
      attemptId: string;
      attemptStatus: "PENDING";
    }
  | {
      executionId: string;
      status:
        | "PENDING_APPROVAL"
        | "APPROVAL_REJECTED"
        | "APPROVAL_EXPIRED"
        | "APPROVAL_CONSUMED"
        | "DENIED"
        | "NOT_FOUND";

      reason: string;
    }
  | {
      executionId: string;
      status: "BLOCKED_BY_CURRENT_STATE";
      reason: string;
      validationReasons: string[];
    };

export function createFulfillmentAttemptActionTool(args: {
  orderId: string;
  reason: string;
  approvalId?: string;
  approvalStore: ApprovalStore;
  repository: FulfillmentActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  initiatedBy: ActionExecutionInitiator;
}) {
  return {
    name: "create_fulfillment_attempt" as const,
    title: "Create fulfillment attempt",
    description:
      "Create another fulfillment attempt for the scoped order only when a matching persisted approval exists and current execution invariants remain safe.",
    inputSchema: CreateFulfillmentAttemptActionInputSchema,
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
    },

    async execute(
      input: CreateFulfillmentAttemptActionInput,
    ): Promise<CreateFulfillmentAttemptActionOutput> {
      CreateFulfillmentAttemptActionInputSchema.parse(input);

      const execution = await executeAuditedCreateFulfillmentAttempt({
        action: {
          kind: "CREATE_FULFILLMENT_ATTEMPT",
          orderId: args.orderId,
          reason: args.reason,
        },

        approvalStore: args.approvalStore,
        repository: args.repository,
        auditStore: args.auditStore,
        initiatedBy: args.initiatedBy,

        ...(args.approvalId
          ? {
              approvalId: args.approvalId,
            }
          : {}),
      });

      switch (execution.result.status) {
        case "EXECUTED":
          return {
            executionId: execution.executionId,
            status: "EXECUTED",
            attemptId: execution.result.attemptId,
            attemptStatus: execution.result.attemptStatus,
          };

        case "BLOCKED_BY_CURRENT_STATE":
          return {
            executionId: execution.executionId,
            status: "BLOCKED_BY_CURRENT_STATE",
            reason: execution.result.reason,
            validationReasons: execution.result.validationReasons,
          };

        default:
          return {
            executionId: execution.executionId,
            status: execution.result.status,
            reason: execution.result.reason,
          };
      }
    },
  };
}
