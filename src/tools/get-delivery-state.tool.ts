import { z } from "zod";

import {
  getAccountDeliveriesByOrderId,
  getEntitlementsByOrderId,
  getOrderById,
} from "../domain/repository.js";
import type { AccountDelivery, Entitlement } from "../domain/types.js";
import type { ToolCapability } from "./capability.js";
import type { ToolResult } from "./types.js";

export const GetDeliveryStateArgumentsSchema = z.object({
  orderId: z.string().min(1),
});

export type GetDeliveryStateArguments = z.infer<
  typeof GetDeliveryStateArgumentsSchema
>;

export type GetDeliveryStateData = {
  orderId: string;
  entitlements: Entitlement[];
  accountDeliveries: AccountDelivery[];
  observedAt: string;
  source: "commerce_repository";
};

export const GET_DELIVERY_STATE_DESCRIPTION = [
  "Retrieve the customer delivery state for exactly one existing order.",
  "Returns entitlement state and authenticated account delivery state.",
  "Use this to determine whether a fulfilled item became durably available to the customer.",
  "Does not return payment, provider fulfillment attempt, or notification state.",
].join(" ");

export function executeGetDeliveryState(
  args: GetDeliveryStateArguments,
): ToolResult<GetDeliveryStateData> {
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
      entitlements: getEntitlementsByOrderId(args.orderId),
      accountDeliveries: getAccountDeliveriesByOrderId(args.orderId),
      observedAt: new Date().toISOString(),
      source: "commerce_repository",
    },
  };
}

export const getDeliveryStateCapability = {
  name: "get_delivery_state",
  title: "Get Delivery State",
  description: GET_DELIVERY_STATE_DESCRIPTION,

  inputSchema: GetDeliveryStateArgumentsSchema,

  annotations: {
    readOnly: true,
    destructive: false,
    idempotent: true,
  },

  execute: executeGetDeliveryState,
} satisfies ToolCapability<GetDeliveryStateArguments>;
