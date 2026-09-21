import { getDeliveryStateCapability } from "./get-delivery-state.tool.js";
import { getFulfillmentAttemptsCapability } from "./get-fulfillment-attempts.tool.js";
import { getNotificationStateCapability } from "./get-notification-state.tool.js";
import { getOrderEventHistoryCapability } from "./get-order-event-history.tool.js";
import { getOrderProcessingTraceCapability } from "./get-order-processing-trace.tool.js";
import { getOrderCapability } from "./get-order.tool.js";
import { createOpenAIRegisteredCapability } from "./openai-adapter.js";
import { getPaymentStateCapability } from "./get-payment-state.tool.js";
import type { ToolResult } from "./types.js";

const getOrderRegisteredCapability =
  createOpenAIRegisteredCapability(getOrderCapability);

const getPaymentStateRegisteredCapability = createOpenAIRegisteredCapability(
  getPaymentStateCapability,
);

const getFulfillmentAttemptsRegisteredCapability =
  createOpenAIRegisteredCapability(getFulfillmentAttemptsCapability);

const getDeliveryStateRegisteredCapability = createOpenAIRegisteredCapability(
  getDeliveryStateCapability,
);

const getNotificationStateRegisteredCapability =
  createOpenAIRegisteredCapability(getNotificationStateCapability);

const getOrderEventHistoryRegisteredCapability =
  createOpenAIRegisteredCapability(getOrderEventHistoryCapability);

const getOrderProcessingTraceRegisteredCapability =
  createOpenAIRegisteredCapability(getOrderProcessingTraceCapability);

export const toolRegistry = {
  get_order: getOrderRegisteredCapability,

  get_payment_state: getPaymentStateRegisteredCapability,

  get_fulfillment_attempts: getFulfillmentAttemptsRegisteredCapability,

  get_delivery_state: getDeliveryStateRegisteredCapability,

  get_notification_state: getNotificationStateRegisteredCapability,

  get_order_event_history: getOrderEventHistoryRegisteredCapability,

  get_order_processing_trace: getOrderProcessingTraceRegisteredCapability,
} as const;

export type ToolName = keyof typeof toolRegistry;

export const modelTools = Object.values(toolRegistry).map(
  (entry) => entry.definition,
);

export function executeRegisteredTool(
  name: string,
  args: unknown,
): ToolResult<unknown> {
  const entry = toolRegistry[name as ToolName];

  if (!entry) {
    return {
      ok: false,
      error: {
        code: "TOOL_NOT_REGISTERED",
        category: "VALIDATION",
        retryable: false,
        message: `Tool ${name} is not registered.`,
      },
    };
  }

  return entry.execute(args);
}
