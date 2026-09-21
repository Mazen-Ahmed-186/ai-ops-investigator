import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import { openai } from "../ai/client.js";
import { env } from "../config/env.js";
import type { SemanticRunbookSearchResult } from "./search-runbooks-semantic.js";

const RunbookRerankingSchema = z.object({
  selectedRunbookIds: z.array(z.string()),
});

export type RerankedRunbookResult = {
  section: SemanticRunbookSearchResult["section"];
  score: number;
};

export async function rerankRunbooks(
  query: string,
  candidates: SemanticRunbookSearchResult[],
): Promise<RerankedRunbookResult[]> {
  if (candidates.length === 0) {
    return [];
  }

  const response = await openai.responses.parse({
    model: env.OPENAI_MODEL,

    instructions: [
      "You are a relevance classifier for operational runbooks.",
      "Select only runbooks that are directly applicable to the supplied query.",
      "A runbook sharing terminology is not enough; its operational condition must actually match.",
      "Do not select a runbook for an unknown outcome when the query explicitly says the outcome succeeded.",
      "Do not select unrelated runbooks merely because they mention fulfillment, retries, timeouts, delivery, or orders.",
      "Return only IDs from the provided candidates.",
      "If none are directly applicable, return an empty array.",
    ].join(" "),

    input: JSON.stringify({
      query,

      candidates: candidates.map((candidate) => ({
        id: candidate.section.id,
        title: candidate.section.title,
        content: candidate.section.content,
      })),
    }),

    text: {
      format: zodTextFormat(RunbookRerankingSchema, "runbook_reranking"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("Model did not return runbook reranking.");
  }

  const candidateIds = new Set(
    candidates.map((candidate) => candidate.section.id),
  );

  for (const id of response.output_parsed.selectedRunbookIds) {
    if (!candidateIds.has(id)) {
      throw new Error(`Reranker selected non-candidate runbook ${id}.`);
    }
  }

  const selectedIds = new Set(response.output_parsed.selectedRunbookIds);

  return candidates.filter((candidate) =>
    selectedIds.has(candidate.section.id),
  );
}
