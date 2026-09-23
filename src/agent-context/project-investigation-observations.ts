import type { InvestigationRunState } from "../investigations/types.js";
import type { AgentContextFact } from "./context-fact.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(record: JsonRecord, key: string): string | null {
  const value = record[key];

  return typeof value === "string" ? value : null;
}

function createObservation(args: {
  tool: string;
  observedAt: string;
  statement: string;
}): AgentContextFact {
  return {
    kind: "OBSERVATION",

    statement: args.statement,

    source: {
      type: "TOOL",
      name: args.tool,
    },

    observedAt: args.observedAt,
  };
}

function projectOrderObservation(args: {
  tool: string;
  data: JsonRecord;
  observedAt: string;
}): AgentContextFact[] {
  const order = asRecord(args.data.order);

  if (!order) {
    return [];
  }

  const id = readString(order, "id");
  const status = readString(order, "status");

  if (!id || !status) {
    return [];
  }

  return [
    createObservation({
      tool: args.tool,
      observedAt: args.observedAt,
      statement: `Order ${id} status is ${status}.`,
    }),
  ];
}

function projectCollectionStatuses(args: {
  tool: string;
  data: JsonRecord;
  observedAt: string;
  collectionKey: string;
  entityLabel: string;
}): AgentContextFact[] {
  return asArray(args.data[args.collectionKey]).flatMap((value, index) => {
    const record = asRecord(value);

    if (!record) {
      return [];
    }

    const status = readString(record, "status");

    if (!status) {
      return [];
    }

    const id = readString(record, "id");

    const identifier = id ?? String(index + 1);

    return [
      createObservation({
        tool: args.tool,

        observedAt: args.observedAt,

        statement: `${args.entityLabel} ${identifier} status is ${status}.`,
      }),
    ];
  });
}

function projectToolExecution(
  execution: InvestigationRunState["toolExecutions"][number],
): AgentContextFact[] {
  const result = asRecord(execution.result);

  if (!result || result.ok !== true) {
    return [];
  }

  const data = asRecord(result.data);

  if (!data) {
    return [];
  }

  const observedAt = readString(data, "observedAt");

  if (!observedAt) {
    return [];
  }

  switch (execution.tool) {
    case "get_order":
      return projectOrderObservation({
        tool: execution.tool,
        data,
        observedAt,
      });

    case "get_payment_state":
      return projectCollectionStatuses({
        tool: execution.tool,
        data,
        observedAt,
        collectionKey: "payments",
        entityLabel: "Payment",
      });

    case "get_fulfillment_attempts":
      return projectCollectionStatuses({
        tool: execution.tool,
        data,
        observedAt,
        collectionKey: "attempts",
        entityLabel: "Fulfillment attempt",
      });

    case "get_delivery_state":
      return [
        ...projectCollectionStatuses({
          tool: execution.tool,
          data,
          observedAt,
          collectionKey: "entitlements",
          entityLabel: "Entitlement",
        }),

        ...projectCollectionStatuses({
          tool: execution.tool,
          data,
          observedAt,
          collectionKey: "accountDeliveries",
          entityLabel: "Account delivery",
        }),
      ];

    case "get_order_event_history":
      return projectEventHistory({
        tool: execution.tool,
        data,
        observedAt,
      });

    case "get_order_processing_trace":
      return projectProcessingTrace({
        tool: execution.tool,
        data,
        observedAt,
      });

    case "get_notification_state":
      return projectCollectionStatuses({
        tool: execution.tool,
        data,
        observedAt,
        collectionKey: "notifications",
        entityLabel: "Notification",
      });

    default:
      return [];
  }
}

function projectEventHistory(args: {
  tool: string;
  data: JsonRecord;
  observedAt: string;
}): AgentContextFact[] {
  return asArray(args.data.events).flatMap((value) => {
    const event = asRecord(value);

    if (!event) {
      return [];
    }

    const id = readString(event, "id");

    const type = readString(event, "type");

    const occurredAt = readString(event, "occurredAt");

    if (!id || !type || !occurredAt) {
      return [];
    }

    return [
      createObservation({
        tool: args.tool,

        observedAt: args.observedAt,

        statement: `Order event ${id} recorded ${type} at ${occurredAt}.`,
      }),
    ];
  });
}

function projectProcessingTrace(args: {
  tool: string;
  data: JsonRecord;
  observedAt: string;
}): AgentContextFact[] {
  return asArray(args.data.entries).flatMap((value) => {
    const entry = asRecord(value);

    if (!entry) {
      return [];
    }

    const id = readString(entry, "id");

    const component = readString(entry, "component");

    const event = readString(entry, "event");

    const occurredAt = readString(entry, "occurredAt");

    const detail = readString(entry, "detail");

    if (!id || !component || !event || !occurredAt) {
      return [];
    }

    const detailSuffix = detail ? ` Detail: ${detail}` : "";

    return [
      createObservation({
        tool: args.tool,

        observedAt: args.observedAt,

        statement: `Processing trace ${id} from ${component} recorded ${event} at ${occurredAt}.${detailSuffix}`,
      }),
    ];
  });
}

export function projectInvestigationObservationFacts(
  state: Pick<InvestigationRunState, "toolExecutions">,
): AgentContextFact[] {
  return state.toolExecutions.flatMap(projectToolExecution);
}
