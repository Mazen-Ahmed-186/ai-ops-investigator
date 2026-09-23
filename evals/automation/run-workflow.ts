import type { ActionApproval } from "../../src/actions/approval.js";
import { decideApproval } from "../../src/actions/approval-lifecycle.js";
import type { ApprovalStore } from "../../src/actions/approval-store.js";
import { InMemoryActionExecutionAuditStore } from "../../src/actions/in-memory-action-execution-audit-store.js";
import { InMemoryActionExecutionRepository } from "../../src/actions/in-memory-action-execution-repository.js";
import { createAutomationRun } from "../../src/automation/create-automation-run.js";
import { executeAutomationAction } from "../../src/automation/execute-automation-action.js";
import { InMemoryAutomationStore } from "../../src/automation/in-memory-automation-store.js";
import { resumeAutomationAfterApproval } from "../../src/automation/resume-automation-after-approval.js";
import { routeAutomationRemediationAction } from "../../src/automation/route-remediation-action.js";
import { transitionAutomationRun } from "../../src/automation/state-machine.js";
import { verifyAutomationAction } from "../../src/automation/verify-automation-action.js";
import { InMemoryRemediationStore } from "../../src/remediations/in-memory-remediation-store.js";
import {
  automationScenarios,
  type AutomationScenarioExpectedOutcome,
} from "./scenarios.js";

type ExpectedTerminalStatus = "COMPLETED" | "ESCALATED";

