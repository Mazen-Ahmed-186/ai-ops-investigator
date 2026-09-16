import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import { getOrderById } from "../domain/repository.js";
import type { Order } from "../domain/types.js";
import type { ToolResult } from "./types.js";

export const GetOrderArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetOrderArguments = z.infer<typeof GetOrderArgumentsSchema>;

export type GetOrderData = {
  order: Order;
  observedAt: string;
  source: "commerce_repository";
};

export const getOrderTool = zodResponsesFunction({
  name: "get_order",
  description: [
    "Retrieve the current high-level state of exactly one order by order ID.",
    "Returns the order status and timestamps.",
    "Does not return payment details, fulfillment attempts, entitlements, deliveries, or notifications.",
  ].join(" "),
  parameters: GetOrderArgumentsSchema,
});

export function executeGetOrder(
  args: GetOrderArguments,
): ToolResult<GetOrderData> {
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
      order,
      observedAt: new Date().toISOString(),
      source: "commerce_repository",
    },
  };
}
