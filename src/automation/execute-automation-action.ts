import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ActionExecutionRepository } from "../actions/action-execution-repository.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import { executeAuditedCreateFulfillmentAttempt } from "../actions/execute-audited-create-fulfillment-attempt.js";
import { executeAuditedReconcileOrderState } from "../actions/execute-audited-reconcile-order-state.js";
import { executeAuditedRetryNotification } from "../actions/execute-audited-retry-notification.js";
import type { CreateFulfillmentAttemptAction } from "../actions/execute-create-fulfillment-attempt.js";
import type { ReconcileOrderStateAction } from "../actions/execute-reconcile-order-state.js";
import type { RetryNotificationAction } from "../actions/execute-retry-notification.js";
import type { FulfillmentActionExecutionRepository } from "../actions/fulfillment-action-execution-repository.js";
import type { NotificationActionExecutionRepository } from "../actions/notification-action-execution-repository.js";
import type { RemediationStore } from "../remediations/store.js";
import type { AutomationStore } from "./automation-store.js";
import { derivePrimaryAction } from "./derive-primary-action.js";
import { recoverConsumedFulfillmentExecution } from "./recover-consumed-fulfillment-execution.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

type AuditedReconcileExecutor = typeof executeAuditedReconcileOrderState;

type AuditedCreateFulfillmentAttemptExecutor =
  typeof executeAuditedCreateFulfillmentAttempt;

type AuditedRetryNotificationExecutor = typeof executeAuditedRetryNotification;

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

function supportsFulfillmentAttemptCreation(
  repository: ActionExecutionRepository,
): repository is FulfillmentActionExecutionRepository {
  const candidate = repository as Partial<FulfillmentActionExecutionRepository>;

  return typeof candidate.createFulfillmentAttempt === "function";
}

function supportsNotificationRetry(
  repository: ActionExecutionRepository,
): repository is NotificationActionExecutionRepository {
  const candidate =
    repository as Partial<NotificationActionExecutionRepository>;

  return typeof candidate.retryNotification === "function";
}

function actionMatchesRetryNotification(args: {
  audit: {
    action: {
      kind: string;
      orderId: string;
      reason: string;
    };

    initiatedBy: {
      type: string;
      id: string;
    };

    approvalId: string | null;
  };

  automationRunId: string;

  action: RetryNotificationAction;
}) {
  return (
    args.audit.action.kind === args.action.kind &&
    args.audit.action.orderId === args.action.orderId &&
    args.audit.action.reason === args.action.reason &&
    args.audit.initiatedBy.type === "SYSTEM" &&
    args.audit.initiatedBy.id === args.automationRunId &&
    args.audit.approvalId === null
  );
}

