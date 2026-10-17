import { spawnSync } from "node:child_process";
import { fetchAndBuildCptData } from "./0-fetch-cpt-data";
import { fetchAndSaveResults } from "./1-fetch-results";
import { calculateAndSaveScenarios } from "./2-calc-scenarios";
import { generateAndSaveNarratives } from "./3-generate-narratives";
import { generateSf6Tournaments } from "./generate-sf6-tournaments";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const commit = args.includes("--commit");
  const push = args.includes("--push");

  console.log("=== SFL 2026 Scenario Simulator Pipeline (Astro + Zod + CPT Predictor) Start ===");

  const { updated } = await fetchAndSaveResults({ force });
  if (!updated && !force) {
    console.log(
      "=== No new match results found. Exiting pipeline (use --force to recalculate). ==="
    );
    return;
  }

  await fetchAndBuildCptData();
  calculateAndSaveScenarios(10000);
  await generateAndSaveNarratives();
  await generateSf6Tournaments();

  if (commit) {
    console.log("[Step 5] Committing updated JSON data...");
    spawnSync("git", ["add", "src/data/*.json"], { stdio: "inherit" });
    const diffCheck = spawnSync("git", ["diff", "--cached", "--quiet"]);
    if (diffCheck.status !== 0) {
      const msg = `chore(data): auto-update SFL 2026 & CPT Top96 scenarios (${new Date().toISOString().slice(0, 10)})`;
      spawnSync("git", ["commit", "-m", msg], { stdio: "inherit" });
      if (push) {
        console.log("[Step 5] Pushing to remote repository...");
        spawnSync("git", ["push"], { stdio: "inherit" });
      }
    } else {
      console.log("[Step 5] No git changes to commit.");
    }
  }

  console.log("=== SFL 2026 Scenario Simulator Pipeline Completed ===");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
