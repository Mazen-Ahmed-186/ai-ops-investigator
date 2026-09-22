import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AutomationStore } from "./automation-store.js";
import { AutomationRunSchema, type AutomationRun } from "./types.js";

export class FileAutomationStore implements AutomationStore {
  constructor(
    private readonly directory = path.resolve(".data", "automations"),
  ) {}

  private filePath(runId: string) {
    return path.join(this.directory, `${runId}.json`);
  }

  async save(run: AutomationRun) {
    const validated = AutomationRunSchema.parse(run);

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

  async get(runId: string): Promise<AutomationRun | null> {
    try {
      const content = await readFile(this.filePath(runId), "utf8");

      return AutomationRunSchema.parse(JSON.parse(content));
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

  async listByOrderId(orderId: string): Promise<AutomationRun[]> {
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

            return AutomationRunSchema.parse(JSON.parse(content));
          }),
      );

      return runs
        .filter((run) => run.orderId === orderId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
