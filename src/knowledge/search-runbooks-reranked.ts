import { rerankRunbooks } from "./rerank-runbooks.js";
import { searchRunbooksSemantic } from "./search-runbooks-semantic.js";

export async function searchRunbooksReranked(query: string) {
  const candidates = await searchRunbooksSemantic(query, 3);

  return rerankRunbooks(query, candidates);
}
