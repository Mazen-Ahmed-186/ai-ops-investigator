import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import {
  getNotificationsByOrderId,
  getOrderById,
} from "../domain/repository.js";
import type { Notification } from "../domain/types.js";
import type { ToolResult } from "./types.js";

export const GetNotificationStateArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetNotificationStateArguments = z.infer<
  typeof GetNotificationStateArgumentsSchema
>;

export type GetNotificationStateData = {
  orderId: string;
  notifications: Notification[];
  observedAt: string;
  source: "commerce_repository";
};

export const getNotificationStateTool = zodResponsesFunction({
  name: "get_notification_state",
  description: [
    "Retrieve notification state for exactly one existing order.",
    "Use this to determine whether customer notifications such as email were sent, are pending, or failed.",
    "Notification state is separate from payment, fulfillment, and account delivery.",
  ].join(" "),
  parameters: GetNotificationStateArgumentsSchema,
});

export function executeGetNotificationState(
  args: GetNotificationStateArguments,
): ToolResult<GetNotificationStateData> {
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
      notifications: getNotificationsByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "commerce_repository",
    },
  };
}
