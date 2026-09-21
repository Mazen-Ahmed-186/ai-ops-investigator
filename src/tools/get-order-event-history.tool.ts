import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import { getOrderById, getOrderEventsByOrderId } from "../domain/repository.js";
import type { OrderEvent } from "../domain/types.js";
import type { ToolResult } from "./types.js";
import type { ToolCapability } from "./capability.js";

export const GetOrderEventHistoryArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetOrderEventHistoryArguments = z.infer<
  typeof GetOrderEventHistoryArgumentsSchema
>;

export type GetOrderEventHistoryData = {
  orderId: string;
  events: OrderEvent[];
  observedAt: string;
  source: "commerce_event_history";
};

export const GET_ORDER_EVENT_HISTORY_DESCRIPTION = [
  "Retrieve chronological business event history for exactly one existing order.",
  "Use this when current state shows an inconsistency and you need to understand how the order reached that state.",
  "This returns business events, not low-level application logs or infrastructure traces.",
].join(" ");

export const getOrderEventHistoryTool = zodResponsesFunction({
  name: "get_order_event_history",
  description: GET_ORDER_EVENT_HISTORY_DESCRIPTION,
  parameters: GetOrderEventHistoryArgumentsSchema,
});

export function executeGetOrderEventHistory(
  args: GetOrderEventHistoryArguments,
): ToolResult<GetOrderEventHistoryData> {
  const order = getOrderById(args.orderId);

  if (!order) {
    return {
      ok: false,
      error: {
        code: "ORDER_NOT_FOUND",
        category: "NOT_FOUND",
        retryable: false,
        message: `Order ${args.orderId} was not found.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      orderId: args.orderId,
      events: getOrderEventsByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "commerce_event_history",
    },
  };
}

export const getOrderEventHistoryCapability = {
  name: "get_order_event_history",
  title: "Get Order Event History",
  description: GET_ORDER_EVENT_HISTORY_DESCRIPTION,

  inputSchema: GetOrderEventHistoryArgumentsSchema,

  annotations: {
    readOnly: true,
    destructive: false,
    idempotent: true,
  },

  execute: executeGetOrderEventHistory,
} satisfies ToolCapability<GetOrderEventHistoryArguments>;
