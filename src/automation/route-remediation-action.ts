import {
  ApprovalRequiredActionKindSchema,
  createPendingApproval,
  type ActionApproval,
  type ApprovalActionSnapshot,
} from "../actions/approval.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import { evaluateActionPolicy } from "../actions/policy.js";
import type { AgentActionRequest } from "../actions/types.js";
import type { RemediationStore } from "../remediations/store.js";
import type { RemediationRun } from "../remediations/types.js";
import type { AutomationStore } from "./automation-store.js";
import {
  derivePrimaryAction,
  type PrimaryActionDerivationResult,
} from "./derive-primary-action.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

type ActionDeriver = (
  remediation: RemediationRun,
) => PrimaryActionDerivationResult;

export type AutomationActionRoutingResult =
  | {
      status: "EXECUTION_READY";
      run: AutomationRun;
      action: AgentActionRequest;
      reason: string;
    }
  | {
      status: "WAITING_FOR_APPROVAL";
      run: AutomationRun;
      action: AgentActionRequest;
      approvalId: string;
      reason: string;
    }
  | {
      status: "ESCALATED";
      run: AutomationRun;
      reason: string;
    };

export function createAutomationApprovalId(automationRunId: string) {
  return `APR-${automationRunId}`;
}

function approvalMatchesAction(
  approval: ActionApproval,
  action: ApprovalActionSnapshot,
) {
  return (
    approval.action.kind === action.kind &&
    approval.action.orderId === action.orderId &&
    approval.action.reason === action.reason
  );
}

export async function routeAutomationRemediationAction(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  approvalStore: ApprovalStore;
  deriveAction?: ActionDeriver;
  now?: () => Date;
}): Promise<AutomationActionRoutingResult> {
  const now = args.now ?? (() => new Date());

  const deriveAction = args.deriveAction ?? derivePrimaryAction;

  let run = await args.automationStore.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  if (run.status !== "PLANNING_REMEDIATION") {
    throw new Error(
      `Automation ${run.id} cannot route remediation from status ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(`Automation ${run.id} has no investigation run id.`);
  }

  if (!run.remediationRunId) {
    throw new Error(`Automation ${run.id} has no remediation run id.`);
  }

  const remediation = await args.remediationStore.get(run.remediationRunId);

  if (!remediation) {
    throw new Error(`Remediation ${run.remediationRunId} was not found.`);
  }

  if (
    remediation.automationRunId !== run.id ||
    remediation.orderId !== run.orderId ||
    remediation.investigationRunId !== run.investigationRunId
  ) {
    throw new Error(
      `Remediation ${remediation.id} does not belong to automation ${run.id}.`,
    );
  }

  const derivation = deriveAction(remediation);

  if (derivation.status === "ESCALATE") {
    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      reason: derivation.reason,
    };
  }

  const action = derivation.action;

  const policy = evaluateActionPolicy(action);

  if (policy.decision === "DENY") {
    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      reason: policy.reason,
    };
  }

  if (policy.decision === "ALLOW") {
    run = transitionAutomationRun(run, "EXECUTING", now());

    await args.automationStore.save(run);

    return {
      status: "EXECUTION_READY",

      run,

      action,

      reason: policy.reason,
    };
  }

  const approvalKind = ApprovalRequiredActionKindSchema.safeParse(action.kind);

  if (!approvalKind.success) {
    throw new Error(
      `Policy requires approval for unsupported approval action kind ${action.kind}.`,
    );
  }

  const approvalAction: ApprovalActionSnapshot = {
    kind: approvalKind.data,

    orderId: action.orderId,

    reason: action.reason,
  };

  const approvalId = run.approvalId ?? createAutomationApprovalId(run.id);

  const existingApproval = await args.approvalStore.get(approvalId);

  if (existingApproval) {
    if (!approvalMatchesAction(existingApproval, approvalAction)) {
      throw new Error(
        `Approval ${approvalId} does not match the derived automation action.`,
      );
    }
  } else {
    const approval = createPendingApproval({
      id: approvalId,

      action: approvalAction,

      now: now(),
    });

    await args.approvalStore.save(approval);
  }

  run = {
    ...run,

    approvalId,
  };

  run = transitionAutomationRun(run, "WAITING_FOR_APPROVAL", now());

  await args.automationStore.save(run);

  return {
    status: "WAITING_FOR_APPROVAL",

    run,

    action,

    approvalId,

    reason: policy.reason,
  };
}
