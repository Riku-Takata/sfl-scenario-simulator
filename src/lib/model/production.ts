/**
 * 本番用の予測モデル v2 (単純版: 実力差・キャラ相性・HOME) の学習
 *
 * バックテスト (scripts/eval/backtest.ts) で v1 より対数損失・Brier が良かった構成。
 * 対キャラ戦績・直接対決は現状のサンプル数ではノイズになるため使わない。
 */
import type { StartggIdentitiesData, StartggPremierResultsData } from "../types";
import { boutFeatures, fitV2, type BoutFeatures, type V2Params } from "./bout-model";
import type { SflBout } from "./history";
import { FeatureState, jstDayStart } from "./state";
import { estimatePropensities, type Propensity } from "./lineup";
import { DEFAULT_UNCERTAINTY, type UncertaintyParams } from "./uncertainty";

export interface ProductionModel {
  fittedAt: string;
  trainBouts: number;
  params: V2Params;
  /** 現時点の実力値 (選手キー → レーティング) */
  ratings: Record<string, number>;
  /** 実力値の根拠になったゲーム数 (重み付き)。少ないほど実力値の不確実性が大きい */
  games: Record<string, number>;
  /** 出場選手モデルの起用傾向 (選手キー → 出場率・ポジション・延長傾向) */
  propensities?: Record<string, Propensity>;
  /** 実力値の不確実性の設定 (シーズンのシミュレーションで使う) */
  uncertainty?: UncertaintyParams;
}

/** 単純版: 対キャラ戦績・直接対決を中立値にした特徴量 */
export function simplifyFeatures(f: BoutFeatures): BoutFeatures {
  return { ...f, vsHome: 0.5, vsAway: 0.5, h2h: 0.5 };
}

export function buildProductionModel(
  bouts: SflBout[],
  results: StartggPremierResultsData | null,
  identities: StartggIdentitiesData | null,
  matchupPrior: (a: string, b: string) => number,
  players: string[],
  now = Date.now() / 1000
): ProductionModel {
  const currentSeason = [...bouts].map((b) => b.season).sort().at(-1) ?? "2026";
  const state = new FeatureState();
  state.addSflBouts(bouts);
  if (results && identities) state.addStartgg(results, identities);

  // 各ボウトをその日より前の情報だけで特徴量化して学習データにする
  const train: Array<{ f: BoutFeatures; y: boolean }> = [];
  for (const b of [...bouts].sort((x, y) => x.date.localeCompare(y.date))) {
    state.advanceTo(jstDayStart(b.date));
    const firstTo = Math.max(b.homeBattles, b.awayBattles);
    if (firstTo === 0) continue;
    train.push({
      f: simplifyFeatures(
        boutFeatures(state, b.homePlayer, b.awayPlayer, b.homeChar, b.awayChar, firstTo, matchupPrior)
      ),
      y: b.homeBattles > b.awayBattles,
    });
  }
  state.advanceTo(now + 1);

  return {
    fittedAt: new Date(now * 1000).toISOString(),
    trainBouts: train.length,
    params: fitV2(train),
    ratings: Object.fromEntries(players.map((p) => [p, Math.round(state.rating(p) * 10) / 10])),
    games: Object.fromEntries(players.map((p) => [p, Math.round(state.gameCount(p) * 10) / 10])),
    propensities: estimatePropensities(bouts, players, currentSeason),
    uncertainty: DEFAULT_UNCERTAINTY,
  };
}
