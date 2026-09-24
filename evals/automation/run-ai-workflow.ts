import { evaluateAiWorkflow } from "./evaluate-ai-workflow.js";

console.log("\n=== AI → safe action workflow ===\n");

const result = await evaluateAiWorkflow();

console.log("\nAI → safe action workflow passed\n");

console.table([
  {
    diagnosis: result.diagnosis,
    toolCalls: result.toolCalls,
    primaryAction: result.primaryAction,
    approvalCount: result.approvalCount,
    executionCount: result.executionCount,
    effect: result.effect,
    verification: result.verificationStatus,
    automation: result.automationStatus,
  },
]);
