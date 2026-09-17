import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import { getOrderById, getPaymentsByOrderId } from "../domain/repository.js";
import type { Payment } from "../domain/types.js";
import type { ToolResult } from "./types.js";

export const GetPaymentStateArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetPaymentStateArguments = z.infer<
  typeof GetPaymentStateArgumentsSchema
>;

export type GetPaymentStateData = {
  orderId: string;
  payments: Payment[];
  observedAt: string;
  source: "commerce_repository";
};

export const getPaymentStateTool = zodResponsesFunction({
  name: "get_payment_state",
  description: [
    "Retrieve payment state for exactly one existing order.",
    "Use this to determine whether payment is pending, captured, failed, or refunded.",
    "Does not return fulfillment, entitlement, delivery, or notification state.",
  ].join(" "),
  parameters: GetPaymentStateArgumentsSchema,
});

export function executeGetPaymentState(
  args: GetPaymentStateArguments,
): ToolResult<GetPaymentStateData> {
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
      payments: getPaymentsByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "commerce_repository",
    },
  };
}
