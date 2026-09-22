import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActionApprovalSchema, type ActionApproval } from "./approval.js";
import type { ApprovalStore } from "./approval-store.js";

export class FileApprovalStore implements ApprovalStore {
  constructor(
    private readonly directory = path.resolve(".data", "approvals"),
  ) {}

  private filePath(approvalId: string) {
    return path.join(this.directory, `${approvalId}.json`);
  }

  async save(approval: ActionApproval) {
    const validated = ActionApprovalSchema.parse(approval);

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

  async get(approvalId: string): Promise<ActionApproval | null> {
    try {
      const content = await readFile(this.filePath(approvalId), "utf8");

      return ActionApprovalSchema.parse(JSON.parse(content));
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

  async listByOrderId(orderId: string): Promise<ActionApproval[]> {
    try {
      const entries = await readdir(this.directory);

      const approvals = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const content = await readFile(
              path.join(this.directory, entry),
              "utf8",
            );

            return ActionApprovalSchema.parse(JSON.parse(content));
          }),
      );

      return approvals
        .filter((approval) => approval.action.orderId === orderId)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
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
