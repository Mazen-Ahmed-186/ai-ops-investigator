import { zodTextFormat } from "openai/helpers/zod";

import { env } from "../config/env.js";
import { executeRegisteredTool, modelTools } from "../tools/registry.js";
import { openai } from "./client.js";
import { IncidentAssessmentSchema } from "./schemas.js";

export async function runToolInvestigation(orderId: string) {
  const instructions = [
    "You are an operations investigator.",
    "Use only information provided by the user or returned by tools.",
    "Do not invent application state.",
    "Use available tools when application state is required.",
    "Prefer gathering relevant evidence before reaching a diagnosis.",
    "If another available unqueried tool can materially reduce uncertainty, use it.",
    "Do not repeat the same tool call with the same arguments unless its prior result explicitly indicates that retrying is appropriate.",
    "If available evidence remains insufficient, return UNKNOWN and require more evidence.",
  ].join(" ");

  const firstResponse = await openai.responses.parse({
    model: env.OPENAI_MODEL,
    instructions,
    input: `Why is order ${orderId} stuck?`,
    tools: modelTools,
    parallel_tool_calls: false,
    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (firstResponse.status !== "completed") {
    throw new Error(
      `First model response did not complete: ${firstResponse.status}`,
    );
  }

  const firstToolCall = firstResponse.output.find(
    (item) => item.type === "function_call",
  );

  if (!firstToolCall) {
    if (firstResponse.output_parsed) {
      return firstResponse.output_parsed;
    }

    throw new Error(
      "First response contained neither a tool call nor an assessment.",
    );
  }

  console.log("Step 1 — model requested:", {
    name: firstToolCall.name,
    arguments: firstToolCall.parsed_arguments,
  });

  const firstToolResult = executeRegisteredTool(
    firstToolCall.name,
    firstToolCall.parsed_arguments,
  );

  console.log("Step 1 — tool result:", firstToolResult);

  const secondResponse = await openai.responses.parse({
    model: env.OPENAI_MODEL,
    instructions,
    previous_response_id: firstResponse.id,
    input: [
      {
        type: "function_call_output",
        call_id: firstToolCall.call_id,
        output: JSON.stringify(firstToolResult),
      },
    ],
    tools: modelTools,
    parallel_tool_calls: false,
    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (secondResponse.status !== "completed") {
    throw new Error(
      `Second model response did not complete: ${secondResponse.status}`,
    );
  }

  const secondToolCall = secondResponse.output.find(
    (item) => item.type === "function_call",
  );

  if (!secondToolCall) {
    if (!secondResponse.output_parsed) {
      throw new Error(
        "Second response contained neither a tool call nor an assessment.",
      );
    }

    return secondResponse.output_parsed;
  }

  console.log("Step 2 — model requested:", {
    name: secondToolCall.name,
    arguments: secondToolCall.parsed_arguments,
  });

  const secondToolResult = executeRegisteredTool(
    secondToolCall.name,
    secondToolCall.parsed_arguments,
  );

  console.log("Step 2 — tool result:", secondToolResult);

  const finalResponse = await openai.responses.parse({
    model: env.OPENAI_MODEL,
    instructions,
    previous_response_id: secondResponse.id,
    input: [
      {
        type: "function_call_output",
        call_id: secondToolCall.call_id,
        output: JSON.stringify(secondToolResult),
      },
    ],
    tools: modelTools,
    parallel_tool_calls: false,
    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (finalResponse.status !== "completed") {
    throw new Error(
      `Final model response did not complete: ${finalResponse.status}`,
    );
  }

  const unexpectedToolCall = finalResponse.output.find(
    (item) => item.type === "function_call",
  );

  if (unexpectedToolCall) {
    throw new Error(
      `Manual investigation exceeded two tool calls. Model requested ${unexpectedToolCall.name}.`,
    );
  }

  if (!finalResponse.output_parsed) {
    throw new Error("Model did not return a final incident assessment.");
  }

  return finalResponse.output_parsed;
}
