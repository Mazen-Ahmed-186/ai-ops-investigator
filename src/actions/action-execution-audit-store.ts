import type { ActionExecutionAuditRecord } from "./action-execution-audit.js";

export interface ActionExecutionAuditStore {
  save(record: ActionExecutionAuditRecord): Promise<void>;

  get(executionId: string): Promise<ActionExecutionAuditRecord | null>;

  listByOrderId(orderId: string): Promise<ActionExecutionAuditRecord[]>;
}
