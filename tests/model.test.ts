import test from "node:test";
import assert from "node:assert/strict";
import { seriesScoreDist, seriesWinProb, gameProbFromSeries } from "../src/lib/model/series";
import { extractBouts, firstToForPosition } from "../src/lib/model/history";
import { FeatureState, jstDayStart } from "../src/lib/model/state";
import { boutFeatures, evaluate, fitV2, v1Combined, v2Bout } from "../src/lib/model/bout-model";
import { buildProductionModel } from "../src/lib/model/production";
import { predictBoutWinRate } from "../src/lib/predictor";
import type { SflBout } from "../src/lib/model/history";

test("先取換算: 五分は五分のまま、実力差は3本先取の方が広がる", () => {
  assert.ok(Math.abs(seriesWinProb(0.5, 2) - 0.5) < 1e-12);
  assert.ok(Math.abs(seriesWinProb(0.6, 2) - 0.648) < 1e-9); // p²(1+2q)
  assert.ok(seriesWinProb(0.6, 3) > seriesWinProb(0.6, 2));
  const dist = seriesScoreDist(0.6, 3);
  assert.ok(Math.abs(dist.reduce((s, d) => s + d.prob, 0) - 1) < 1e-9);
  assert.ok(Math.abs(gameProbFromSeries(seriesWinProb(0.62, 3), 3) - 0.62) < 1e-6);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(firstToForPosition), [2, 2, 3, 2, 2, 3, 2, 2, 3]);
});

function bout(partial: Partial<SflBout>): SflBout {
  return {
    season: "2026",
    slug: "div-s-sec1",
    stage: "regular",
    date: "2026-08-25",
    matchNo: 1,
    homeTeam: "x",
    awayTeam: "y",
    position: 0,
    homePlayer: "a",
    awayPlayer: "b",
    homeChar: "ryu",
    awayChar: "ken",
    homeMode: "c",
    awayMode: "c",
    homeBattles: 2,
    awayBattles: 0,
    ...partial,
  };
}

test("extractBouts: 公式 schedules から HOME/AWAY・キャラ・本数を取り出す", () => {
  const bouts = extractBouts("2025", [
    {
      post_name: "div-s-sec1",
      fields: {
        section: {
          time: "2025-08-29 18:40:00",
          match1: {
            home: "fav",
            away: "sol",
            result: {
              "1p": [{ player: "fujimura", battle: 0, status: 0, use_chara: { mai: { mode: "c" } } }],
              "2p": [{ player: "cosa", battle: 2, status: 0, use_chara: { "deejay(m)": {} } }],
            },
          },
        },
      },
    },
    { post_name: "news", fields: { section: { time: "2025-01-01" } } },
  ]);
  assert.equal(bouts.length, 1);
  assert.deepEqual(
    [bouts[0].date, bouts[0].homePlayer, bouts[0].awayChar, bouts[0].awayMode, bouts[0].awayBattles],
    ["2025-08-29", "fujimura", "dee_jay", "m", 2]
  );
});

test("FeatureState: その日より前の結果だけが反映される", () => {
  const state = new FeatureState();
  state.addSflBouts([bout({ date: "2026-08-25" }), bout({ date: "2026-09-01", homeBattles: 0, awayBattles: 2 })]);
  state.advanceTo(jstDayStart("2026-08-25"));
  assert.equal(state.rating("a"), state.rating("b"), "当日の結果はまだ入らない");
  state.advanceTo(jstDayStart("2026-08-26"));
  assert.ok(state.rating("a") > state.rating("b"));
  assert.deepEqual(state.vsCharRecord("a", "ken"), { w: 2, n: 2 });
  assert.deepEqual(state.h2hRecord("b", "a"), { w: 0, n: 1 });
});

test("v2: 学習で実力差の効きが正、強い側の勝率が上がる", () => {
  // 実力差どおりに勝つデータ
  const state = new FeatureState();
  const data = [];
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 80; i++) {
    const f = boutFeatures(state, "a", "b", "ryu", "ken", 2, () => 0.5);
    const dR = (i % 9) * 50 - 200;
    const y = rand() < 1 / (1 + 10 ** (-dR / 400));
    data.push({ f: { ...f, dR }, y });
  }
  const w = fitV2(data, undefined, 0.02, 500);
  assert.ok(w.rating > 0);
  const base = { dR: 0, mu: 0.5, vsHome: 0.5, vsAway: 0.5, h2h: 0.5, firstTo: 2 };
  assert.ok(v2Bout({ ...base, dR: 200 }, w) > v2Bout(base, w));
  assert.ok(v1Combined(base) >= 0.22 && v1Combined(base) <= 0.82);
  assert.equal(evaluate([{ p: 0.5, y: true }]).logLoss.toFixed(4), Math.log(2).toFixed(4));
});

test("本番モデル: 全履歴から実力値を出し、予測関数が v2 で大将戦を3本先取として計算する", () => {
  const bouts = [
    bout({ date: "2026-08-25", homePlayer: "strong", awayPlayer: "weak", homeBattles: 2, awayBattles: 0 }),
    bout({ date: "2026-09-01", homePlayer: "weak", awayPlayer: "strong", homeBattles: 0, awayBattles: 2 }),
  ];
  const model = buildProductionModel(bouts, null, null, () => 0.5, ["strong", "weak"], jstDayStart("2026-09-02"));
  assert.ok(model.ratings.strong > model.ratings.weak);

  const cpt = { updatedAt: "", source: "", topPlacementThreshold: 0, bayesianPriorAlpha: 0, characters: [], matrix: {} };
  const stats = { updatedAt: "", players: {} };
  const two = predictBoutWinRate("strong", "weak", true, cpt, stats, "ryu", "ken", 2, model);
  const three = predictBoutWinRate("strong", "weak", true, cpt, stats, "ryu", "ken", 3, model);
  assert.ok(two.expectedWinRateA > 50);
  assert.ok(three.expectedWinRateA > two.expectedWinRateA, "3本先取の方が実力差が出る");
  assert.match(three.rationale, /3本先取/);
  // 実力値が無い選手は v1 にフォールバック
  const v1 = predictBoutWinRate("x", "y", true, cpt, stats, "ryu", "ken", 2, model);
  assert.ok(!/本先取/.test(v1.rationale));
});
