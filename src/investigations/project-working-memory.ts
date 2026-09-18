import type {
  InvestigationFact,
  InvestigationRunState,
  InvestigationWorkingMemory,
} from "./types.js";

function getSuccessfulData(result: unknown): unknown | null {
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    (result as { ok?: unknown }).ok !== true ||
    !("data" in result)
  ) {
    return null;
  }

  return (result as { data: unknown }).data;
}

export function projectWorkingMemory(
  state: InvestigationRunState,
): InvestigationWorkingMemory {
  const facts: InvestigationFact[] = state.toolExecutions.flatMap(
    (execution) => {
      const data = getSuccessfulData(execution.result);

      if (!data) {
        return [];
      }

      switch (execution.tool) {
        case "get_order": {
          const value = data as {
            order?: {
              id: string;
              status: string;
            };
          };

          if (!value.order) {
            return [];
          }

          return [
            {
              id: `fact-${execution.sequence}-order-status`,
              statement: `Order ${value.order.id} status is ${value.order.status}.`,
              sourceTool: execution.tool,
              sourceSequence: execution.sequence,
            },
          ];
        }

        case "get_payment_state": {
          const value = data as {
            payments?: Array<{
              id: string;
              status: string;
            }>;
          };

          return (value.payments ?? []).map((payment) => ({
            id: `fact-${execution.sequence}-payment-${payment.id}`,
            statement: `Payment ${payment.id} status is ${payment.status}.`,
            sourceTool: execution.tool,
            sourceSequence: execution.sequence,
          }));
        }

        case "get_fulfillment_attempts": {
          const value = data as {
            attempts?: Array<{
              id: string;
              status: string;
            }>;
          };

          return (value.attempts ?? []).map((attempt) => ({
            id: `fact-${execution.sequence}-fulfillment-${attempt.id}`,
            statement: `Fulfillment attempt ${attempt.id} status is ${attempt.status}.`,
            sourceTool: execution.tool,
            sourceSequence: execution.sequence,
          }));
        }

        case "get_delivery_state": {
          const value = data as {
            entitlements?: Array<{
              id: string;
              status: string;
            }>;

            accountDeliveries?: Array<{
              id: string;
              entitlementId: string;
              status: string;
            }>;
          };

          return [
            ...(value.entitlements ?? []).map((entitlement) => ({
              id: `fact-${execution.sequence}-entitlement-${entitlement.id}`,
              statement: `Entitlement ${entitlement.id} status is ${entitlement.status}.`,
              sourceTool: execution.tool,
              sourceSequence: execution.sequence,
            })),

            ...(value.accountDeliveries ?? []).map((delivery) => ({
              id: `fact-${execution.sequence}-delivery-${delivery.id}`,
              statement: `Account delivery ${delivery.id} for entitlement ${delivery.entitlementId} status is ${delivery.status}.`,
              sourceTool: execution.tool,
              sourceSequence: execution.sequence,
            })),
          ];
        }

        case "get_order_event_history": {
          const value = data as {
            events?: Array<{
              id: string;
              type: string;
              occurredAt: string;
            }>;
          };

          return (value.events ?? []).map((event) => ({
            id: `fact-${execution.sequence}-event-${event.id}`,
            statement: `Order event ${event.type} occurred at ${event.occurredAt}.`,
            sourceTool: execution.tool,
            sourceSequence: execution.sequence,
          }));
        }

        case "get_notification_state": {
          const value = data as {
            notifications?: Array<{
              id: string;
              type: string;
              status: string;
            }>;
          };

          return (value.notifications ?? []).map((notification) => ({
            id: `fact-${execution.sequence}-notification-${notification.id}`,
            statement: `Notification ${notification.id} of type ${notification.type} status is ${notification.status}.`,
            sourceTool: execution.tool,
            sourceSequence: execution.sequence,
          }));
        }

        case "get_order_processing_trace": {
          const value = data as {
            entries?: Array<{
              id: string;
              component: string;
              event: string;
              detail: string;
            }>;
          };

          return (value.entries ?? []).map((entry) => ({
            id: `fact-${execution.sequence}-trace-${entry.id}`,
            statement: `Technical trace ${entry.event} in ${entry.component}: ${entry.detail}`,
            sourceTool: execution.tool,
            sourceSequence: execution.sequence,
          }));
        }

        default:
          return [];
      }
    },
  );

  return {
    facts,
    unresolvedQuestions: [],
  };
}
