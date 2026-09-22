import { randomUUID } from "node:crypto";

import { z } from "zod";

export const ApprovalRequiredActionKindSchema = z.enum([
  "CREATE_FULFILLMENT_ATTEMPT",
  "ISSUE_REFUND",
]);

export type ApprovalRequiredActionKind = z.infer<
  typeof ApprovalRequiredActionKindSchema
>;

export const ApprovalActionSnapshotSchema = z.object({
  kind: ApprovalRequiredActionKindSchema,
  orderId: z.string().min(1),
  reason: z.string().min(1),
});

export type ApprovalActionSnapshot = z.infer<
  typeof ApprovalActionSnapshotSchema
>;

export const ApprovalStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ActionApprovalSchema = z.object({
  id: z.string().min(1),
  action: ApprovalActionSnapshotSchema,
  status: ApprovalStatusSchema,
  requestedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().min(1).nullable(),
});

export type ActionApproval = z.infer<typeof ActionApprovalSchema>;

export function createPendingApproval(args: {
  action: ApprovalActionSnapshot;
  now?: Date;
  ttlMs?: number;
  id?: string;
}): ActionApproval {
  const now = args.now ?? new Date();

  const ttlMs = args.ttlMs ?? 15 * 60 * 1000;

  return {
    id: args.id ?? `APR-${randomUUID()}`,
    action: args.action,
    status: "PENDING",
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };
}
