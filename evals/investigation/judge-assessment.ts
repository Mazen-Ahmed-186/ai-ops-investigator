import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import { openai } from "../../src/ai/client.js";
import { env } from "../../src/config/env.js";
import type { IncidentAssessment } from "../../src/ai/schemas.js";
import type { InvestigationJudgeCriterion } from "./cases.js";

const JudgeResultSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      explanation: z.string(),
    }),
  ),
});

export type InvestigationJudgeResult = {
  passed: boolean;

  criteria: Array<{
    id: string;
    passed: boolean;
    explanation: string;
  }>;
};

export async function judgeInvestigationAssessment(args: {
  assessment: IncidentAssessment;
  referenceFacts: string[];
  criteria: InvestigationJudgeCriterion[];
}): Promise<InvestigationJudgeResult> {
  const response = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    instructions: [
      "You are evaluating an operational incident diagnosis.",
      "Judge only the supplied criteria.",
      "Use the reference facts as the factual ground truth.",
      "Do not reward style, verbosity, or wording.",
      "Do not require exact phrasing.",
      "A criterion passes only when the assessment semantically satisfies it.",
      "Do not invent additional requirements.",
    ].join(" "),

    input: JSON.stringify({
      referenceFacts: args.referenceFacts,

      criteria: args.criteria,

      assessment: args.assessment,
    }),

    text: {
      format: zodTextFormat(JudgeResultSchema, "investigation_judge"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("Judge did not return a result.");
  }

  const expectedIds = new Set(args.criteria.map((criterion) => criterion.id));

  const returnedIds = response.output_parsed.criteria.map(
    (criterion) => criterion.id,
  );

  if (returnedIds.length !== expectedIds.size) {
    throw new Error("Judge returned an unexpected number of criteria.");
  }

  for (const id of returnedIds) {
    if (!expectedIds.has(id)) {
      throw new Error(`Judge returned unknown criterion ${id}.`);
    }
  }

  return {
    passed: response.output_parsed.criteria.every(
      (criterion) => criterion.passed,
    ),

    criteria: response.output_parsed.criteria,
  };
}
