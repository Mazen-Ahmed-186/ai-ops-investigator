import type { RemediationStore } from "./store.js";
import type { RemediationRun } from "./types.js";

export class InMemoryRemediationStore implements RemediationStore {
  private readonly runs = new Map<string, RemediationRun>();

  async save(run: RemediationRun) {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(runId: string) {
    const run = this.runs.get(runId);

    return run ? structuredClone(run) : null;
  }

  async listByOrderId(orderId: string) {
    return Array.from(this.runs.values())
      .filter((run) => run.orderId === orderId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((run) => structuredClone(run));
  }
}
