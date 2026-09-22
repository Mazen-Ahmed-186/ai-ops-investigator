import type { ActionApproval } from "../../src/actions/approval.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";
import {
  automationScenarios,
  type AutomationScenarioExpectedOutcome,
} from "./scenarios.js";

type ExpectedAutomationStatus =
  | "EXECUTING"
  | "WAITING_FOR_APPROVAL"
  | "ESCALATED";

type RoutingEvaluationResult = {
  scenario: string;
  expectedOutcome: AutomationScenarioExpectedOutcome;
  expectedStatus: ExpectedAutomationStatus;
  actualStatus: string;
  approvalCreated: boolean;
  approvalStatus: string | null;
  passed: boolean;
};

class EvalApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ActionApproval>();

  async save(approval: ActionApproval) {
    this.approvals.set(approval.id, structuredClone(approval));
  }

  async get(approvalId: string) {
    const approval = this.approvals.get(approvalId);

    return approval ? structuredClone(approval) : null;
  }

  async listByOrderId(orderId: string) {
    return [...this.approvals.values()]
      .filter((approval) => approval.action.orderId === orderId)
      .map((approval) => structuredClone(approval));
  }
}

function expectedStatusFor(
  outcome: AutomationScenarioExpectedOutcome,
): ExpectedAutomationStatus {
  switch (outcome) {
    case "AUTO_EXECUTE":
      return "EXECUTING";

    case "REQUIRE_APPROVAL":
      return "WAITING_FOR_APPROVAL";

    case "ESCALATE":
      return "ESCALATED";
  }
}

async function evaluateRoutingScenario(
  scenario: (typeof automationScenarios)[number],
): Promise<RoutingEvaluationResult> {
  const automationStore = new InMemoryAutomationStore();

  const remediationStore = new InMemoryRemediationStore();

  const approvalStore = new EvalApprovalStore();

  const remediation = structuredClone(scenario.remediation);

  let run = createAutomationRun({
    id: remediation.automationRunId,

    orderId: remediation.orderId,
  });

  run = transitionAutomationRun(run, "INVESTIGATING");

  run = {
    ...run,

    investigationRunId: remediation.investigationRunId,
  };

  run = transitionAutomationRun(run, "PLANNING_REMEDIATION");

  run = {
    ...run,

    remediationRunId: remediation.id,
  };

  await automationStore.save(run);

  await remediationStore.save(remediation);

  await routeAutomationRemediationAction({
    automationRunId: run.id,

    automationStore,

    remediationStore,

    approvalStore,
  });

  const routedRun = await automationStore.get(run.id);

  if (!routedRun) {
    throw new Error(
      `Automation ${run.id} disappeared during routing evaluation.`,
    );
  }

  const approvals = await approvalStore.listByOrderId(run.orderId);

  const approval = approvals[0] ?? null;

  const expectedStatus = expectedStatusFor(scenario.expected.outcome);

  const expectedApproval = scenario.expected.outcome === "REQUIRE_APPROVAL";

  const approvalBehaviorCorrect = expectedApproval
    ? approvals.length === 1 &&
      approval?.status === "PENDING" &&
      routedRun.approvalId === approval.id
    : approvals.length === 0 && routedRun.approvalId === null;

  return {
    scenario: scenario.id,

    expectedOutcome: scenario.expected.outcome,

    expectedStatus,

    actualStatus: routedRun.status,

    approvalCreated: approval !== null,

    approvalStatus: approval?.status ?? null,

    passed: routedRun.status === expectedStatus && approvalBehaviorCorrect,
  };
}

const results: RoutingEvaluationResult[] = [];

for (const scenario of automationScenarios) {
  results.push(await evaluateRoutingScenario(scenario));
}

console.table(
  results.map((result) => ({
    scenario: result.scenario,

    expected: result.expectedStatus,

    actual: result.actualStatus,

    approval: result.approvalCreated ? result.approvalStatus : "-",

    passed: result.passed,
  })),
);

const passed = results.filter((result) => result.passed).length;

console.log(
  `\n${passed}/${results.length} automation routing scenarios passed`,
);

for (const result of results) {
  if (result.passed) {
    continue;
  }

  console.error(`\nFAILED: ${result.scenario}`);

  console.error({
    expectedStatus: result.expectedStatus,

    actualStatus: result.actualStatus,

    approvalCreated: result.approvalCreated,

    approvalStatus: result.approvalStatus,
  });
}

if (passed !== results.length) {
  throw new Error(
    `${results.length - passed} automation routing scenario(s) failed.`,
  );
}
