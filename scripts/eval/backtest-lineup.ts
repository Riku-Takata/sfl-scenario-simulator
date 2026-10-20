/**
 * 出場選手モデル・実力値の不確実性のバックテスト (SFL 2026 レギュラーシーズン)
 *
 * 1. ラインナップ予測: 実際の先鋒・中堅・大将の並びに付けた確率 (対数尤度) を比べる
 * 2. チーム戦の勝敗: 固定オーダー (現行 v2) と、出場選手モデル (被せの強さ β 別)・不確実性ありを比べる
 * いずれも試合日より前の情報だけを使う。
 *
 *   npx tsx scripts/eval/backtest-lineup.ts
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
import { predictBoutWinRate, predictTeamMatchOutcomeDistribution } from "../../src/lib/predictor";
import { buildProductionModel, type ProductionModel } from "../../src/lib/model/production";
import { evaluate } from "../../src/lib/model/bout-model";
import type { SflBout } from "../../src/lib/model/history";
import {
  awayLineupProb,
  DEFAULT_LINEUP_PARAMS,
  estimatePropensities,
  homeLineupProb,
  teamMatchDistribution,
} from "../../src/lib/model/lineup";
import { sampleRatingWorlds } from "../../src/lib/model/uncertainty";
import { TEAM_META_MAP } from "../../src/lib/simulator";

const read = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data", f), "utf8"));
const ROSTER = (team: string) => (TEAM_META_MAP[team]?.players ?? []).filter((p) => p !== "keib_oja");

function main() {
  const cpt = CptMatchupsTop96DataSchema.parse(read("cpt-matchups-top96.json"));
  const stats = PlayerStatsDataSchema.parse(read("player-stats.json"));
  const matches = MatchesDataSchema.parse(read("matches.json")).matches.filter((m) => m.played && m.winner);
  const bouts: SflBout[] = read("sfl-bout-history.json").bouts;
  const results = StartggPremierResultsDataSchema.parse(read("startgg-premier-results.json"));
  const identities = StartggIdentitiesDataSchema.parse(read("startgg-identities.json"));
  const players = Object.keys(stats.players);

  const modelCache = new Map<string, ProductionModel>();
  const modelAt = (date: string) => {
    let m = modelCache.get(date);
    if (!m) {
      const cutoff = Date.parse(`${date}T00:00:00+09:00`) / 1000;
      const pastResults = {
        ...results,
        players: Object.fromEntries(
          Object.entries(results.players).map(([k, p]) => [k, { ...p, sets: p.sets.filter((s) => s.completedAt < cutoff) }])
        ),
      };
      m = buildProductionModel(bouts.filter((b) => b.date < date), pastResults, identities, getCompetitiveArchetypeBias, players, cutoff - 1);
      modelCache.set(date, m);
    }
    return m;
  };
  const boutFn = (model: ProductionModel) => (h: string, a: string, firstTo: number) =>
    predictBoutWinRate(h, a, true, cpt, stats, undefined, undefined, firstTo, model).expectedWinRateA / 100;

  // ---- 1. ラインナップ予測 ----
  const lineupLL = { model: 0, uniform: 0, n: 0 };
  let fixedRuleAwayHits = 0;
  for (const m of matches) {
    const date = m.scheduledAt.slice(0, 10);
    const mb = bouts.filter((b) => b.season === "2026" && b.date === date && b.homeTeam === m.home && b.awayTeam === m.away);
    const bySlot = [0, 1, 2].map((s) => mb.find((b) => b.position === s));
    if (bySlot.some((b) => !b)) continue;
    const away = bySlot.map((b) => b!.awayPlayer) as [string, string, string];
    const home = bySlot.map((b) => b!.homePlayer) as [string, string, string];
    const model = modelAt(date);
    const hp = estimatePropensities(bouts, ROSTER(m.home), "2026", DEFAULT_LINEUP_PARAMS, date);
    const ap = estimatePropensities(bouts, ROSTER(m.away), "2026", DEFAULT_LINEUP_PARAMS, date);
    lineupLL.model += Math.log(awayLineupProb(away, ROSTER(m.away), ap));
    lineupLL.model += Math.log(homeLineupProb(home, away, ROSTER(m.home), hp, boutFn(model)));
    lineupLL.uniform += 2 * Math.log(1 / 24);
    lineupLL.n += 2;
    // 現行の固定ルール: AWAY は実力上位3人を 先鋒=3番手, 中堅=2番手, 大将=1番手
    const sorted = [...ROSTER(m.away)].sort((x, y) => (model.ratings[y] ?? 0) - (model.ratings[x] ?? 0));
    if (sorted[2] === away[0] && sorted[1] === away[1] && sorted[0] === away[2]) fixedRuleAwayHits++;
  }

  // ---- 2. チーム戦の勝敗 ----
  const variants: Record<string, Array<{ p: number; y: boolean }>> = {};
  const push = (k: string, p: number, y: boolean) => (variants[k] ??= []).push({ p, y });
  for (const m of matches) {
    const date = m.scheduledAt.slice(0, 10);
    const model = modelAt(date);
    const y = m.winner === "home";
    push(
      "固定オーダー（v2 初版）",
      predictTeamMatchOutcomeDistribution(m, cpt, stats, { ...model, propensities: undefined }).homeWinProbability / 100,
      y
    );
    const hp = estimatePropensities(bouts, ROSTER(m.home), "2026", DEFAULT_LINEUP_PARAMS, date);
    const ap = estimatePropensities(bouts, ROSTER(m.away), "2026", DEFAULT_LINEUP_PARAMS, date);
    for (const beta of [0, 2, 4]) {
      const d = teamMatchDistribution(ROSTER(m.home), ROSTER(m.away), hp, ap, boutFn(model), {
        ...DEFAULT_LINEUP_PARAMS,
        homeCounterBeta: beta,
      });
      push(`出場選手モデル（出場率のみ）被せ β=${beta}`, d.homeWin, y);
    }
    {
      const posParams = { ...DEFAULT_LINEUP_PARAMS, positionWeight: 1 };
      const hpPos = estimatePropensities(bouts, ROSTER(m.home), "2026", posParams, date);
      const apPos = estimatePropensities(bouts, ROSTER(m.away), "2026", posParams, date);
      push("出場選手モデル（出場率+ポジション傾向）β=0", teamMatchDistribution(ROSTER(m.home), ROSTER(m.away), hpPos, apPos, boutFn(model), posParams).homeWin, y);
    }
    for (const sigma0 of [50, 100, 150]) {
      const worlds = sampleRatingWorlds(model.ratings, model.games, 30, 7, { sigma0, halfGames: 40 });
      const avg =
        worlds.reduce((s, ratings) => {
          const d = teamMatchDistribution(ROSTER(m.home), ROSTER(m.away), hp, ap, boutFn({ ...model, ratings }));
          return s + d.homeWin;
        }, 0) / worlds.length;
      push(`出場選手モデル β=0 + 不確実性 σ0=${sigma0}`, avg, y);
    }
  }

  const lines = [
    "",
    "## 出場選手モデル・不確実性（SFL 2026）",
    "",
    "`npx tsx scripts/eval/backtest-lineup.ts`。試合日より前の情報だけで予測。",
    "",
    "### ラインナップ予測",
    "",
    `- 実際の並び（先鋒・中堅・大将）の平均対数尤度: 出場選手モデル ${(lineupLL.model / lineupLL.n).toFixed(3)} / 一様（24通り）${(lineupLL.uniform / lineupLL.n).toFixed(3)}（大きいほど良い）`,
    `- 現行の固定ルール（AWAY は実力上位3人を固定順）が実際の AWAY の並びと一致した試合: ${fixedRuleAwayHits} / ${lineupLL.n / 2}`,
    "",
    "### チーム戦の勝敗",
    "",
    "| モデル | 試合数 | 対数損失 | Brier | 的中率 |",
    "|---|---|---|---|---|",
  ];
  for (const [name, preds] of Object.entries(variants)) {
    const e = evaluate(preds);
    lines.push(`| ${name} | ${e.n} | ${e.logLoss.toFixed(4)} | ${e.brier.toFixed(4)} | ${(e.accuracy * 100).toFixed(1)}% |`);
    console.log(name.padEnd(36), e.logLoss.toFixed(4), e.brier.toFixed(4), (e.accuracy * 100).toFixed(1));
  }
  console.log("lineup LL model", (lineupLL.model / lineupLL.n).toFixed(3), "uniform", (lineupLL.uniform / lineupLL.n).toFixed(3), "fixed-rule away hits", fixedRuleAwayHits, "/", lineupLL.n / 2);

  const report = path.join(process.cwd(), "docs/model-eval-report.md");
  const body = fs.readFileSync(report, "utf8").split("\n## 出場選手モデル・不確実性")[0].trimEnd();
  fs.writeFileSync(report, body + "\n" + lines.join("\n") + "\n", "utf8");
}

main();
