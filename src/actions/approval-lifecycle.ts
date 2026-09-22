import type { ActionApproval } from "./approval.js";

export function isApprovalExpired(approval: ActionApproval, now = new Date()) {
  return now.getTime() >= new Date(approval.expiresAt).getTime();
}

export function expireApproval(
  approval: ActionApproval,
  now = new Date(),
): ActionApproval {
  if (approval.status !== "PENDING") {
    return approval;
  }

  if (!isApprovalExpired(approval, now)) {
    return approval;
  }

  return {
    ...approval,
    status: "EXPIRED",
    resolvedAt: now.toISOString(),
    resolvedBy: null,
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
