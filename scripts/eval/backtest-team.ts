/**
 * チーム戦の勝敗予測のバックテスト (SFL 2026 消化済み試合)
 *
 * 各試合を、その試合日より前の情報だけで推定した実力値・パラメータで予測し直し、
 * v1 (実力値なし) と v2 を比べる。出場選手・キャラは予測ロジックの想定 (実際の起用は与えない)。
 * 注意: キャラ相性表・メインキャラは現時点のものを使うため、わずかに未来の情報が混ざる。
 *
 *   npx tsx scripts/eval/backtest-team.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getCompetitiveArchetypeBias } from "../0-fetch-cpt-data";
import {
  CptMatchupsTop96DataSchema,
  MatchesDataSchema,
  PlayerStatsDataSchema,
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../../src/lib/schema";
import { predictTeamMatchOutcomeDistribution } from "../../src/lib/predictor";
import { buildProductionModel, type ProductionModel } from "../../src/lib/model/production";
import { evaluate, calibration } from "../../src/lib/model/bout-model";
import type { SflBout } from "../../src/lib/model/history";

const read = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data", f), "utf8"));

function main() {
  const matches = MatchesDataSchema.parse(read("matches.json")).matches.filter((m) => m.played && m.winner);
  const cpt = CptMatchupsTop96DataSchema.parse(read("cpt-matchups-top96.json"));
  const stats = PlayerStatsDataSchema.parse(read("player-stats.json"));
  const bouts: SflBout[] = read("sfl-bout-history.json").bouts;
  const results = StartggPremierResultsDataSchema.parse(read("startgg-premier-results.json"));
  const identities = StartggIdentitiesDataSchema.parse(read("startgg-identities.json"));
  const players = Object.keys(stats.players);

  const models = new Map<string, ProductionModel>();
  const preds: Record<"v1" | "v2", Array<{ p: number; y: boolean }>> = { v1: [], v2: [] };
  for (const m of matches) {
    const date = m.scheduledAt.slice(0, 10);
    if (!models.has(date)) {
      const cutoff = Date.parse(`${date}T00:00:00+09:00`) / 1000;
      // その日より前のボウトと start.gg のセットだけで学習・実力推定
      const pastBouts = bouts.filter((b) => b.date < date);
      const pastResults = {
        ...results,
        players: Object.fromEntries(
          Object.entries(results.players).map(([k, p]) => [k, { ...p, sets: p.sets.filter((s) => s.completedAt < cutoff) }])
        ),
      };
      models.set(date, buildProductionModel(pastBouts, pastResults, identities, getCompetitiveArchetypeBias, players, cutoff - 1));
    }
    const y = m.winner === "home";
    preds.v1.push({ p: predictTeamMatchOutcomeDistribution(m, cpt, stats, null).homeWinProbability / 100, y });
    preds.v2.push({ p: predictTeamMatchOutcomeDistribution(m, cpt, stats, models.get(date)!).homeWinProbability / 100, y });
  }

  const lines = [
    "",
    "## チーム戦の勝敗（SFL 2026 消化済み試合）",
    "",
    `\`npx tsx scripts/eval/backtest-team.ts\` / ${matches.length}試合。出場選手・キャラは予測ロジックの想定（実際の起用は与えない）。`,
    "",
    "| モデル | 試合数 | 対数損失 | Brier | 的中率 |",
    "|---|---|---|---|---|",
  ];
  for (const k of ["v1", "v2"] as const) {
    const e = evaluate(preds[k]);
    lines.push(`| ${k} | ${e.n} | ${e.logLoss.toFixed(4)} | ${e.brier.toFixed(4)} | ${(e.accuracy * 100).toFixed(1)}% |`);
    console.log(k, e, JSON.stringify(calibration(preds[k])));
  }
  for (const k of ["v1", "v2"] as const) {
    lines.push("", `### ${k} のキャリブレーション`, "", "| 予測区間 | 試合数 | 予測の平均 | 実際の HOME 勝率 |", "|---|---|---|---|");
    for (const c of calibration(preds[k])) {
      lines.push(`| ${c.range} | ${c.n} | ${(c.predicted * 100).toFixed(1)}% | ${(c.actual * 100).toFixed(1)}% |`);
    }
  }
  const report = path.join(process.cwd(), "docs/model-eval-report.md");
  const body = fs.readFileSync(report, "utf8").split("\n## チーム戦の勝敗")[0].trimEnd();
  fs.writeFileSync(report, body + "\n" + lines.join("\n") + "\n", "utf8");
}

main();
