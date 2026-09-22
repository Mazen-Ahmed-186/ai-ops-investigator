import type {
  ActionExecutionRepository,
  ReconcileOrderStateWriteResult,
} from "./action-execution-repository.js";
import type { ActionExecutionContext } from "./execution-context.js";
import { validateActionExecution } from "./validate-action-execution.js";

type PaymentStatus = "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";

type FulfillmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "UNKNOWN"
  | "RECONCILING"
  | "SUCCEEDED"
  | "CONFIRMED_FAILED"
  | "ABORTED"
  | "MANUAL_REVIEW";

type EntitlementStatus = "ACTIVE" | "REVOKED";

type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

type NotificationStatus = "PENDING" | "SENT" | "FAILED";

type RefundStatus = "PENDING" | "ISSUED" | "FAILED";

export type MutableCommerceOrderSeed = {
  order: {
    id: string;

    status: ActionExecutionContext["orderStatus"];
  };

  payments: Array<{
    status: PaymentStatus;
  }>;

  fulfillmentAttempts: Array<{
    status: FulfillmentStatus;
  }>;

  entitlements: Array<{
    status: EntitlementStatus;
  }>;

  accountDeliveries: Array<{
    status: DeliveryStatus;
  }>;

  notifications: Array<{
    status: NotificationStatus;
  }>;

  refunds: Array<{
    status: RefundStatus;
  }>;

  refundAllowedByBusinessPolicy: boolean;
};

const blockingFulfillmentStatuses = new Set<FulfillmentStatus>([
  "PENDING",
  "ACTIVE",
  "UNKNOWN",
  "RECONCILING",
  "MANUAL_REVIEW",
]);

function cloneSeed(seed: MutableCommerceOrderSeed): MutableCommerceOrderSeed {
  return structuredClone(seed);
}

function buildExecutionContext(
  state: MutableCommerceOrderSeed,
): ActionExecutionContext {
  return {
    orderStatus: state.order.status,

    paymentCaptured: state.payments.some(
      (payment) => payment.status === "CAPTURED",
    ),

    fulfillmentSucceeded: state.fulfillmentAttempts.some(
      (attempt) => attempt.status === "SUCCEEDED",
    ),

    entitlementActive: state.entitlements.some(
      (entitlement) => entitlement.status === "ACTIVE",
    ),

    accountDeliveryDelivered: state.accountDeliveries.some(
      (delivery) => delivery.status === "DELIVERED",
    ),

    notificationFailed: state.notifications.some(
      (notification) => notification.status === "FAILED",
    ),

    hasBlockingFulfillmentAttempt: state.fulfillmentAttempts.some((attempt) =>
      blockingFulfillmentStatuses.has(attempt.status),
    ),

    refundAllowedByBusinessPolicy: state.refundAllowedByBusinessPolicy,

    refundAlreadyIssued: state.refunds.some(
      (refund) => refund.status === "ISSUED",
    ),
  };
}

export class InMemoryActionExecutionRepository implements ActionExecutionRepository {
  private readonly orders = new Map<string, MutableCommerceOrderSeed>();

  constructor(seeds: MutableCommerceOrderSeed[]) {
    for (const seed of seeds) {
      this.orders.set(seed.order.id, cloneSeed(seed));
    }
  }

  async getExecutionContext(
    orderId: string,
  ): Promise<ActionExecutionContext | null> {
    const state = this.orders.get(orderId);

    if (!state) {
      return null;
    }

    return buildExecutionContext(state);
  }

  async reconcileOrderStateToFulfilled(
    orderId: string,
  ): Promise<ReconcileOrderStateWriteResult> {
    const state = this.orders.get(orderId);

    if (!state) {
      return {
        status: "PRECONDITION_FAILED",

        reasons: [`Order ${orderId} no longer exists.`],
      };
    }

    if (state.order.status === "FULFILLED") {
      return {
        status: "ALREADY_FULFILLED",
      };
    }

    const currentContext = buildExecutionContext(state);

    const validation = validateActionExecution(
      {
        kind: "RECONCILE_ORDER_STATE",

        orderId,

        reason: "Validate reconciliation preconditions at the write boundary.",
      },

      currentContext,
    );

    if (!validation.valid) {
      return {
        status: "PRECONDITION_FAILED",

        reasons: validation.reasons,
      };
    }

    state.order.status = "FULFILLED";

    return {
      status: "UPDATED",
      previousStatus: "PROCESSING",
      currentStatus: "FULFILLED",
    };
  }

  getOrderStatus(orderId: string) {
    return this.orders.get(orderId)?.order.status ?? null;
  }
}
