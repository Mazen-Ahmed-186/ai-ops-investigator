import { zodTextFormat } from "openai/helpers/zod";

import { env } from "../config/env.js";
import { buildOrderInvestigationContext } from "../domain/investigation-context.js";
import { openai } from "./client.js";
import { IncidentAssessmentSchema } from "./schemas.js";

export async function runStructuredInvestigation(orderId: string) {
  const evidence = buildOrderInvestigationContext(orderId);

  const response = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    instructions: [
      "You are an operations investigator.",
      "Use only the supplied evidence.",
      "Do not invent application state.",
      "Treat deterministic findings as authoritative application findings.",
      "Classify the primary customer-facing incident.",
      "Use deterministic findings when explaining the incident, but do not reinterpret or override them.",
    ].join(" "),

    input: [
      `Investigate order ${orderId}.`,
      "",
      "Evidence:",
      JSON.stringify(evidence, null, 2),
    ].join("\n"),

    text: {
      format: zodTextFormat(IncidentAssessmentSchema, "incident_assessment"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("Model did not return a parsed incident assessment.");
  }

  return {
    assessment: response.output_parsed,
    deterministicFindings: evidence.deterministicFindings,
  };
}
