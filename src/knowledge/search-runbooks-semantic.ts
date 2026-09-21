import { openai } from "../ai/client.js";
import { runbookSections, type RunbookSection } from "./runbooks.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

export type SemanticRunbookSearchResult = {
  section: RunbookSection;
  score: number;
};

type EmbeddedRunbook = {
  section: RunbookSection;
  embedding: number[];
};

let corpusPromise: Promise<EmbeddedRunbook[]> | null = null;

function toEmbeddingText(section: RunbookSection) {
  return [section.title, section.content].join("\n");
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) {
    throw new Error("Embedding vectors must have equal dimensions.");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index];
    const bValue = b[index];

    if (aValue === undefined || bValue === undefined) {
      throw new Error("Embedding vector contained an invalid dimension.");
    }

    dotProduct += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function buildRunbookCorpus() {
  const inputs = runbookSections.map(toEmbeddingText);

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });

  return runbookSections.map((section, index) => {
    const embedding = response.data[index]?.embedding;

    if (!embedding) {
      throw new Error(`Missing embedding for runbook ${section.id}.`);
    }

    return {
      section,
      embedding,
    };
  });
}

async function getRunbookCorpus() {
  corpusPromise ??= buildRunbookCorpus();

  return corpusPromise;
}

export async function searchRunbooksSemantic(
  query: string,
  limit = 2,
): Promise<SemanticRunbookSearchResult[]> {
  const [corpus, queryResponse] = await Promise.all([
    getRunbookCorpus(),

    openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    }),
  ]);

  const queryEmbedding = queryResponse.data[0]?.embedding;

  if (!queryEmbedding) {
    throw new Error("Missing query embedding.");
  }

  return corpus
    .map((document) => ({
      section: document.section,
      score: cosineSimilarity(queryEmbedding, document.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
