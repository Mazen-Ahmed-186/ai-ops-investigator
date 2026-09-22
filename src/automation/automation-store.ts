import type { AutomationRun } from "./types.js";

export interface AutomationStore {
  save(run: AutomationRun): Promise<void>;

  get(runId: string): Promise<AutomationRun | null>;

  listByOrderId(orderId: string): Promise<AutomationRun[]>;
}
