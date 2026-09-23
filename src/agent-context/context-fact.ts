export type AgentContextFactKind =
  | "OBSERVATION"
  | "DURABLE_FACT"
  | "KNOWLEDGE"
  | "INFERENCE";

export type AgentContextFactSource =
  | {
      type: "TOOL";
      name: string;
    }
  | {
      type: "STORE";
      name: string;
    }
  | {
      type: "RUNBOOK";
      id: string;
    }
  | {
      type: "MODEL";
    };

export type AgentContextFact = {
  kind: AgentContextFactKind;
  statement: string;
  source: AgentContextFactSource;
  observedAt: string | null;
};
