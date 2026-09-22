import type { AutomationStore } from "./automation-store.js";
import type { AutomationRun } from "./types.js";

export class InMemoryAutomationStore implements AutomationStore {
  private readonly runs = new Map<string, AutomationRun>();

  async save(run: AutomationRun) {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(runId: string) {
    const run = this.runs.get(runId);

    return run ? structuredClone(run) : null;
  }

  async listByOrderId(orderId: string) {
    return Array.from(this.runs.values())
      .filter((run) => run.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((run) => structuredClone(run));
  }
}
