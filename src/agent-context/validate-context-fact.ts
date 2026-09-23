import type { AgentContextFact } from "./context-fact.js";

export function validateContextFact(fact: AgentContextFact): string[] {
  const reasons: string[] = [];

  if (!fact.statement.trim()) {
    reasons.push("Context fact statement must not be empty.");
  }

  if (fact.kind === "OBSERVATION" && !fact.observedAt) {
    reasons.push("Observed context facts require an observation timestamp.");
  }

  if (fact.kind === "KNOWLEDGE" && fact.source.type !== "RUNBOOK") {
    reasons.push("Knowledge context facts must reference a runbook source.");
  }

  if (fact.kind === "INFERENCE" && fact.source.type !== "MODEL") {
    reasons.push(
      "Inference context facts must identify the model as their source.",
    );
  }

  return reasons;
}
