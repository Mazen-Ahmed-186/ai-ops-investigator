import { approvalMatchesAction } from "../actions/approval-matches-action.js";
import { expireApproval } from "../actions/approval-lifecycle.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import { evaluateActionPolicy } from "../actions/policy.js";
import type { AgentActionRequest } from "../actions/types.js";
import type { RemediationStore } from "../remediations/store.js";
import type { AutomationStore } from "./automation-store.js";
import { derivePrimaryAction } from "./derive-primary-action.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

export type AutomationApprovalResumeResult =
  | {
      status: "WAITING_FOR_APPROVAL";
      run: AutomationRun;
      approvalId: string;
      reason: string;
    }
  | {
      status: "EXECUTION_READY";
      run: AutomationRun;
      approvalId: string;
      action: AgentActionRequest;
    }
  | {
      status: "ESCALATED";
      run: AutomationRun;
      approvalId: string;
      reason: string;
    };

export async function resumeAutomationAfterApproval(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  approvalStore: ApprovalStore;
  now?: () => Date;
}): Promise<AutomationApprovalResumeResult> {
  const now = args.now ?? (() => new Date());

  let run = await args.automationStore.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  if (run.status !== "WAITING_FOR_APPROVAL") {
    throw new Error(
      `Automation ${run.id} cannot resume approval from status ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(`Automation ${run.id} has no investigation run id.`);
  }

  if (!run.remediationRunId) {
    throw new Error(`Automation ${run.id} has no remediation run id.`);
  }

  if (!run.approvalId) {
    throw new Error(`Automation ${run.id} has no approval id.`);
  }

  const approvalId = run.approvalId;

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

  const derivation = derivePrimaryAction(remediation);

  if (derivation.status === "ESCALATE") {
    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      approvalId,
      reason: derivation.reason,
    };
  }

  const action = derivation.action;

  const policy = evaluateActionPolicy(action);

  if (policy.decision !== "REQUIRE_APPROVAL") {
    const reason = `Automation ${run.id} is waiting for approval, but action ${action.kind} no longer requires approval.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      approvalId,
      reason,
    };
  }

  const storedApproval = await args.approvalStore.get(approvalId);

  if (!storedApproval) {
    const reason = `Approval ${approvalId} was not found.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      approvalId,
      reason,
    };
  }

  if (!approvalMatchesAction(storedApproval, action)) {
    const reason = `Approval ${approvalId} does not match the derived automation action.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      approvalId,
      reason,
    };
  }

  const approval = expireApproval(storedApproval, now());

  if (approval.status !== storedApproval.status) {
    await args.approvalStore.save(approval);
  }

  switch (approval.status) {
    case "PENDING":
      return {
        status: "WAITING_FOR_APPROVAL",

        run,

        approvalId,

        reason: "Approval is still pending.",
      };

    case "APPROVED":
      run = transitionAutomationRun(run, "EXECUTING", now());

      await args.automationStore.save(run);

      return {
        status: "EXECUTION_READY",

        run,

        approvalId,

        action,
      };

    case "REJECTED": {
      const reason = "The requested action was explicitly rejected.";

      run = transitionAutomationRun(run, "ESCALATED", now());

      await args.automationStore.save(run);

      return {
        status: "ESCALATED",
        run,
        approvalId,
        reason,
      };
    }

    case "EXPIRED": {
      const reason = "The approval expired before the automation resumed.";

      run = transitionAutomationRun(run, "ESCALATED", now());

      await args.automationStore.save(run);

      return {
        status: "ESCALATED",
        run,
        approvalId,
        reason,
      };
    }

    case "CONSUMED": {
      const reason =
        "The approval has already been consumed by another execution attempt.";

      run = transitionAutomationRun(run, "ESCALATED", now());

      await args.automationStore.save(run);

      return {
        status: "ESCALATED",
        run,
        approvalId,
        reason,
      };
    }
  }
}
