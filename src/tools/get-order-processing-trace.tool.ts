import { z } from "zod";

import {
  getOrderById,
  getOrderProcessingTraceByOrderId,
} from "../domain/repository.js";
import type { OrderProcessingTraceEntry } from "../domain/types.js";
import type { ToolCapability } from "./capability.js";
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

export const GET_ORDER_PROCESSING_TRACE_DESCRIPTION = [
  "Retrieve curated technical execution trace entries for exactly one existing order.",
  "Use this when business state or event history shows an unexplained processing or state-transition failure.",
  "This can help determine why an expected application transition did not complete.",
  "It does not expose arbitrary logs, stack traces, SQL, secrets, or infrastructure access.",
].join(" ");

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

export const getOrderProcessingTraceCapability = {
  name: "get_order_processing_trace",
  title: "Get Order Processing Trace",
  description: GET_ORDER_PROCESSING_TRACE_DESCRIPTION,

  inputSchema: GetOrderProcessingTraceArgumentsSchema,

  annotations: {
    readOnly: true,
    destructive: false,
    idempotent: true,
  },

  execute: executeGetOrderProcessingTrace,
} satisfies ToolCapability<GetOrderProcessingTraceArguments>;
