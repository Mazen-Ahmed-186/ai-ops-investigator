import { createOrder1001ActionFixture } from "../actions/action-fixtures.js";
import { InMemoryActionExecutionAuditStore } from "../actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../actions/in-memory-action-execution-repository.js";
import { runRemediationExecutionAgent } from "./run-remediation-execution-agent.js";

async function main() {
  const repository = new InMemoryActionExecutionRepository([
    createOrder1001ActionFixture(),
  ]);

  const auditStore = new InMemoryActionExecutionAuditStore();

  console.log("Before:", repository.getOrderStatus("ORD-1001"));

  const result = await runRemediationExecutionAgent({
    orderId: "ORD-1001",
    goal: "Reconcile the stale PROCESSING order state because payment, fulfillment, entitlement, and account delivery succeeded but the final FULFILLED transition was not persisted.",
    repository,
    auditStore,
  });

  console.log("Execution result:");

  console.dir(result, {
    depth: null,
  });

  console.log("After:", repository.getOrderStatus("ORD-1001"));

  console.log("Audit history:");

  console.dir(await auditStore.listByOrderId("ORD-1001"), {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
