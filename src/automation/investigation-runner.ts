export type AutomationInvestigationResult =
  | {
      status: "DIAGNOSIS_READY";
      investigationRunId: string;
    }
  | {
      status: "NEEDS_MORE_EVIDENCE";
      investigationRunId: string;
    };

export type AutomationInvestigationRequest = {
  orderId: string;
  automationRunId: string;
  investigationRunId: string;
};

export interface AutomationInvestigationRunner {
  run(
    args: AutomationInvestigationRequest,
  ): Promise<AutomationInvestigationResult>;
}

export function createAutomationInvestigationRunId(automationRunId: string) {
  return `INV-${automationRunId}`;
}
