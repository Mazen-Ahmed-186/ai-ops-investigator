import { describe, expect, it } from "vitest";

import { validateRemediationGrounding } from "../../../src/ai/validate-remediation-grounding.js";

describe("validateRemediationGrounding", () => {
  it("accepts actions citing retrieved runbooks", () => {
    expect(() =>
      validateRemediationGrounding(
        {
          status: "RECOMMENDATION_READY",
          summary: "Reconcile the stale order state.",
          actions: [
            {
              instruction: "Re-read the current order state.",
              supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
            },
          ],
        },
        [
          {
            id: "RUNBOOK-DB-TIMEOUT",
          },
        ],
      ),
    ).not.toThrow();
  });

  it("rejects citations to unretrieved runbooks", () => {
    expect(() =>
      validateRemediationGrounding(
        {
          status: "RECOMMENDATION_READY",
          summary: "Reconcile the stale order state.",
          actions: [
            {
              instruction: "Perform an unsupported action.",
              supportedByRunbookIds: ["RUNBOOK-DOES-NOT-EXIST"],
            },
          ],
        },
        [
          {
            id: "RUNBOOK-DB-TIMEOUT",
          },
        ],
      ),
    ).toThrow(
      "Remediation action referenced unretrieved runbook RUNBOOK-DOES-NOT-EXIST.",
    );
  });

  it("rejects actions when no applicable runbook exists", () => {
    expect(() =>
      validateRemediationGrounding(
        {
          status: "NO_APPLICABLE_RUNBOOK",
          summary: "No supported remediation was found.",
          actions: [
            {
              instruction: "Do something anyway.",
              supportedByRunbookIds: ["RUNBOOK-DB-TIMEOUT"],
            },
          ],
        },
        [
          {
            id: "RUNBOOK-DB-TIMEOUT",
          },
        ],
      ),
    ).toThrow("NO_APPLICABLE_RUNBOOK cannot contain remediation actions.");
  });
});
