import { investigationEvalCases } from "./cases.js";
import { evaluateInvestigationCase } from "./evaluate-case.js";

const TRIALS = 5;

async function evaluate() {
  for (const evalCase of investigationEvalCases) {
    const results = [];

    console.log(`\n=== ${evalCase.id} ===`);

    for (let trial = 1; trial <= TRIALS; trial += 1) {
      console.log(`\nTrial ${trial}/${TRIALS}`);

      const result = await evaluateInvestigationCase(evalCase);

      results.push(result);

      console.log({
        passed: result.passed,
        rootCauseCategory: result.rootCauseCategory,
        toolCalls: result.toolCalls,
      });
    }

    const passed = results.filter((result) => result.passed).length;

    const toolCalls = results
      .map((result) => result.toolCalls)
      .filter((value): value is number => value !== null);

    const averageToolCalls =
      toolCalls.length === 0
        ? null
        : toolCalls.reduce((sum, value) => sum + value, 0) / toolCalls.length;

    const rootCauseCounts = results.reduce<Record<string, number>>(
      (counts, result) => {
        const category = result.rootCauseCategory ?? "UNKNOWN";

        counts[category] = (counts[category] ?? 0) + 1;

        return counts;
      },
      {},
    );

    console.log("\nRepeated evaluation:");

    console.log({
      caseId: evalCase.id,
      trials: TRIALS,
      passed,
      passRate: passed / TRIALS,
      averageToolCalls,
      rootCauseCounts,
    });
  }
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
