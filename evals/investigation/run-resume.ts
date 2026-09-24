import { randomUUID } from "node:crypto";

import {
  resumeAgentInvestigation,
  runAgentInvestigation,
} from "../../src/ai/run-agent-investigation.js";
import { FileInvestigationStore } from "../../src/investigations/file-investigation-store.js";
import { investigationEvalCases } from "./cases.js";
import {
  evaluateInvestigationResult,
  type InvestigationCheckResult,
} from "./evaluate-case.js";

const crashAfterToolCalls = 3;

async function evaluate() {
  for (const evalCase of investigationEvalCases) {
    const runId = `EVAL-RESUME-${randomUUID()}`;

    console.log(`\n=== ${evalCase.id} crash/resume ===`);

    let crashObserved = false;

    try {
      await runAgentInvestigation(evalCase.orderId, {
        runId,
        simulateCrashAfterToolCalls: crashAfterToolCalls,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "SimulatedCrashError") {
        crashObserved = true;
      } else {
        throw error;
      }
    }

    const store = new FileInvestigationStore();

    const crashedState = await store.get(runId);

    if (!crashedState) {
      throw new Error(
        `Investigation ${runId} was not persisted before the crash.`,
      );
    }

    const preCrashSignatures = [...crashedState.executedToolCallSignatures];

    const preCrashTools = crashedState.toolExecutions.map(
      (execution) => execution.tool,
    );

    const recoveryChecks: InvestigationCheckResult[] = [
      {
        name: "simulated crash observed",
        passed: crashObserved,
        actual: crashObserved,
        expected: true,
      },

      {
        name: "crash state remained resumable",
        passed: crashedState.status === "RUNNING",
        actual: crashedState.status,
        expected: "RUNNING",
      },

      {
        name: "expected pre-crash tool count persisted",
        passed: crashedState.toolCalls === crashAfterToolCalls,
        actual: crashedState.toolCalls,
        expected: crashAfterToolCalls,
      },

      {
        name: "provider continuation existed before crash",
        passed:
          crashedState.continuation?.kind === "TOOL_OUTPUT" &&
          crashedState.continuation.previousResponseId.length > 0,
        actual:
          crashedState.continuation?.kind === "TOOL_OUTPUT"
            ? "present"
            : "missing",
        expected: "present",
      },
    ];

    console.log("\nPersisted before resume:");

    console.table(
      crashedState.toolExecutions.map((execution) => ({
        sequence: execution.sequence,
        tool: execution.tool,
      })),
    );

    const result = await resumeAgentInvestigation(runId);

    const finalState = await store.get(runId);

    if (!finalState) {
      throw new Error(`Investigation ${runId} was not found after resume.`);
    }

    const finalSignatures = finalState.executedToolCallSignatures;

    const uniqueSignatures = new Set(finalSignatures);

    const preCrashExecutionsPreserved = preCrashSignatures.every(
      (signature, index) => finalSignatures[index] === signature,
    );

    const noDuplicateToolCalls =
      uniqueSignatures.size === finalSignatures.length &&
      finalSignatures.length === finalState.toolExecutions.length;

    recoveryChecks.push(
      {
        name: "resume completed durable run",

        passed: finalState.status === "COMPLETED",

        actual: finalState.status,

        expected: "COMPLETED",
      },

      {
        name: "pre-crash executions preserved",

        passed: preCrashExecutionsPreserved,

        actual: preCrashExecutionsPreserved,

        expected: true,
      },

      {
        name: "no duplicate tool execution after resume",

        passed: noDuplicateToolCalls,

        actual: noDuplicateToolCalls,

        expected: true,
      },
    );

    const investigationResult = evaluateInvestigationResult(evalCase, result);

    const checks = [...recoveryChecks, ...investigationResult.checks];

    console.log("\nPre-crash tools:", preCrashTools);

    console.log(
      "Final tools:",
      finalState.toolExecutions.map((execution) => execution.tool),
    );

    console.table(checks);

    const passed = checks.filter((check) => check.passed).length;

    console.log(`${passed}/${checks.length} crash/resume checks passed`);

    if (passed !== checks.length) {
      throw new Error(
        `${checks.length - passed} crash/resume check(s) failed for ${evalCase.id}.`,
      );
    }
  }
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
