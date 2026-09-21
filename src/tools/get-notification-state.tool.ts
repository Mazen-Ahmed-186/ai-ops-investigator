import { z } from "zod";

import {
  getNotificationsByOrderId,
  getOrderById,
} from "../domain/repository.js";
import type { Notification } from "../domain/types.js";
import type { ToolCapability } from "./capability.js";
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

export const GET_NOTIFICATION_STATE_DESCRIPTION = [
  "Retrieve notification state for exactly one existing order.",
  "Use this to determine whether customer notifications such as email were sent, are pending, or failed.",
  "Notification state is separate from payment, fulfillment, and account delivery.",
].join(" ");

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

export const getNotificationStateCapability = {
  name: "get_notification_state",
  title: "Get Notification State",
  description: GET_NOTIFICATION_STATE_DESCRIPTION,

  inputSchema: GetNotificationStateArgumentsSchema,

  annotations: {
    readOnly: true,
    destructive: false,
    idempotent: true,
  },

  execute: executeGetNotificationState,
} satisfies ToolCapability<GetNotificationStateArguments>;
