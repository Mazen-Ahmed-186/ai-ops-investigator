import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createPendingApproval } from "../actions/approval.js";
import { decideApproval } from "../actions/approval-lifecycle.js";
import { createOrder1001ActionFixture } from "../actions/action-fixtures.js";
import { FileApprovalStore } from "../actions/file-approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../actions/in-memory-action-execution-repository.js";
import { runFulfillmentAttemptExecutionAgent } from "./run-fulfillment-attempt-execution-agent.js";

const reason =
  "Create another fulfillment attempt after the previous attempt was confirmed failed.";

function createRetryableFixture() {
  const fixture = createOrder1001ActionFixture();

  fixture.fulfillmentAttempts = [
    {
      id: "FUL-FAILED-1",

      status: "CONFIRMED_FAILED",
    },
  ];

  fixture.entitlements = [];

  fixture.accountDeliveries = [];

  return fixture;
}

async function main() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "ai-ops-approval-smoke-"),
  );

  const approvalStore = new FileApprovalStore(directory);

  try {
    console.log("\n=== Case A: model requests write without approval ===");

    const repositoryWithoutApproval = new InMemoryActionExecutionRepository([
      createRetryableFixture(),
    ]);

    const auditWithoutApproval = new InMemoryActionExecutionAuditStore();

    console.log(
      "Before attempts:",
      repositoryWithoutApproval.getFulfillmentAttempts("ORD-1001"),
    );

    const withoutApproval = await runFulfillmentAttemptExecutionAgent({
      orderId: "ORD-1001",

      reason,

      goal: "Create another fulfillment attempt because the previous attempt is confirmed failed.",

      approvalStore,

      repository: repositoryWithoutApproval,

      auditStore: auditWithoutApproval,

      requireToolCall: true,
    });

    console.dir(withoutApproval, {
      depth: null,
    });

    console.log(
      "After attempts:",
      repositoryWithoutApproval.getFulfillmentAttempts("ORD-1001"),
    );

    console.log("Audit:");

    console.dir(await auditWithoutApproval.listByOrderId("ORD-1001"), {
      depth: null,
    });

    console.log("\n=== Case B: same model request with persisted approval ===");

    const repositoryWithApproval = new InMemoryActionExecutionRepository([
      createRetryableFixture(),
    ]);

    const auditWithApproval = new InMemoryActionExecutionAuditStore();

    const action = {
      kind: "CREATE_FULFILLMENT_ATTEMPT" as const,

      orderId: "ORD-1001",

      reason,
    };

    const pending = createPendingApproval({
      id: "APR-SMOKE-1",

      action,

      ttlMs: 15 * 60 * 1000,
    });

    await approvalStore.save(pending);

    const approved = decideApproval({
      approval: pending,

      decision: "APPROVE",

      decidedBy: "admin-smoke",
    });

    await approvalStore.save(approved);

    console.log("Persisted approval before execution:");

    console.dir(await approvalStore.get(approved.id), {
      depth: null,
    });

    console.log(
      "Before attempts:",
      repositoryWithApproval.getFulfillmentAttempts("ORD-1001"),
    );

    const withApproval = await runFulfillmentAttemptExecutionAgent({
      orderId: "ORD-1001",

      reason,

      goal: "Create another fulfillment attempt because the previous attempt is confirmed failed.",

      approvalId: approved.id,

      approvalStore,

      repository: repositoryWithApproval,

      auditStore: auditWithApproval,

      requireToolCall: true,
    });

    console.dir(withApproval, {
      depth: null,
    });

    console.log(
      "After attempts:",
      repositoryWithApproval.getFulfillmentAttempts("ORD-1001"),
    );

    console.log("Persisted approval after execution:");

    console.dir(await approvalStore.get(approved.id), {
      depth: null,
    });

    console.log("Audit:");

    console.dir(await auditWithApproval.listByOrderId("ORD-1001"), {
      depth: null,
    });
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
