import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { ActionExecutionAuditStore } from "../actions/action-execution-audit-store.js";
import type { ApprovalStore } from "../actions/approval-store.js";
import { createOpenAICreateFulfillmentAttemptTool } from "../actions/openai-create-fulfillment-attempt-tool.js";
import type { FulfillmentActionExecutionRepository } from "../actions/fulfillment-action-execution-repository.js";
import { env } from "../config/env.js";
import { openai } from "./client.js";

const NoActionSchema = z.object({
  status: z.literal("NO_ACTION"),

  reason: z.string().min(1),
});

export type FulfillmentAttemptExecutionAgentResult =
  | {
      status: "ACTION_ATTEMPTED";

      runId: string;

      tool: "create_fulfillment_attempt";

      result: Awaited<
        ReturnType<
          ReturnType<typeof createOpenAICreateFulfillmentAttemptTool>["execute"]
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
  "You operate inside a tightly scoped execution runtime.",
  "The runtime has fixed the target order, exact action intent, approval reference, and execution identity.",
  "You cannot choose another order or modify the approved action.",
  "Use only the capability exposed to you.",
  "Call create_fulfillment_attempt when the supplied remediation goal explicitly requires creating another fulfillment attempt.",
  "Do not infer that approval exists. Approval enforcement is handled by deterministic application code.",
  "Do not claim execution succeeded unless the tool result reports EXECUTED.",
  "If the available capability does not match the remediation goal and tool use is optional, return NO_ACTION.",
].join(" ");

export async function runFulfillmentAttemptExecutionAgent(args: {
  orderId: string;

  reason: string;

  goal: string;

  approvalId?: string;

  approvalStore: ApprovalStore;

  repository: FulfillmentActionExecutionRepository;

  auditStore: ActionExecutionAuditStore;

  runId?: string;

  requireToolCall?: boolean;
}): Promise<FulfillmentAttemptExecutionAgentResult> {
  const runId = args.runId ?? `RUN-EXEC-${randomUUID()}`;

  const tool = createOpenAICreateFulfillmentAttemptTool({
    orderId: args.orderId,

    reason: args.reason,

    runId,

    approvalStore: args.approvalStore,

    repository: args.repository,

    auditStore: args.auditStore,

    ...(args.approvalId
      ? {
          approvalId: args.approvalId,
        }
      : {}),
  });

  const response = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    instructions,

    input: JSON.stringify({
      scopedOrderId: args.orderId,

      remediationGoal: args.goal,
    }),

    tools: [tool.definition],

    tool_choice: args.requireToolCall ? "required" : "auto",

    parallel_tool_calls: false,

    text: {
      format: zodTextFormat(NoActionSchema, "fulfillment_execution_decision"),
    },
  });

  if (response.status !== "completed") {
    throw new Error(
      `Fulfillment execution model response did not complete: ${response.status}`,
    );
  }

  const functionCalls = response.output.filter(
    (item) => item.type === "function_call",
  );

  if (functionCalls.length > 1) {
    throw new Error(
      `Expected at most one fulfillment execution tool call, received ${functionCalls.length}.`,
    );
  }

  const functionCall = functionCalls[0];

  if (functionCall) {
    if (functionCall.name !== "create_fulfillment_attempt") {
      throw new Error(
        `Unexpected fulfillment execution tool: ${functionCall.name}.`,
      );
    }

    const result = await tool.execute(functionCall.parsed_arguments);

    return {
      status: "ACTION_ATTEMPTED",

      runId,

      tool: "create_fulfillment_attempt",

      result,
    };
  }

  if (args.requireToolCall) {
    throw new Error(
      "The model was required to call the fulfillment execution tool but returned no function call.",
    );
  }

  if (!response.output_parsed) {
    throw new Error(
      "Fulfillment execution agent returned neither a tool call nor a parsed no-action decision.",
    );
  }

  return {
    status: "NO_ACTION",

    runId,

    reason: response.output_parsed.reason,
  };
}
