import { zodTextFormat } from "openai/helpers/zod";

import { env } from "../config/env.js";
import { executeGetOrder, getOrderTool } from "../tools/get-order.tool.js";
import { openai } from "./client.js";
import { IncidentAssessmentSchema } from "./schemas.js";

export async function runToolInvestigation(orderId: string) {
  const firstResponse = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    instructions: [
      "You are an operations investigator.",
      "Use only information provided by the user or returned by tools.",
      "Do not invent application state.",
      "Use available tools when application state is required.",
      "If the available evidence is insufficient to determine the incident, say so through the structured assessment.",
    ].join(" "),

    input: `Why is order ${orderId} stuck?`,

    tools: [getOrderTool],

    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (firstResponse.status !== "completed") {
    throw new Error(`Model response did not complete: ${firstResponse.status}`);
  }

  const toolCall = firstResponse.output.find(
    (item) => item.type === "function_call",
  );

  if (!toolCall || toolCall.type !== "function_call") {
    throw new Error("Expected the model to request a tool call.");
  }

  if (toolCall.name !== "get_order") {
    throw new Error(`Unexpected tool requested: ${toolCall.name}`);
  }

  console.log("Model requested tool:", {
    name: toolCall.name,
    arguments: toolCall.parsed_arguments,
  });

  const toolResult = executeGetOrder(toolCall.parsed_arguments);

  console.log("Tool result:", toolResult);

  const finalResponse = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    previous_response_id: firstResponse.id,

    input: [
      {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(toolResult),
      },
    ],

    tools: [getOrderTool],

    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (!finalResponse.output_parsed) {
    throw new Error("Model did not return a parsed incident assessment.");
  }

  return finalResponse.output_parsed;
}
