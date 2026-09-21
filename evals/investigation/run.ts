import { investigationEvalCases } from "./cases.js";
import { evaluateInvestigationCase } from "./evaluate-case.js";

async function evaluate() {
  for (const evalCase of investigationEvalCases) {
    console.log(`\n=== ${evalCase.id} ===`);

    const result = await evaluateInvestigationCase(evalCase);

    console.table(result.checks);

    const passed = result.checks.filter((check) => check.passed).length;

    console.log(`${passed}/${result.checks.length} checks passed`);
  }
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
