import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MatchesDataSchema } from "../src/lib/schema";
import { findLikelyScenarios } from "../src/lib/scenario-search";
import { calculateStandings, SCORE_OUTCOMES } from "../src/lib/simulator";
import type { MatchOutcomePrediction, ScorePatternId } from "../src/lib/types";

const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/simulator/matches-2026-11-09.json"), "utf8"))).matches;
// 試合ごとに偏りの違う確率を決める (固定値なので結果は毎回同じ)
const predictions: Record<string, MatchOutcomePrediction> = {};
matches.filter((m) => !m.played).forEach((m, i) => {
  const raw = SCORE_OUTCOMES.map((o, j) => 1 + ((i * 7 + j * 3) % 6) + (j === i % 6 ? 4 : 0));
  const total = raw.reduce((s, v) => s + v, 0);
  const weights = Object.fromEntries(SCORE_OUTCOMES.map((o, j) => [o.id, raw[j] / total])) as Record<ScorePatternId, number>;
  const mostLikely = SCORE_OUTCOMES[raw.indexOf(Math.max(...raw))].id;
  predictions[m.id] = { weights, homeWinProbability: 50, mostLikely };
});

test("without a target the most likely scenario takes each match's most likely score", () => {
  const { scenarios, exhaustive } = findLikelyScenarios({ division: "s", matches, predictions, limit: 3 });
  assert.equal(exhaustive, true);
  const open = matches.filter((m) => m.division === "s" && !m.played);
  for (const m of open) assert.equal(scenarios[0].outcomes[m.id], predictions[m.id].mostLikely);
  assert.equal(scenarios[0].deviations.length, 0);
  assert.ok(scenarios[0].probability >= scenarios[1].probability && scenarios[1].probability >= scenarios[2].probability);
});

test("with a target the top scenarios match brute force over every result", () => {
  // S の第8節を固定して、残り6試合 (6^6 = 46,656 通り) を総当たりと比べる
  const open = matches.filter((m) => m.division === "s" && !m.played);
  const fixed = Object.fromEntries(open.filter((m) => m.sectionNumber === 8).map((m) => [m.id, "HOME_30_10" as ScorePatternId]));
  const rest = open.filter((m) => !fixed[m.id]);
  assert.equal(rest.length, 6);
  for (const [teamKey, rank] of [["ixa", 3], ["cr", 1], ["zeta", 2]] as const) {
    const all: Array<{ p: number; key: string }> = [];
    const choice: ScorePatternId[] = [];
    const visit = (i: number) => {
      if (i === rest.length) {
        const outcomes = { ...fixed, ...Object.fromEntries(rest.map((m, j) => [m.id, choice[j]])) };
        if (calculateStandings("s", matches, outcomes).find((t) => t.key === teamKey)?.rank !== rank) return;
        all.push({ p: rest.reduce((p, m, j) => p * (predictions[m.id].weights[choice[j]] ?? 0), 1), key: choice.join(",") });
        return;
      }
      for (const o of SCORE_OUTCOMES) { choice[i] = o.id; visit(i + 1); }
    };
    visit(0);
    all.sort((a, b) => b.p - a.p);
    const { scenarios } = findLikelyScenarios({ division: "s", matches, predictions, fixed, target: { teamKey, rank }, limit: 5 });
    assert.equal(scenarios.length, Math.min(5, all.length), `${teamKey} ${rank}`);
    scenarios.forEach((s, i) => {
      assert.ok(Math.abs(s.probability - all[i].p) < 1e-12, `${teamKey} ${rank} #${i + 1}`);
      assert.equal(calculateStandings("s", matches, s.outcomes).find((t) => t.key === teamKey)?.rank, rank);
    });
  }
});

test("an unreachable target returns no scenario", () => {
  const { scenarios, exhaustive } = findLikelyScenarios({ division: "s", matches, predictions, target: { teamKey: "ixa", rank: 1 } });
  assert.equal(exhaustive, true);
  assert.equal(scenarios.length, 0);
});
