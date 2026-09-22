import type { ActionExecutionAuditRecord } from "./action-execution-audit.js";
import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";

export class InMemoryActionExecutionAuditStore implements ActionExecutionAuditStore {
  private readonly records = new Map<string, ActionExecutionAuditRecord>();

  async save(record: ActionExecutionAuditRecord) {
    this.records.set(record.id, structuredClone(record));
  }

  async get(executionId: string) {
    const record = this.records.get(executionId);

    return record ? structuredClone(record) : null;
  }

  async listByOrderId(orderId: string) {
    return Array.from(this.records.values())
      .filter((record) => record.action.orderId === orderId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((record) => structuredClone(record));
  }
}