type WorkflowEvaluationResult = {
  scenario: string;
  expectedOutcome: AutomationScenarioExpectedOutcome;
  expectedTerminalStatus: ExpectedTerminalStatus;
  actualTerminalStatus: string;
  approvalCreated: boolean;
  approvalStatus: string | null;
  actionExecutions: number;
  passed: boolean;
  failure: string | null;
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

function expectedTerminalStatusFor(
  outcome: AutomationScenarioExpectedOutcome,
): ExpectedTerminalStatus {
  switch (outcome) {
    case "AUTO_EXECUTE":
    case "REQUIRE_APPROVAL":
      return "COMPLETED";

    case "ESCALATE":
      return "ESCALATED";
  }
}

function createExecutionRepository(
  scenarioId: string,
  orderId: string,
): InMemoryActionExecutionRepository {
  switch (scenarioId) {
    case "stale-completed-order":
      return new InMemoryActionExecutionRepository([
        {
          order: {
            id: orderId,
            status: "PROCESSING",
          },

          payments: [
            {
              status: "CAPTURED",
            },
          ],

          fulfillmentAttempts: [
            {
              id: `FUL-${orderId}-1`,
              status: "SUCCEEDED",
            },
          ],

          entitlements: [
            {
              status: "ACTIVE",
            },
          ],

          accountDeliveries: [
            {
              status: "DELIVERED",
            },
          ],

          notifications: [],

          refunds: [],

          refundAllowedByBusinessPolicy: true,
        },
      ]);

    case "notification-only-failure":
      return new InMemoryActionExecutionRepository([
        {
          order: {
            id: orderId,
            status: "FULFILLED",
          },

          payments: [
            {
              status: "CAPTURED",
            },
          ],

          fulfillmentAttempts: [
            {
              id: `FUL-${orderId}-1`,
              status: "SUCCEEDED",
            },
          ],

          entitlements: [
            {
              status: "ACTIVE",
            },
          ],

          accountDeliveries: [
            {
              status: "DELIVERED",
            },
          ],

          notifications: [
            {
              id: `NOT-${orderId}-FAILED`,
              status: "FAILED",
            },
          ],

          refunds: [],

          refundAllowedByBusinessPolicy: true,
        },
      ]);

    case "confirmed-fulfillment-failure":
      return new InMemoryActionExecutionRepository([
        {
          order: {
            id: orderId,
            status: "PROCESSING",
          },

          payments: [
            {
              status: "CAPTURED",
            },
          ],

          fulfillmentAttempts: [
            {
              id: `FUL-${orderId}-FAILED`,
              status: "CONFIRMED_FAILED",
            },
          ],

          entitlements: [],

          accountDeliveries: [],

          notifications: [],

          refunds: [],

          refundAllowedByBusinessPolicy: true,
        },
      ]);

    default:
      throw new Error(
        `Scenario ${scenarioId} unexpectedly reached action execution.`,
      );
  }
}

async function evaluateWorkflowScenario(
  scenario: (typeof automationScenarios)[number],
): Promise<WorkflowEvaluationResult> {
  const automationStore = new InMemoryAutomationStore();
  const remediationStore = new InMemoryRemediationStore();
  const approvalStore = new EvalApprovalStore();
  const auditStore = new InMemoryActionExecutionAuditStore();

  const remediation = structuredClone(scenario.remediation);

  const expectedTerminalStatus = expectedTerminalStatusFor(
    scenario.expected.outcome,
  );

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

  try {
    const routing = await routeAutomationRemediationAction({
      automationRunId: run.id,
      automationStore,
      remediationStore,
      approvalStore,
    });

    if (routing.status === "ESCALATED") {
      const finalRun = await automationStore.get(run.id);

      if (!finalRun) {
        throw new Error(
          `Automation ${run.id} disappeared after routing escalation.`,
        );
      }

      const approvals = await approvalStore.listByOrderId(run.orderId);

      const executions = await auditStore.listByOrderId(run.orderId);

      const passed =
        expectedTerminalStatus === "ESCALATED" &&
        finalRun.status === "ESCALATED" &&
        approvals.length === 0 &&
        executions.length === 0;

      return {
        scenario: scenario.id,
        expectedOutcome: scenario.expected.outcome,
        expectedTerminalStatus,
        actualTerminalStatus: finalRun.status,
        approvalCreated: false,
        approvalStatus: null,
        actionExecutions: executions.length,
        passed,
        failure: passed
          ? null
          : "Escalated workflow produced an unexpected approval or action execution.",
      };
    }

    if (routing.status === "WAITING_FOR_APPROVAL") {
      if (scenario.expected.outcome !== "REQUIRE_APPROVAL") {
        throw new Error(
          `Scenario ${scenario.id} unexpectedly required human approval.`,
        );
      }

      const pendingApproval = await approvalStore.get(routing.approvalId);

      if (!pendingApproval) {
        throw new Error(`Approval ${routing.approvalId} was not persisted.`);
      }

      const approved = decideApproval({
        approval: pendingApproval,
        decision: "APPROVE",
        decidedBy: "automation-eval-reviewer",
      });

      await approvalStore.save(approved);

      const resumed = await resumeAutomationAfterApproval({
        automationRunId: run.id,
        automationStore,
        remediationStore,
        approvalStore,
      });

      if (resumed.status !== "EXECUTION_READY") {
        throw new Error(
          `Scenario ${scenario.id} did not become execution-ready after approval; received ${resumed.status}.`,
        );
      }
    } else if (scenario.expected.outcome !== "AUTO_EXECUTE") {
      throw new Error(
        `Scenario ${scenario.id} unexpectedly became execution-ready without approval.`,
      );
    }

    const repository = createExecutionRepository(
      scenario.id,
      remediation.orderId,
    );

    const execution = await executeAutomationAction({
      automationRunId: run.id,
      automationStore,
      remediationStore,
      repository,
      auditStore,
      approvalStore,
    });

    if (execution.status !== "VERIFYING") {
      throw new Error(
        `Scenario ${scenario.id} did not reach VERIFYING after execution; received ${execution.status}.`,
      );
    }

    const verification = await verifyAutomationAction({
      automationRunId: run.id,
      automationStore,
      remediationStore,
      repository,
      auditStore,
    });

    const finalRun = await automationStore.get(run.id);

    if (!finalRun) {
      throw new Error(`Automation ${run.id} disappeared after verification.`);
    }

    const approvals = await approvalStore.listByOrderId(run.orderId);
    const approval = approvals[0] ?? null;

    const executions = await auditStore.listByOrderId(run.orderId);

    const approvalBehaviorCorrect =
      scenario.expected.outcome === "REQUIRE_APPROVAL"
        ? approvals.length === 1 &&
          approval?.status === "CONSUMED" &&
          finalRun.approvalId === approval.id
        : approvals.length === 0 && finalRun.approvalId === null;

    const executionBehaviorCorrect =
      executions.length === 1 &&
      finalRun.actionExecutionId === executions[0]?.id;

    const passed =
      expectedTerminalStatus === "COMPLETED" &&
      verification.status === "COMPLETED" &&
      finalRun.status === "COMPLETED" &&
      approvalBehaviorCorrect &&
      executionBehaviorCorrect;

    return {
      scenario: scenario.id,
      expectedOutcome: scenario.expected.outcome,
      expectedTerminalStatus,
      actualTerminalStatus: finalRun.status,
      approvalCreated: approval !== null,
      approvalStatus: approval?.status ?? null,
      actionExecutions: executions.length,
      passed,
      failure: passed
        ? null
        : "Workflow terminal state, approval lifecycle, or execution correlation was incorrect.",
    };
  } catch (error) {
    const persistedRun = await automationStore.get(run.id);

    const approvals = await approvalStore.listByOrderId(run.orderId);

    const approval = approvals[0] ?? null;

    const executions = await auditStore.listByOrderId(run.orderId);

    return {
      scenario: scenario.id,
      expectedOutcome: scenario.expected.outcome,
      expectedTerminalStatus,
      actualTerminalStatus: persistedRun?.status ?? "MISSING",
      approvalCreated: approval !== null,
      approvalStatus: approval?.status ?? null,
      actionExecutions: executions.length,
      passed: false,
      failure:
        error instanceof Error
          ? error.message
          : "Unknown workflow evaluation failure.",
    };
  }
}

const results: WorkflowEvaluationResult[] = [];

for (const scenario of automationScenarios) {
  results.push(await evaluateWorkflowScenario(scenario));
}

console.table(
  results.map((result) => ({
    scenario: result.scenario,

    expected: result.expectedTerminalStatus,

    actual: result.actualTerminalStatus,

    approval: result.approvalCreated ? result.approvalStatus : "-",

    executions: result.actionExecutions,

    passed: result.passed,
  })),
);

const passed = results.filter((result) => result.passed).length;

console.log(
  `\n${passed}/${results.length} full automation workflow scenarios passed`,
);

for (const result of results) {
  if (result.passed) {
    continue;
  }

  console.error(`\nFAILED: ${result.scenario}`);

  console.error({
    expectedOutcome: result.expectedOutcome,
    expectedTerminalStatus: result.expectedTerminalStatus,
    actualTerminalStatus: result.actualTerminalStatus,
    approvalCreated: result.approvalCreated,
    approvalStatus: result.approvalStatus,
    actionExecutions: result.actionExecutions,
    failure: result.failure,
  });
}

if (passed !== results.length) {
  throw new Error(
    `${results.length - passed} full automation workflow scenario(s) failed.`,
  );
}
