import type { RemediationRun } from "./types.js";

export interface RemediationStore {
  save(run: RemediationRun): Promise<void>;

  get(runId: string): Promise<RemediationRun | null>;

  listByOrderId(orderId: string): Promise<RemediationRun[]>;
}
