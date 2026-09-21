import type { InvestigationTelemetryEvent, TelemetrySink } from "./events.js";

export class InMemoryTelemetrySink implements TelemetrySink {
  private readonly events: InvestigationTelemetryEvent[] = [];

  record(event: InvestigationTelemetryEvent) {
    this.events.push(event);
  }

  getEvents() {
    return [...this.events];
  }
}
