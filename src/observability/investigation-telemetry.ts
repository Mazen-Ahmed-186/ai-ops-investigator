import type { TelemetrySink } from "./events.js";

export type InvestigationTelemetry = {
  sink: TelemetrySink | undefined;
  startedAtMs: number;
};

export function createInvestigationTelemetry(
  sink?: TelemetrySink,
): InvestigationTelemetry {
  return {
    sink,
    startedAtMs: performance.now(),
  };
}

export function durationSince(startedAtMs: number) {
  return Math.round(performance.now() - startedAtMs);
}

export function occurredAt() {
  return new Date().toISOString();
}