export async function executeAutomationAction(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  repository: ActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  approvalStore?: ApprovalStore;
  executeReconcile?: AuditedReconcileExecutor;
  executeCreateFulfillmentAttempt?: AuditedCreateFulfillmentAttemptExecutor;
  executeRetryNotification?: AuditedRetryNotificationExecutor;
  now?: () => Date;
}): Promise<AutomationActionExecutionResult> {
  const now = args.now ?? (() => new Date());

  const executeReconcile =
    args.executeReconcile ?? executeAuditedReconcileOrderState;

  const executeCreateFulfillmentAttempt =
    args.executeCreateFulfillmentAttempt ??
    executeAuditedCreateFulfillmentAttempt;

  const executeRetryNotification =
    args.executeRetryNotification ?? executeAuditedRetryNotification;

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

  try {
    if (action.kind === "RECONCILE_ORDER_STATE") {
      const reconcileAction: ReconcileOrderStateAction = {
        ...action,
        kind: "RECONCILE_ORDER_STATE",
      };

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
    }

    if (action.kind === "RETRY_NOTIFICATION") {
      if (!supportsNotificationRetry(args.repository)) {
        throw new Error(
          "The configured action repository does not support notification retries.",
        );
      }

      const retryNotificationAction: RetryNotificationAction = {
        ...action,
        kind: "RETRY_NOTIFICATION",
      };

      const automationRunId = run.id;

      const notificationAudits = await args.auditStore.listByOrderId(
        run.orderId,
      );

      const matchingNotificationAudits = notificationAudits.filter((audit) =>
        actionMatchesRetryNotification({
          audit,
          automationRunId,
          action: retryNotificationAction,
        }),
      );

      const recoveredNotificationExecutions = matchingNotificationAudits.filter(
        (audit) =>
          audit.status === "EXECUTED" &&
          audit.effect?.kind === "NOTIFICATION_RETRY_CREATED" &&
          typeof audit.effect.notificationId === "string" &&
          audit.effect.notificationId.length > 0,
      );

      const [recoveredNotificationExecution] = recoveredNotificationExecutions;

      if (
        recoveredNotificationExecutions.length === 1 &&
        recoveredNotificationExecution
      ) {
        run = {
          ...run,
          actionExecutionId: recoveredNotificationExecution.id,
        };

        run = transitionAutomationRun(run, "VERIFYING", now());

        await args.automationStore.save(run);

        return {
          status: "VERIFYING",
          run,
          executionId: recoveredNotificationExecution.id,
        };
      }

      if (recoveredNotificationExecutions.length > 1) {
        const reason =
          "Multiple executed notification retry audits were found for the same automation action.";

        run = {
          ...run,
          failureReason: reason,
        };

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",
          run,
          reason,
          executionId: null,
        };
      }

      const malformedExecutedNotificationAudit =
        matchingNotificationAudits.find(
          (audit) =>
            audit.status === "EXECUTED" &&
            (audit.effect?.kind !== "NOTIFICATION_RETRY_CREATED" ||
              typeof audit.effect.notificationId !== "string" ||
              audit.effect.notificationId.length === 0),
        );

      if (malformedExecutedNotificationAudit) {
        const reason =
          "Notification retry execution audit is missing a valid notification-retry effect and cannot be safely replayed.";

        run = {
          ...run,
          actionExecutionId: malformedExecutedNotificationAudit.id,
          failureReason: reason,
        };

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",
          run,
          reason,
          executionId: malformedExecutedNotificationAudit.id,
        };
      }

      const ambiguousNotificationExecution = matchingNotificationAudits.find(
        (audit) => audit.status === "STARTED",
      );

      if (ambiguousNotificationExecution) {
        const reason =
          "Notification retry execution is ambiguous and cannot be safely replayed.";

        run = {
          ...run,
          actionExecutionId: ambiguousNotificationExecution.id,
          failureReason: reason,
        };

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",
          run,
          reason,
          executionId: ambiguousNotificationExecution.id,
        };
      }

      const executionNow = now();

      const execution = await executeRetryNotification({
        action: retryNotificationAction,

        repository: args.repository,

        auditStore: args.auditStore,

        initiatedBy: {
          type: "SYSTEM",
          id: run.id,
        },

        now: executionNow,
      });

      run = {
        ...run,
        actionExecutionId: execution.executionId,
      };

      switch (execution.result.status) {
        case "EXECUTED":
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
    }

    if (action.kind === "CREATE_FULFILLMENT_ATTEMPT") {
      if (!run.approvalId) {
        throw new Error(
          `Automation ${run.id} reached fulfillment execution without an approval id.`,
        );
      }

      if (!args.approvalStore) {
        throw new Error("Fulfillment execution requires an approval store.");
      }

      if (!supportsFulfillmentAttemptCreation(args.repository)) {
        throw new Error(
          "The configured action repository does not support fulfillment-attempt creation.",
        );
      }

      const executionNow = now();

      const fulfillmentAction: CreateFulfillmentAttemptAction = {
        ...action,
        kind: "CREATE_FULFILLMENT_ATTEMPT",
      };

      const recovery = await recoverConsumedFulfillmentExecution({
        action: fulfillmentAction,

        approvalId: run.approvalId,

        approvalStore: args.approvalStore,

        auditStore: args.auditStore,
      });

      if (recovery.status === "RECOVERED_EXECUTION") {
        run = {
          ...run,
          actionExecutionId: recovery.executionId,
        };

        run = transitionAutomationRun(run, "VERIFYING", now());

        await args.automationStore.save(run);

        return {
          status: "VERIFYING",
          run,
          executionId: recovery.executionId,
        };
      }

      if (recovery.status === "ESCALATE") {
        run = {
          ...run,
          actionExecutionId: recovery.executionId,
        };

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",
          run,
          reason: recovery.reason,
          executionId: recovery.executionId,
        };
      }

      const execution = await executeCreateFulfillmentAttempt({
        action: fulfillmentAction,

        approvalId: run.approvalId,

        approvalStore: args.approvalStore,

        repository: args.repository,

        auditStore: args.auditStore,

        initiatedBy: {
          type: "SYSTEM",
          id: run.id,
        },

        now: executionNow,
      });

      run = {
        ...run,
        actionExecutionId: execution.executionId,
      };

      switch (execution.result.status) {
        case "EXECUTED":
          run = transitionAutomationRun(run, "VERIFYING", now());

          await args.automationStore.save(run);

          return {
            status: "VERIFYING",
            run,
            executionId: execution.executionId,
          };

        case "PENDING_APPROVAL":
        case "APPROVAL_REJECTED":
        case "APPROVAL_EXPIRED":
        case "APPROVAL_CONSUMED":
        case "DENIED":
        case "NOT_FOUND":
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
    }

    const reason = `Automation execution does not support action ${action.kind}.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",
      run,
      reason,
      executionId: null,
    };
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
