import { env } from "../config/env.js";
import { openai } from "./client.js";

export async function runBaselineInvestigation() {
  const response = await openai.responses.create({
    model: env.OPENAI_MODEL,
    instructions: [
      "You are an operations investigator.",
      "Use only information actually provided to you.",
      "Do not invent application state or claim access to systems you have not been given.",
      "If there is insufficient evidence, state what information is missing.",
    ].join(" "),
    input: "Why is order ORD-1001 stuck?",
  });

  return response.output_text;
}
