import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ActionExecutionRepository } from "../actions/action-execution-repository.js";
import { executeAuditedReconcileOrderState } from "../actions/execute-audited-reconcile-order-state.js";
import type { ReconcileOrderStateAction } from "../actions/execute-reconcile-order-state.js";
import type { RemediationStore } from "../remediations/store.js";
import type { AutomationStore } from "./automation-store.js";
import { derivePrimaryAction } from "./derive-primary-action.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

type AuditedReconcileExecutor = typeof executeAuditedReconcileOrderState;

export type AutomationActionExecutionResult =
  | {
      status: "VERIFYING";
      run: AutomationRun;
      executionId: string;
    }
  | {
      status: "ESCALATED";
      run: AutomationRun;
      reason: string;
      executionId: string | null;
    };

export async function executeAutomationAction(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  repository: ActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  executeReconcile?: AuditedReconcileExecutor;
  now?: () => Date;
}): Promise<AutomationActionExecutionResult> {
  const now = args.now ?? (() => new Date());

  const executeReconcile =
    args.executeReconcile ?? executeAuditedReconcileOrderState;

  let run = await args.automationStore.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  if (run.status !== "EXECUTING") {
    throw new Error(
      `Automation ${run.id} cannot execute an action from status ${run.status}.`,
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

  const derivation = derivePrimaryAction(remediation);

  if (derivation.status === "ESCALATE") {
    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",

      run,

      reason: derivation.reason,

      executionId: null,
    };
  }

  const action = derivation.action;

  if (action.kind !== "RECONCILE_ORDER_STATE") {
    const reason = `Automation execution does not support action ${action.kind}.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",

      run,

      reason,

      executionId: null,
    };
  }

  const reconcileAction: ReconcileOrderStateAction = {
    ...action,

    kind: "RECONCILE_ORDER_STATE",
  };

  try {
    const execution = await executeReconcile({
      action: reconcileAction,

      repository: args.repository,

      auditStore: args.auditStore,

      initiatedBy: {
        type: "SYSTEM",

        id: run.id,
      },
    });

    run = {
      ...run,

      actionExecutionId: execution.executionId,
    };

    switch (execution.result.status) {
      case "EXECUTED":
      case "NO_OP":
        run = transitionAutomationRun(run, "VERIFYING", now());

        await args.automationStore.save(run);

        return {
          status: "VERIFYING",

          run,

          executionId: execution.executionId,
        };

      case "NOT_FOUND":
      case "DENIED":
      case "BLOCKED_BY_CURRENT_STATE":
        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason: execution.result.reason,

          executionId: execution.executionId,
        };
    }
  } catch (error) {
    run = {
      ...run,

      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown automation action execution failure.",
    };

    run = transitionAutomationRun(run, "FAILED", now());

    await args.automationStore.save(run);

    throw error;
  }
}
