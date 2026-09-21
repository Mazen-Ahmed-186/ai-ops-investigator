import { runAgentInvestigation } from "../../src/ai/run-agent-investigation.js";
import { investigationEvalCases } from "./cases.js";
import { judgeInvestigationAssessment } from "./judge-assessment.js";

async function evaluate() {
  for (const evalCase of investigationEvalCases) {
    if (!evalCase.judge) {
      continue;
    }

    console.log(`\n=== ${evalCase.id} ===`);

    const result = await runAgentInvestigation(evalCase.orderId);

    if (result.status !== "COMPLETED") {
      console.log({
        status: result.status,
        judgeSkipped: true,
      });

      continue;
    }

    const judgment = await judgeInvestigationAssessment({
      assessment: result.assessment,
      referenceFacts: evalCase.judge.referenceFacts,
      criteria: evalCase.judge.criteria,
    });

    console.table(judgment.criteria);

    console.log({
      passed: judgment.passed,
    });
  }
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
