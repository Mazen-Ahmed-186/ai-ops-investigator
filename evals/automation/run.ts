import { evaluateActionPolicy } from "../../src/actions/policy.js";
import { derivePrimaryAction } from "../../src/automation/derive-primary-action.js";
import {
  automationScenarios,
  type AutomationScenarioExpectedOutcome,
} from "./scenarios.js";

type AutomationScenarioResult = {
  id: string;
  expected: AutomationScenarioExpectedOutcome;
  actual: AutomationScenarioExpectedOutcome;
  actionKind: string | null;
  policyDecision: string | null;
  passed: boolean;
  reason: string | null;
};

function mapPolicyDecision(
  decision: ReturnType<typeof evaluateActionPolicy>["decision"],
): AutomationScenarioExpectedOutcome {
  switch (decision) {
    case "ALLOW":
      return "AUTO_EXECUTE";

    case "REQUIRE_APPROVAL":
      return "REQUIRE_APPROVAL";

    case "DENY":
      return "ESCALATE";
  }
}

function evaluateScenario(
  scenario: (typeof automationScenarios)[number],
): AutomationScenarioResult {
  const derivation = derivePrimaryAction(scenario.remediation);

  if (derivation.status === "ESCALATE") {
    const actual: AutomationScenarioExpectedOutcome = "ESCALATE";

    return {
      id: scenario.id,
      expected: scenario.expected.outcome,
      actual,
      actionKind: null,
      policyDecision: null,
      passed:
        actual === scenario.expected.outcome &&
        scenario.expected.actionKind === undefined,
      reason: derivation.reason,
    };
  }

  const policy = evaluateActionPolicy(derivation.action);

  const actual = mapPolicyDecision(policy.decision);

  const actionMatches =
    scenario.expected.actionKind === undefined ||
    scenario.expected.actionKind === derivation.action.kind;

  return {
    id: scenario.id,
    expected: scenario.expected.outcome,
    actual,
    actionKind: derivation.action.kind,
    policyDecision: policy.decision,
    passed: actual === scenario.expected.outcome && actionMatches,
    reason: policy.reason,
  };
}

const results = automationScenarios.map(evaluateScenario);

console.table(
  results.map((result) => ({
    scenario: result.id,
    expected: result.expected,
    actual: result.actual,
    action: result.actionKind ?? "-",
    policy: result.policyDecision ?? "-",
    passed: result.passed,
  })),
);

const passed = results.filter((result) => result.passed).length;

console.log(`\n${passed}/${results.length} automation scenarios passed`);

for (const result of results) {
  if (result.passed) {
    continue;
  }

  console.error(`\nFAILED: ${result.id}`);

  console.error({
    expected: result.expected,
    actual: result.actual,
    actionKind: result.actionKind,
    policyDecision: result.policyDecision,
    reason: result.reason,
  });
}

if (passed !== results.length) {
  throw new Error(`${results.length - passed} automation scenario(s) failed.`);
}
