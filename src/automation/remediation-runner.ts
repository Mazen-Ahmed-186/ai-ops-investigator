export type AutomationRemediationRequest = {
  orderId: string;
  automationRunId: string;
  investigationRunId: string;
  remediationRunId: string;
};

export type AutomationRemediationResult = {
  status: "COMPLETED";
  remediationRunId: string;
};

export interface AutomationRemediationRunner {
  run(args: AutomationRemediationRequest): Promise<AutomationRemediationResult>;
}

export function createAutomationRemediationRunId(automationRunId: string) {
  return `REM-${automationRunId}`;
}
