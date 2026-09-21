import { describe, expect, it } from "vitest";

import { InMemoryTelemetrySink } from "../../../src/observability/in-memory-telemetry.js";

describe("InMemoryTelemetrySink", () => {
  it("records structured investigation telemetry", () => {
    const sink = new InMemoryTelemetrySink();

    sink.record({
      type: "TOOL_EXECUTION_COMPLETED",
      runId: "RUN-1",
      occurredAt: "2026-09-21T11:00:00.000Z",
      step: 1,
      toolName: "get_order",
      durationMs: 25,
      ok: true,
      errorCategory: null,
    });

    expect(sink.getEvents()).toEqual([
      {
        type: "TOOL_EXECUTION_COMPLETED",
        runId: "RUN-1",
        occurredAt: "2026-09-21T11:00:00.000Z",
        step: 1,
        toolName: "get_order",
        durationMs: 25,
        ok: true,
        errorCategory: null,
      },
    ]);
  });
});
