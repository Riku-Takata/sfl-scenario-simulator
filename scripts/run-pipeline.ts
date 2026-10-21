import { spawnSync } from "node:child_process";
import { fetchStartggPremierResults } from "./0a-fetch-startgg";
import { fetchSflPlayStats } from "./0b-fetch-sfl-play-stats";
import { fetchSflHistory } from "./eval/fetch-sfl-history";
import { fetchAndBuildCptData } from "./0-fetch-cpt-data";
import { fetchAndSaveResults } from "./1-fetch-results";
import { calculateAndSaveScenarios } from "./2-calc-scenarios";
import { generateAndSaveNarratives } from "./3-generate-narratives";
import { generateAndSaveMatchRecaps, hasPendingVideoWork } from "./4-generate-match-recaps";
import { generateSf6Tournaments } from "./generate-sf6-tournaments";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const resultsOnly = args.includes("--results-only");
  const commit = args.includes("--commit");
  const push = args.includes("--push");

  console.log("=== SFL 2026 Scenario Simulator Pipeline (Astro + Zod + CPT Predictor) Start ===");

  const { updated } = await fetchAndSaveResults({ force });
  // start.gg は約1日1回の差分取得。失敗しても既存キャッシュで続行する
  const startgg = await fetchStartggPremierResults({ force }).catch((err) => {
    console.warn("[Step 0a] start.gg fetch failed, using cached data:", err);
    return { updated: false };
  });
  if (!updated && !startgg.updated && !force) {
    if (!hasPendingVideoWork()) {
      console.log(
        "=== No new match results found. Exiting pipeline (use --force to recalculate). ==="
      );
      return;
    }
    // 無料枠の日次上限で残った動画解析を、結果更新が無い日にも少しずつ進める
    console.log("=== No new match results, but video analysis is pending. Resuming match recaps only. ===");
    if (resultsOnly) {
      console.log("=== Durable recap worker will resume pending analysis after the official result update. ===");
    } else {
      await generateAndSaveMatchRecaps();
    }
  } else if (!updated && !force) {
    // start.gg のみ更新: 選手統計とシナリオ確率だけ再計算 (LLM解説は次回のSFL結果更新時に再生成)
    console.log("=== start.gg premier data updated. Recalculating player stats & scenarios only. ===");
    await fetchAndBuildCptData();
    calculateAndSaveScenarios(10000);
    await generateSf6Tournaments();
  } else {
    // SFL公式の試合内プレイ統計 (失敗しても既存データで続行)
    await fetchSflPlayStats().catch((err) => {
      console.warn("[Step 0b] SFL play stats fetch failed, using cached data:", err);
    });
    // 予測モデル v2 の学習用ボウト履歴 (今季分は Step 1 の結果から作り直す)
    await fetchSflHistory().catch((err) => {
      console.warn("[Step 0c] SFL bout history update failed, using cached data:", err);
    });
    await fetchAndBuildCptData();
    calculateAndSaveScenarios(10000);
    await generateAndSaveNarratives();
    await generateAndSaveMatchRecaps({ resultsOnly });
    await generateSf6Tournaments();
  }

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
