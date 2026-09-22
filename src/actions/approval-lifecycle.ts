import type { ActionApproval } from "./approval.js";

export function isApprovalExpired(approval: ActionApproval, now = new Date()) {
  return now.getTime() >= new Date(approval.expiresAt).getTime();
}

export function expireApproval(
  approval: ActionApproval,
  now = new Date(),
): ActionApproval {
  if (approval.status !== "PENDING" && approval.status !== "APPROVED") {
    return approval;
  }

  if (!isApprovalExpired(approval, now)) {
    return approval;
  }

  return {
    ...approval,
    status: "EXPIRED",
    resolvedAt: approval.resolvedAt ?? now.toISOString(),
  };
}

export function decideApproval(args: {
  approval: ActionApproval;
  decision: "APPROVE" | "REJECT";
  decidedBy: string;
  now?: Date;
}): ActionApproval {
  const now = args.now ?? new Date();

  const effectiveApproval = expireApproval(args.approval, now);

  if (effectiveApproval.status === "EXPIRED") {
    throw new Error(`Approval ${effectiveApproval.id} has expired.`);
  }

  if (effectiveApproval.status !== "PENDING") {
    throw new Error(
      `Approval ${effectiveApproval.id} cannot be decided from status ${effectiveApproval.status}.`,
    );
  }

  return {
    ...effectiveApproval,
    status: args.decision === "APPROVE" ? "APPROVED" : "REJECTED",
    resolvedAt: now.toISOString(),
    resolvedBy: args.decidedBy,
  };
}

export function consumeApproval(args: {
  approval: ActionApproval;

  executionId: string;

  now?: Date;
}): ActionApproval {
  const now = args.now ?? new Date();

  const effectiveApproval = expireApproval(args.approval, now);

  if (effectiveApproval.status === "EXPIRED") {
    throw new Error(`Approval ${effectiveApproval.id} has expired.`);
  }

  if (effectiveApproval.status !== "APPROVED") {
    throw new Error(
      `Approval ${effectiveApproval.id} cannot be consumed from status ${effectiveApproval.status}.`,
    );
  }

  return {
    ...effectiveApproval,
    status: "CONSUMED",
    consumedAt: now.toISOString(),
    consumedByExecutionId: args.executionId,
  };
}
