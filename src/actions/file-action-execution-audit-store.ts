import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ActionExecutionAuditRecordSchema,
  type ActionExecutionAuditRecord,
} from "./action-execution-audit.js";
import type { ActionExecutionAuditStore } from "./action-execution-audit-store.js";

export class FileActionExecutionAuditStore implements ActionExecutionAuditStore {
  constructor(
    private readonly directory = path.resolve(".data", "action-executions"),
  ) {}

  private filePath(executionId: string) {
    return path.join(this.directory, `${executionId}.json`);
  }

  async save(record: ActionExecutionAuditRecord) {
    const validated = ActionExecutionAuditRecordSchema.parse(record);

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

  async get(executionId: string): Promise<ActionExecutionAuditRecord | null> {
    try {
      const content = await readFile(this.filePath(executionId), "utf8");

      return ActionExecutionAuditRecordSchema.parse(JSON.parse(content));
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

  async listByOrderId(orderId: string): Promise<ActionExecutionAuditRecord[]> {
    try {
      const entries = await readdir(this.directory);

      const records = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const content = await readFile(
              path.join(this.directory, entry),
              "utf8",
            );

            return ActionExecutionAuditRecordSchema.parse(JSON.parse(content));
          }),
      );

      return records
        .filter((record) => record.action.orderId === orderId)
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
