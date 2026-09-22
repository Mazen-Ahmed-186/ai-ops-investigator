import type { ActionExecutionRepository } from "../actions/action-execution-repository.js";
import type { ActionExecutionContext } from "../actions/execution-context.js";
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

export async function verifyAutomationAction(args: {
  automationRunId: string;
  automationStore: AutomationStore;
  remediationStore: RemediationStore;
  repository: ActionExecutionRepository;
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

  if (action.kind !== "RECONCILE_ORDER_STATE") {
    const reason = `Automation verification does not support action ${action.kind}.`;

    run = transitionAutomationRun(run, "ESCALATED", now());

    await args.automationStore.save(run);

    return {
      status: "ESCALATED",

      run,

      reason,

      verificationReasons: [reason],
    };
  }

  try {
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
