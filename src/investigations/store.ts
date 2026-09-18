import type { InvestigationRunState } from "./types.js";

export interface InvestigationStore {
  save(state: InvestigationRunState): Promise<void>;

  get(runId: string): Promise<InvestigationRunState | null>;
}
