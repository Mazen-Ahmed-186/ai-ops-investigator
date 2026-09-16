import { runToolInvestigation } from "./ai/run-tool-investigation.js";

async function main() {
  const assessment = await runToolInvestigation("ORD-1001");

  console.log("Final assessment:");
  console.dir(assessment, {
    depth: null,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
