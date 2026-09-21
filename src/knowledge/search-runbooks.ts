import { runbookSections, type RunbookSection } from "./runbooks.js";

export type RunbookSearchResult = {
  section: RunbookSection;
  score: number;
};

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

export function searchRunbooks(
  query: string,
  limit = 2,
): RunbookSearchResult[] {
  const queryTokens = tokenize(query);

  return runbookSections
    .map((section) => {
      const documentTokens = tokenize(`${section.title} ${section.content}`);

      let score = 0;

      for (const token of queryTokens) {
        if (documentTokens.has(token)) {
          score += 1;
        }
      }

      return {
        section,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
