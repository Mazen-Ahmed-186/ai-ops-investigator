import { searchRunbooksSemantic } from "../../src/knowledge/search-runbooks-semantic.js";
import { retrievalEvalCases } from "./cases.js";

type EvalResult = {
  id: string;
  retrieved: Array<{
    id: string;
    score: number;
    relevant: boolean;
  }>;
  expectedIds: string[];
  recall: number;
  precision: number;
  reciprocalRank: number;
};

async function evaluate() {
  const results: EvalResult[] = [];

  for (const evalCase of retrievalEvalCases) {
    const retrieved = await searchRunbooksSemantic(
      evalCase.query,
      evalCase.limit,
    );

    const expected = new Set(evalCase.expectedRunbookIds);

    const retrievedIds = retrieved.map((result) => result.section.id);

    const relevantRetrieved = retrievedIds.filter((id) => expected.has(id));

    const recall = relevantRetrieved.length / expected.size;

    const precision =
      retrievedIds.length === 0
        ? 0
        : relevantRetrieved.length / retrievedIds.length;

    const firstRelevantIndex = retrievedIds.findIndex((id) => expected.has(id));

    const reciprocalRank =
      firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);

    results.push({
      id: evalCase.id,

      retrieved: retrieved.map((result) => ({
        id: result.section.id,
        score: result.score,
        relevant: expected.has(result.section.id),
      })),

      expectedIds: evalCase.expectedRunbookIds,

      recall,
      precision,
      reciprocalRank,
    });
  }

  for (const result of results) {
    console.log(result);
  }

  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  console.log("\nSemantic retrieval evaluation:");

  const relevantScores = results.flatMap((result) =>
    result.retrieved.filter((item) => item.relevant).map((item) => item.score),
  );

  const irrelevantScores = results.flatMap((result) =>
    result.retrieved.filter((item) => !item.relevant).map((item) => item.score),
  );

  console.log("\nScore separation:");

  console.log({
    relevant: {
      min: Math.min(...relevantScores),
      max: Math.max(...relevantScores),
    },

    irrelevant: {
      min: Math.min(...irrelevantScores),
      max: Math.max(...irrelevantScores),
    },
  });

  console.log({
    cases: results.length,

    meanRecall: average(results.map((result) => result.recall)),

    meanPrecision: average(results.map((result) => result.precision)),

    meanReciprocalRank: average(results.map((result) => result.reciprocalRank)),
  });
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
