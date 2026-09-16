import { runStructuredInvestigation } from "./ai/run-structured-investigation.js";

async function main() {
  const assessment = await runStructuredInvestigation("ORD-1001");

  console.dir(assessment, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
