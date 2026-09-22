import type { ActionApproval } from "./approval.js";

export interface ApprovalStore {
  save(approval: ActionApproval): Promise<void>;
  get(approvalId: string): Promise<ActionApproval | null>;
  listByOrderId(orderId: string): Promise<ActionApproval[]>;
}
