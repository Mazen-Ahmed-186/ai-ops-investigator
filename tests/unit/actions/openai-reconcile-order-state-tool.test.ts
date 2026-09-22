import { describe, expect, it } from "vitest";

import { createOrder1001ActionFixture } from "../../../src/actions/action-fixtures.js";
import { InMemoryActionExecutionAuditStore } from "../../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../../src/actions/in-memory-action-execution-repository.js";
import { createOpenAIReconcileOrderStateTool } from "../../../src/actions/openai-reconcile-order-state-tool.js";

describe("OpenAI reconcile order state tool", () => {
  it("binds execution to the runtime order scope", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const tool = createOpenAIReconcileOrderStateTool({
      orderId: "ORD-1001",

      runId: "RUN-EXECUTION-1",

      repository,

      auditStore,
    });

    const result = await tool.execute({
      reason: "Reconcile the stale order state after successful delivery.",
    });

    expect(result.status).toBe("EXECUTED");

    expect(repository.getOrderStatus("ORD-1001")).toBe("FULFILLED");

    const history = await auditStore.listByOrderId("ORD-1001");

    expect(history).toHaveLength(1);

    expect(history[0]).toMatchObject({
      initiatedBy: {
        type: "AGENT",

        id: "RUN-EXECUTION-1",
      },

      action: {
        kind: "RECONCILE_ORDER_STATE",

        orderId: "ORD-1001",
      },

      status: "EXECUTED",
    });
  });

  it("remains idempotent through the OpenAI adapter", async () => {
    const repository = new InMemoryActionExecutionRepository([
      createOrder1001ActionFixture(),
    ]);

    const auditStore = new InMemoryActionExecutionAuditStore();

    const tool = createOpenAIReconcileOrderStateTool({
      orderId: "ORD-1001",

      runId: "RUN-EXECUTION-1",

      repository,

      auditStore,
    });

    const input = {
      reason: "Reconcile stale order state.",
    };

    const first = await tool.execute(input);

    const second = await tool.execute(input);

    expect(first.status).toBe("EXECUTED");

    expect(second.status).toBe("NO_OP");
  });
});
