import { searchRunbooks } from "../../src/knowledge/search-runbooks.js";
import { retrievalEvalCases } from "./cases.js";

type EvalResult = {
  id: string;
  retrievedIds: string[];
  expectedIds: string[];
  recall: number;
  precision: number;
  reciprocalRank: number;
};

const results: EvalResult[] = retrievalEvalCases.map((evalCase) => {
  const retrieved = searchRunbooks(evalCase.query, evalCase.limit);

  const retrievedIds = retrieved.map((result) => result.section.id);

  const expected = new Set(evalCase.expectedRunbookIds);

  const relevantRetrieved = retrievedIds.filter((id) => expected.has(id));

  const recall = relevantRetrieved.length / expected.size;

  const precision =
    retrievedIds.length === 0
      ? 0
      : relevantRetrieved.length / retrievedIds.length;

  const firstRelevantIndex = retrievedIds.findIndex((id) => expected.has(id));

  const reciprocalRank =
    firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);

  return {
    id: evalCase.id,
    retrievedIds,
    expectedIds: evalCase.expectedRunbookIds,
    recall,
    precision,
    reciprocalRank,
  };
});

for (const result of results) {
  console.log(result);
}

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

console.log("\nRetrieval evaluation:");

console.log({
  cases: results.length,

  meanRecall: average(results.map((result) => result.recall)),

  meanPrecision: average(results.map((result) => result.precision)),

  meanReciprocalRank: average(results.map((result) => result.reciprocalRank)),
});
