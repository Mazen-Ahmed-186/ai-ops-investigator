import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RemediationStore } from "./store.js";
import { RemediationRunSchema, type RemediationRun } from "./types.js";

export class FileRemediationStore implements RemediationStore {
  constructor(
    private readonly directory = path.resolve(".data", "remediations"),
  ) {}

  private filePath(runId: string) {
    return path.join(this.directory, `${runId}.json`);
  }

  async save(run: RemediationRun) {
    const validated = RemediationRunSchema.parse(run);

    await mkdir(this.directory, {
      recursive: true,
    });

    const destination = this.filePath(validated.id);

    const temporary = path.join(
      this.directory,
      `.${validated.id}.${randomUUID()}.tmp`,
    );

    await writeFile(temporary, JSON.stringify(validated, null, 2), "utf8");

    await rename(temporary, destination);
  }

  async get(runId: string): Promise<RemediationRun | null> {
    try {
      const content = await readFile(this.filePath(runId), "utf8");

      return RemediationRunSchema.parse(JSON.parse(content));
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

  async listByOrderId(orderId: string): Promise<RemediationRun[]> {
    try {
      const entries = await readdir(this.directory);

      const runs = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const content = await readFile(
              path.join(this.directory, entry),
              "utf8",
            );

            return RemediationRunSchema.parse(JSON.parse(content));
          }),
      );

      return runs
        .filter((run) => run.orderId === orderId)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }

      throw error;
    }
  }
}
