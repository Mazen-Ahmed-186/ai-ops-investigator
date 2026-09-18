import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { InvestigationStore } from "./store.js";
import type { InvestigationRunState } from "./types.js";

export class FileInvestigationStore implements InvestigationStore {
  constructor(
    private readonly rootDirectory = path.join(
      process.cwd(),
      ".data",
      "investigations",
    ),
  ) {}

  async save(state: InvestigationRunState): Promise<void> {
    await mkdir(this.rootDirectory, {
      recursive: true,
    });

    const destination = this.getPath(state.id);
    const temporary = `${destination}.tmp`;

    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");

    await rename(temporary, destination);
  }

  async get(runId: string): Promise<InvestigationRunState | null> {
    try {
      const content = await readFile(this.getPath(runId), "utf8");

      return JSON.parse(content) as InvestigationRunState;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  private getPath(runId: string) {
    return path.join(this.rootDirectory, `${runId}.json`);
  }
}
