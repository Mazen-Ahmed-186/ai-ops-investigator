import {
  getNotificationsByOrderId,
  getOrderById,
} from "./domain/repository.js";
import { evaluateOrderInvariants } from "./domain/invariants.js";

const orderId = "ORD-1001";

console.log({
  order: getOrderById(orderId),
  notifications: getNotificationsByOrderId(orderId),
  findings: evaluateOrderInvariants(orderId),
});
