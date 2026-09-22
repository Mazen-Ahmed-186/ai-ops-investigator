import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ActionExecutionRepository } from "../actions/action-execution-repository.js";
import { createOpenAIReconcileOrderStateTool } from "../actions/openai-reconcile-order-state-tool.js";
import { env } from "../config/env.js";
import { openai } from "./client.js";

const NoActionSchema = z.object({
  status: z.literal("NO_ACTION"),

  reason: z.string().min(1),
});

export type RemediationExecutionAgentResult =
  | {
      status: "ACTION_ATTEMPTED";
      runId: string;
      tool: "reconcile_order_state";
      result: Awaited<
        ReturnType<
          ReturnType<typeof createOpenAIReconcileOrderStateTool>["execute"]
        >
      >;
    }
  | {
      status: "NO_ACTION";
      runId: string;
      reason: string;
    };

const instructions = [
  "You are a remediation execution agent.",
  "You are operating inside a tightly scoped execution runtime.",
  "The runtime has already fixed the target order.",
  "You cannot choose or modify the target order identifier.",
  "Use only the capabilities exposed to you.",
  "Call reconcile_order_state only when the supplied remediation goal explicitly requires reconciling a stale completed order state.",
  "Do not claim an action succeeded unless the tool actually executes.",
  "If the available action does not match the remediation goal, return NO_ACTION.",
].join(" ");

export async function runRemediationExecutionAgent(args: {
  orderId: string;
  goal: string;
  repository: ActionExecutionRepository;
  auditStore: ActionExecutionAuditStore;
  runId?: string;
}): Promise<RemediationExecutionAgentResult> {
  const runId = args.runId ?? `RUN-EXEC-${randomUUID()}`;

  const tool = createOpenAIReconcileOrderStateTool({
    orderId: args.orderId,
    runId,
    repository: args.repository,
    auditStore: args.auditStore,
  });

  const response = await openai.responses.parse({
    model: env.OPENAI_MODEL,
    instructions,
    input: JSON.stringify({
      scopedOrderId: args.orderId,
      remediationGoal: args.goal,
    }),
    tools: [tool.definition],
    tool_choice: "auto",
    parallel_tool_calls: false,
    text: {
      format: zodTextFormat(NoActionSchema, "remediation_execution_decision"),
    },
  });

  if (response.status !== "completed") {
    throw new Error(
      `Remediation execution model response did not complete: ${response.status}`,
    );
  }

  const functionCall = response.output.find(
    (item) => item.type === "function_call",
  );

  if (functionCall) {
    if (functionCall.name !== "reconcile_order_state") {
      throw new Error(
        `Unexpected remediation execution tool: ${functionCall.name}.`,
      );
    }

    const result = await tool.execute(functionCall.parsed_arguments);

    return {
      status: "ACTION_ATTEMPTED",
      runId,
      tool: "reconcile_order_state",
      result,
    };
  }

  if (!response.output_parsed) {
    throw new Error(
      "Execution agent returned neither a tool call nor a parsed no-action decision.",
    );
  }

  return {
    status: "NO_ACTION",
    runId,
    reason: response.output_parsed.reason,
  };
}
