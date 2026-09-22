import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ActionExecutionRepository } from "../actions/action-execution-repository.js";
import type { ActionExecutionContext } from "../actions/execution-context.js";
import type { FulfillmentActionVerificationRepository } from "../actions/fulfillment-action-execution-repository.js";
import type { NotificationActionVerificationRepository } from "../actions/notification-action-execution-repository.js";
import type { AgentActionRequest } from "../actions/types.js";
import type { RemediationStore } from "../remediations/store.js";
import type { AutomationStore } from "./automation-store.js";
import { derivePrimaryAction } from "./derive-primary-action.js";
import { transitionAutomationRun } from "./state-machine.js";
import type { AutomationRun } from "./types.js";

export type AutomationVerificationResult =
  | {
      status: "COMPLETED";
      run: AutomationRun;
    }
  | {
      status: "ESCALATED";
      run: AutomationRun;
      reason: string;
      verificationReasons: string[];
    };

function verifyReconcilePostcondition(
  context: ActionExecutionContext,
): string[] {
  const reasons: string[] = [];

  if (context.orderStatus !== "FULFILLED") {
    reasons.push(
      `Expected order status FULFILLED, received ${context.orderStatus}.`,
    );
  }

  if (!context.paymentCaptured) {
    reasons.push("Payment is no longer confirmed as captured.");
  }

  if (!context.fulfillmentSucceeded) {
    reasons.push("Fulfillment is no longer confirmed as succeeded.");
  }

  if (!context.entitlementActive) {
    reasons.push("Entitlement is no longer confirmed as active.");
  }

  if (!context.accountDeliveryDelivered) {
    reasons.push("Account delivery is no longer confirmed as delivered.");
  }

  return reasons;
}

function auditActionMatches(
  auditAction: AgentActionRequest,
  action: AgentActionRequest,
) {
  return (
    auditAction.kind === action.kind &&
    auditAction.orderId === action.orderId &&
    auditAction.reason === action.reason
  );
}

function supportsFulfillmentVerification(
  repository: ActionExecutionRepository,
): repository is FulfillmentActionVerificationRepository {
  const candidate =
    repository as Partial<FulfillmentActionVerificationRepository>;

  return typeof candidate.getFulfillmentAttempt === "function";
}

function supportsNotificationVerification(
  repository: ActionExecutionRepository,
): repository is NotificationActionVerificationRepository {
  const candidate =
    repository as Partial<NotificationActionVerificationRepository>;

  return typeof candidate.getNotification === "function";
}

