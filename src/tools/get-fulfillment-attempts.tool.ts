import { z } from "zod";

import {
  getFulfillmentAttemptsByOrderId,
  getOrderById,
} from "../domain/repository.js";
import type { FulfillmentAttempt } from "../domain/types.js";
import type { ToolCapability } from "./capability.js";
import type { ToolResult } from "./types.js";

export const GetFulfillmentAttemptsArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetFulfillmentAttemptsArguments = z.infer<
  typeof GetFulfillmentAttemptsArgumentsSchema
>;

export type GetFulfillmentAttemptsData = {
  orderId: string;
  attempts: FulfillmentAttempt[];
  observedAt: string;
  source: "commerce_repository";
};

export const GET_FULFILLMENT_ATTEMPTS_DESCRIPTION = [
  "Retrieve fulfillment attempts for exactly one existing order.",
  "Use this when investigating whether fulfillment started, succeeded, failed, or became uncertain.",
  "Does not return payment, entitlement, account delivery, or notification state.",
].join(" ");

export function executeGetFulfillmentAttempts(
  args: GetFulfillmentAttemptsArguments,
): ToolResult<GetFulfillmentAttemptsData> {
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
      attempts: getFulfillmentAttemptsByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "commerce_repository",
    },
  };
}

export const getFulfillmentAttemptsCapability = {
  name: "get_fulfillment_attempts",
  title: "Get Fulfillment Attempts",
  description: GET_FULFILLMENT_ATTEMPTS_DESCRIPTION,

  inputSchema: GetFulfillmentAttemptsArgumentsSchema,

  annotations: {
    readOnly: true,
    destructive: false,
    idempotent: true,
  },

  execute: executeGetFulfillmentAttempts,
} satisfies ToolCapability<GetFulfillmentAttemptsArguments>;
