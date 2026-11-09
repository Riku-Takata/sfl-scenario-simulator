import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MatchesDataSchema } from "../src/lib/schema";
import { computeRankBounds, explainTarget, formatTargetProbability, targetStatus, type TeamRankBounds } from "../src/lib/feasibility";
import { SCORE_DIFF_RANGES, boutDiffRange, patternFromPoints } from "../src/lib/score-format";
import { TEAM_META_MAP } from "../src/lib/simulator";
import type { DivisionId, MatchRecord, ScorePatternId } from "../src/lib/types";

const load = (name: string) =>
  MatchesDataSchema.parse(JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/simulator", name), "utf8"))).matches;
const nov09 = load("matches-2026-11-09.json");

test("diff ranges follow the match format and contain every played result", () => {
  assert.deepEqual(boutDiffRange(2, true).battle, { min: 1, max: 2 });
  assert.deepEqual(boutDiffRange(3, false).battle, { min: -3, max: -1 });
  assert.deepEqual(SCORE_DIFF_RANGES.HOME_40_0.home.battle, { min: 3, max: 7 });
  assert.deepEqual(SCORE_DIFF_RANGES.AWAY_40_0.home.battle, { min: -7, max: -3 });
  const played = nov09.filter((m) => m.played);
  assert.ok(played.length >= 39);
  for (const m of played) {
    const pattern = patternFromPoints(m.homePoint, m.awayPoint);
    assert.ok(pattern, `${m.id} has a known score`);
    const r = SCORE_DIFF_RANGES[pattern!].home;
    assert.ok(m.homeBattleDiff >= r.battle.min && m.homeBattleDiff <= r.battle.max, `${m.id} battle diff ${m.homeBattleDiff}`);
    assert.ok(m.homeRoundDiff >= r.round.min && m.homeRoundDiff <= r.round.max, `${m.id} round diff ${m.homeRoundDiff}`);
  }
});

test("2026-11-09: iXA cannot finish 1st but can still reach the playoffs without a tiebreak", () => {
  const s = computeRankBounds("s", nov09);
  assert.equal(s.ixa.bestRank, 2);
  assert.equal(s.ixa.bestRankWithoutTiebreak, 3);
  assert.equal(s.ixa.maxPoints, 190);
  assert.equal(targetStatus(s.ixa, 1, 0), "impossible");
  assert.equal(targetStatus(s.ixa, 3, 0), "tiny");
  assert.match(explainTarget(s.ixa, 1, "1位"), /最大190pt.*1位は不可能/);
  const f = computeRankBounds("f", nov09);
  assert.equal(f.oja.bestRank, 1, "NTPOJA can still finish 1st although the simulation shows 0%");
  for (const bounds of [...Object.values(s), ...Object.values(f)]) assert.equal(bounds.exhaustive, true);
});

// 総当たり: 自チームの試合も含めて全通りを数え、同じ得失差の解釈で上にいるチーム数を数える。
function bruteForce(division: DivisionId, matches: MatchRecord[]): Record<string, { strict: number; safe: number; pessimistic: number; safeMax: number }> {
  const keys = Object.values(TEAM_META_MAP).filter((t) => t.division === division).map((t) => t.key);
  const open = matches.filter((m) => m.division === division && !m.played);
  const patterns: ScorePatternId[] = ["HOME_40_0", "HOME_30_10", "HOME_30_20", "AWAY_30_20", "AWAY_30_10", "AWAY_40_0"];
  const out = Object.fromEntries(keys.map((k) => [k, { strict: 99, safe: 99, pessimistic: -1, safeMax: -1 }]));
  const choice: ScorePatternId[] = [];
  const visit = (i: number) => {
    if (i === open.length) {
      const custom = Object.fromEntries(open.map((m, j) => [m.id, choice[j]]));
      // 全試合を確定させた状態の得失差の幅を、エンジンと同じ規則で比べる
      const b = computeRankBounds(division, matches, custom);
      for (const k of keys) {
        // 全試合確定なら best = worst の解釈 (strict = 上にいる数, pessimistic = 上か同点の数)
        out[k].strict = Math.min(out[k].strict, b[k].bestRank - 1);
        out[k].safe = Math.min(out[k].safe, b[k].bestRankWithoutTiebreak - 1);
        out[k].pessimistic = Math.max(out[k].pessimistic, b[k].worstRank - 1);
      }
      return;
    }
    for (const p of patterns) {
      choice[i] = p;
      visit(i + 1);
    }
  };
  visit(0);
  return out;
}

test("rank bounds match brute force over every remaining result", () => {
  for (const division of ["s", "f"] as const) {
    // 最後の2節 (6試合) だけを未消化に残す: 6^6 = 46,656 通り。それより前の未消化の節は 30-10 で埋める。
    // 差を詰めて順位の入れ替わりが起きやすいように、埋める勝敗は交互にする。
    let flip = false;
    const matches = nov09.map((m) => {
      if (m.division !== division || m.played || m.sectionNumber >= 9) return m;
      flip = !flip;
      return { ...m, played: true, homePoint: flip ? 30 : 10, awayPoint: flip ? 10 : 30,
        homeBattleDiff: flip ? 2 : -2, awayBattleDiff: flip ? -2 : 2, homeRoundDiff: flip ? 4 : -4, awayRoundDiff: flip ? -4 : 4 };
    });
    const open = matches.filter((m) => m.division === division && !m.played).length;
    assert.equal(open, 6);
    const engine = computeRankBounds(division, matches);
    const brute = bruteForce(division, matches);
    for (const [k, b] of Object.entries(engine) as Array<[string, TeamRankBounds]>) {
      assert.equal(b.bestRank - 1, brute[k].strict, `${division} ${k} best rank`);
      assert.equal(b.bestRankWithoutTiebreak - 1, brute[k].safe, `${division} ${k} best rank without tiebreak`);
      assert.equal(b.worstRank - 1, brute[k].pessimistic, `${division} ${k} worst rank`);
    }
  }
});

test("status labels follow the design table", () => {
  const base: TeamRankBounds = { teamKey: "x", bestRank: 1, bestRankNeedsTiebreak: false, bestRankWithoutTiebreak: 1, worstRank: 5, worstRankNeedsTiebreak: false, maxPoints: 300, minPoints: 200, exhaustive: true };
  assert.equal(formatTargetProbability(targetStatus(base, 1, 18.46), 18.46), "18.5%");
  assert.equal(formatTargetProbability(targetStatus(base, 1, 0), 0), "0.1%未満（可能性あり）");
  assert.equal(formatTargetProbability(targetStatus({ ...base, worstRank: 3 }, 3, 99), 99), "確定");
  assert.equal(formatTargetProbability(targetStatus({ ...base, bestRank: 4, bestRankWithoutTiebreak: 4 }, 3, 0), 0), "不可能");
  assert.equal(formatTargetProbability(targetStatus({ ...base, bestRank: 3, bestRankNeedsTiebreak: true, bestRankWithoutTiebreak: 4 }, 3, 0), 0), "得失差次第で可能");
  assert.equal(formatTargetProbability(targetStatus({ ...base, exhaustive: false }, 1, 12), 12), "12.0%（概算）");
});

test("a team that can no longer reach the playoffs gets an eliminated outlook with the reason", async () => {
  const { analyzeDivisionScenarios } = await import("../src/lib/simulator");
  // F の残り試合を、NTPOJA は全敗 (0-40)、それ以外は HOME の 30-10 勝ちで埋めて終える
  const finished = nov09.map((m) => {
    if (m.division !== "f" || m.played) return m;
    const ojaHome = m.home === "oja";
    const ojaAway = m.away === "oja";
    const homeWins = ojaAway || (!ojaHome && true);
    const [hp, ap] = ojaHome ? [0, 40] : ojaAway ? [40, 0] : [30, 10];
    return { ...m, played: true, homePoint: hp, awayPoint: ap, winner: homeWins ? "home" as const : "away" as const,
      homeBattleDiff: hp > ap ? 2 : -2, awayBattleDiff: hp > ap ? -2 : 2, homeRoundDiff: hp > ap ? 4 : -4, awayRoundDiff: hp > ap ? -4 : 4 };
  });
  const result = analyzeDivisionScenarios("f", finished, 200);
  const oja = result.teams.oja;
  assert.equal(oja.feasibility?.targets.playoff.status, "impossible");
  assert.equal(oja.feasibility?.targets.playoff.label, "不可能");
  assert.equal(oja.personalizedOutlook?.realisticTargetRank, "eliminated");
  assert.match(oja.personalizedOutlook?.realisticTargetTitle ?? "", /消滅/);
  assert.equal(oja.personalizedOutlook?.rankEvaluations.third.feasibility, "impossible");
});