export async function verifyAutomationAction(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  repository: ActionExecutionRepository;
  auditStore?: ActionExecutionAuditStore;
  now?: () => Date;
}): Promise<AutomationVerificationResult> {
  const now = args.now ?? (() => new Date());

  let run = await args.automationStore.get(args.automationRunId);

  if (!run) {
    throw new Error(`Automation ${args.automationRunId} was not found.`);
  }

  if (run.status !== "VERIFYING") {
    throw new Error(
      `Automation ${run.id} cannot verify an action from status ${run.status}.`,
    );
  }

  if (!run.investigationRunId) {
    throw new Error(`Automation ${run.id} has no investigation run id.`);
  }

  if (!run.remediationRunId) {
    throw new Error(`Automation ${run.id} has no remediation run id.`);
  }

  if (!run.actionExecutionId) {
    throw new Error(`Automation ${run.id} has no action execution id.`);
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

      verificationReasons: [derivation.reason],
    };
  }

  const action = derivation.action;

  try {
    if (action.kind === "RECONCILE_ORDER_STATE") {
      const context = await args.repository.getExecutionContext(run.orderId);

      if (!context) {
        const reason = `Order ${run.orderId} was not found during verification.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      const verificationReasons = verifyReconcilePostcondition(context);

      if (verificationReasons.length > 0) {
        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason:
            "The executed action did not satisfy its required postcondition.",

          verificationReasons,
        };
      }

      run = transitionAutomationRun(run, "COMPLETED", now());

      await args.automationStore.save(run);

      return {
        status: "COMPLETED",

        run,
      };
    }

    if (action.kind === "RETRY_NOTIFICATION") {
      if (!args.auditStore) {
        throw new Error(
          "Notification-retry verification requires an action execution audit store.",
        );
      }

      if (!supportsNotificationVerification(args.repository)) {
        throw new Error(
          "The configured action repository does not support notification verification.",
        );
      }

      const audit = await args.auditStore.get(run.actionExecutionId);

      if (!audit) {
        const reason = `Action execution audit ${run.actionExecutionId} was not found during verification.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (!auditActionMatches(audit.action, action)) {
        const reason = `Action execution audit ${audit.id} does not match the derived automation action.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (audit.status !== "EXECUTED") {
        const reason = `Action execution audit ${audit.id} is ${audit.status}, not EXECUTED.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (!audit.effect || audit.effect.kind !== "NOTIFICATION_RETRY_CREATED") {
        const reason = `Action execution audit ${audit.id} does not contain a notification-retry creation effect.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      const notification = await args.repository.getNotification(
        run.orderId,
        audit.effect.notificationId,
      );

      if (!notification) {
        const reason = `Notification retry ${audit.effect.notificationId} was not found during verification.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (notification.status !== "PENDING") {
        const reason = `Expected notification retry ${notification.id} to be PENDING, received ${notification.status}.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      run = transitionAutomationRun(run, "COMPLETED", now());

      await args.automationStore.save(run);

      return {
        status: "COMPLETED",

        run,
      };
    }

    if (action.kind === "CREATE_FULFILLMENT_ATTEMPT") {
      if (!args.auditStore) {
        throw new Error(
          "Fulfillment-attempt verification requires an action execution audit store.",
        );
      }

      if (!supportsFulfillmentVerification(args.repository)) {
        throw new Error(
          "The configured action repository does not support fulfillment-attempt verification.",
        );
      }

      const audit = await args.auditStore.get(run.actionExecutionId);

      if (!audit) {
        const reason = `Action execution audit ${run.actionExecutionId} was not found during verification.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (!auditActionMatches(audit.action, action)) {
        const reason = `Action execution audit ${audit.id} does not match the derived automation action.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (audit.status !== "EXECUTED") {
        const reason = `Action execution audit ${audit.id} is ${audit.status}, not EXECUTED.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (run.approvalId && audit.approvalId !== run.approvalId) {
        const reason = `Action execution audit ${audit.id} does not reference automation approval ${run.approvalId}.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (
        !audit.effect ||
        audit.effect.kind !== "FULFILLMENT_ATTEMPT_CREATED"
      ) {
        const reason = `Action execution audit ${audit.id} does not contain a fulfillment-attempt creation effect.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      const attempt = await args.repository.getFulfillmentAttempt(
        run.orderId,
        audit.effect.attemptId,
      );

      if (!attempt) {
        const reason = `Fulfillment attempt ${audit.effect.attemptId} was not found during verification.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      if (attempt.status !== "PENDING") {
        const reason = `Expected fulfillment attempt ${attempt.id} to be PENDING, received ${attempt.status}.`;

        run = transitionAutomationRun(run, "ESCALATED", now());

        await args.automationStore.save(run);

        return {
          status: "ESCALATED",

          run,

          reason,

          verificationReasons: [reason],
        };
      }

      run = transitionAutomationRun(run, "COMPLETED", now());

      await args.automationStore.save(run);

      return {
        status: "COMPLETED",

        run,
      };
    }

    const reason = `Automation verification does not support action ${action.kind}.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",

      run,

      reason,

      verificationReasons: [reason],
    };
  } catch (error) {
    run = {
      ...run,

      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown automation verification failure.",
    };

    run = transitionAutomationRun(run, "FAILED", now());

    await args.automationStore.save(run);

    throw error;
  }
}
