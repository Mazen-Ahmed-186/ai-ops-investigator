import type {
  AgentContextFact,
  AgentContextFactSource,
} from "./context-fact.js";
import { validateContextFact } from "./validate-context-fact.js";

function formatSource(source: AgentContextFactSource): string {
  switch (source.type) {
    case "TOOL":
      return `tool:${source.name}`;

    case "STORE":
      return `store:${source.name}`;

    case "RUNBOOK":
      return `runbook:${source.id}`;

    case "MODEL":
      return "model";
  }
}

function formatFact(fact: AgentContextFact): string {
  const validationReasons = validateContextFact(fact);

  if (validationReasons.length > 0) {
    throw new Error(
      `Invalid agent context fact: ${validationReasons.join(" ")}`,
    );
  }

  const metadata = [`[${fact.kind}]`, `[${formatSource(fact.source)}]`];

  if (fact.observedAt) {
    metadata.push(`[observedAt=${fact.observedAt}]`);
  }

  return `${metadata.join(" ")} ${fact.statement}`;
}

export function formatAgentContextFacts(facts: AgentContextFact[]): string {
  if (facts.length === 0) {
    return "No projected context facts are available.";
  }

  return facts.map((fact) => `- ${formatFact(fact)}`).join("\n");
}
