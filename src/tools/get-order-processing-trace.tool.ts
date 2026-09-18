import { zodResponsesFunction } from "openai/helpers/zod";
import { z } from "zod";

import {
  getOrderById,
  getOrderProcessingTraceByOrderId,
} from "../domain/repository.js";
import type { OrderProcessingTraceEntry } from "../domain/types.js";
import type { ToolResult } from "./types.js";

export const GetOrderProcessingTraceArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetOrderProcessingTraceArguments = z.infer<
  typeof GetOrderProcessingTraceArgumentsSchema
>;

export type GetOrderProcessingTraceData = {
  orderId: string;
  entries: OrderProcessingTraceEntry[];
  observedAt: string;
  source: "application_trace";
};

export const getOrderProcessingTraceTool = zodResponsesFunction({
  name: "get_order_processing_trace",
  description: [
    "Retrieve curated technical execution trace entries for exactly one existing order.",
    "Use this when business state or event history shows an unexplained processing or state-transition failure.",
    "This can help determine why an expected application transition did not complete.",
    "It does not expose arbitrary logs, stack traces, SQL, secrets, or infrastructure access.",
  ].join(" "),
  parameters: GetOrderProcessingTraceArgumentsSchema,
});

export function executeGetOrderProcessingTrace(
  args: GetOrderProcessingTraceArguments,
): ToolResult<GetOrderProcessingTraceData> {
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
      entries: getOrderProcessingTraceByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "application_trace",
    },
  };
}
