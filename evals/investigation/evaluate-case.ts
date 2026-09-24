import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import type { InvestigationEvalCase } from "./cases.js";

type InvestigationRunResult = Awaited<ReturnType<typeof runAgentInvestigation>>;

export type InvestigationCheckResult = {
  name: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
};

export type InvestigationCaseResult = {
  caseId: string;
  passed: boolean;
  checks: InvestigationCheckResult[];
  toolCalls: number | null;
  rootCauseCategory: string | null;
};

export function evaluateInvestigationResult(
  evalCase: InvestigationEvalCase,
  result: InvestigationRunResult,
): InvestigationCaseResult {
  const checks: InvestigationCheckResult[] = [
    {
      name: "completed",
      passed: result.status === "COMPLETED",
      actual: result.status,
      expected: "COMPLETED",
    },
  ];

  if (result.status !== "COMPLETED") {
    return {
      caseId: evalCase.id,
      passed: false,
      checks,
      toolCalls: null,
      rootCauseCategory: null,
    };
  }

  const assessment = result.assessment;

  checks.push({
    name: "diagnosis status",
    passed:
      assessment.diagnosisStatus === evalCase.expectations.diagnosisStatus,
    actual: assessment.diagnosisStatus,
    expected: evalCase.expectations.diagnosisStatus,
  });

  if (evalCase.expectations.rootCauseCategory) {
    checks.push({
      name: "root cause category",
      passed:
        assessment.rootCauseCategory ===
        evalCase.expectations.rootCauseCategory,
      actual: assessment.rootCauseCategory,
      expected: evalCase.expectations.rootCauseCategory,
    });
  }

  for (const category of evalCase.expectations.requiredFindingCategories ??
    []) {
    checks.push({
      name: `contains ${category} finding`,
      passed: assessment.findings.some(
        (finding) => finding.category === category,
      ),
      expected: true,
    });
  }

  const forbidden = evalCase.expectations.forbiddenRootCauseCategories ?? [];

  checks.push({
    name: "root cause is not a known symptom",
    passed: !forbidden.includes(assessment.rootCauseCategory),
    actual: assessment.rootCauseCategory,
    expected:
      forbidden.length > 0 ? `not one of ${forbidden.join(", ")}` : undefined,
  });

  if (evalCase.expectations.maxToolCalls !== undefined) {
    checks.push({
      name: "tool-call budget",
      passed: result.toolCalls <= evalCase.expectations.maxToolCalls,
      actual: result.toolCalls,
      expected: `<= ${evalCase.expectations.maxToolCalls}`,
    });
  }

  return {
    caseId: evalCase.id,
    passed: checks.every((check) => check.passed),
    checks,
    toolCalls: result.toolCalls,
    rootCauseCategory: assessment.rootCauseCategory,
  };
}

export async function evaluateInvestigationCase(
  evalCase: InvestigationEvalCase,
): Promise<InvestigationCaseResult> {
  const result = await runAgentInvestigation(evalCase.orderId);

  return evaluateInvestigationResult(evalCase, result);
}
