import { runBaselineInvestigation } from "./ai/run-baseline.js";

async function main() {
  const result = await runBaselineInvestigation();

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
