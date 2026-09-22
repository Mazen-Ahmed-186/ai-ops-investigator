import { randomUUID } from "node:crypto";

import { z } from "zod";

export const AuditedAgentActionSchema = z.object({
  kind: z.enum([
    "RECONCILE_ORDER_STATE",
    "RETRY_NOTIFICATION",
    "CREATE_FULFILLMENT_ATTEMPT",
    "ISSUE_REFUND",
    "CANCEL_ORDER",
  ]),

  orderId: z.string().min(1),

  reason: z.string().min(1),
});

export const ActionExecutionInitiatorSchema = z.object({
  type: z.enum(["AGENT", "HUMAN", "SYSTEM"]),

  id: z.string().min(1),
});

export type ActionExecutionInitiator = z.infer<
  typeof ActionExecutionInitiatorSchema
>;

export const ActionExecutionAuditStatusSchema = z.enum([
  "STARTED",
  "EXECUTED",
  "NO_OP",
  "BLOCKED_BY_CURRENT_STATE",
  "DENIED",
  "NOT_FOUND",
  "FAILED",
]);

export type ActionExecutionAuditStatus = z.infer<
  typeof ActionExecutionAuditStatusSchema
>;

export const ActionExecutionAuditRecordSchema = z.object({
  id: z.string().min(1),

  action: AuditedAgentActionSchema,

  initiatedBy: ActionExecutionInitiatorSchema,

  approvalId: z.string().min(1).nullable(),

  status: ActionExecutionAuditStatusSchema,

  startedAt: z.string().datetime(),

  completedAt: z.string().datetime().nullable(),

  reason: z.string().nullable(),

  validationReasons: z.array(z.string()),

  error: z.string().nullable(),
});

export type ActionExecutionAuditRecord = z.infer<
  typeof ActionExecutionAuditRecordSchema
>;

export function createStartedActionExecutionAudit(args: {
  action: z.infer<typeof AuditedAgentActionSchema>;

  initiatedBy: ActionExecutionInitiator;

  approvalId?: string;

  now?: Date;

  id?: string;
}): ActionExecutionAuditRecord {
  const now = args.now ?? new Date();

  return {
    id: args.id ?? `ACT-${randomUUID()}`,

    action: args.action,

    initiatedBy: args.initiatedBy,

    approvalId: args.approvalId ?? null,

    status: "STARTED",

    startedAt: now.toISOString(),

    completedAt: null,

    reason: null,

    validationReasons: [],

    error: null,
  };
}
