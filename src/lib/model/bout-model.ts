/**
 * ボウト勝率モデル (v1 再現・v1 + 先取換算・v2 ロジスティック)
 */
import { seriesWinProb } from "./series";
import type { FeatureState } from "./state";

export interface BoutFeatures {
  /** HOME − AWAY のレーティング差 */
  dR: number;
  /** キャラ相性 (HOME キャラ視点の勝率 0..1) */
  mu: number;
  /** HOME 選手の対 AWAY キャラ勝率 (平滑化済み) */
  vsHome: number;
  /** AWAY 選手の対 HOME キャラ勝率 (平滑化済み) */
  vsAway: number;
  /** HOME 視点の直接対決勝率 (平滑化済み) */
  h2h: number;
  firstTo: number;
}

const VS_CHAR_ALPHA = 14;
const H2H_ALPHA = 4;

export function boutFeatures(
  state: FeatureState,
  home: string,
  away: string,
  homeChar: string,
  awayChar: string,
  firstTo: number,
  matchupPrior: (a: string, b: string) => number
): BoutFeatures {
  const mu = homeChar && awayChar ? matchupPrior(homeChar, awayChar) : 0.5;
  const vh = state.vsCharRecord(home, awayChar);
  const va = state.vsCharRecord(away, homeChar);
  const h = state.h2hRecord(home, away);
  return {
    dR: state.rating(home) - state.rating(away),
    mu,
    vsHome: (vh.w + VS_CHAR_ALPHA * mu) / (vh.n + VS_CHAR_ALPHA),
    vsAway: (va.w + VS_CHAR_ALPHA * (1 - mu)) / (va.n + VS_CHAR_ALPHA),
    h2h: (h.w + H2H_ALPHA * 0.5) / (h.n + H2H_ALPHA),
    firstTo,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const logit = (p: number) => Math.log(clamp(p, 1e-4, 1 - 1e-4) / (1 - clamp(p, 1e-4, 1 - 1e-4)));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** v1 (現行 predictor.ts) の合成式。HOME 視点、ボウト勝率をそのまま返す */
export function v1Combined(f: BoutFeatures): number {
  const eloProb = 1 / (1 + 10 ** (-f.dR / 400));
  const playerVsChar = clamp(f.vsHome, 0.25, 0.78);
  const h2hAndHome = clamp(f.h2h * 0.45 + eloProb * 0.55 + 0.045, 0.25, 0.8);
  return clamp(0.4 * f.mu + 0.35 * playerVsChar + 0.25 * h2hAndHome, 0.22, 0.82);
}

/** v1 の合成値を1ゲーム勝率とみなし、先取本数でボウト勝率に換算 */
export function v1Series(f: BoutFeatures): number {
  return seriesWinProb(v1Combined(f), f.firstTo);
}

/** v2: 1ゲーム勝率のロジスティックモデル → 先取換算 */
export interface V2Params {
  rating: number;
  matchup: number;
  home: number;
  vsChar: number;
  h2h: number;
}

export const V2_PARAM_KEYS: Array<keyof V2Params> = ["rating", "matchup", "home", "vsChar", "h2h"];

export function v2GameProb(f: BoutFeatures, w: V2Params): number {
  const z =
    w.rating * ((f.dR * Math.LN10) / 400) +
    w.matchup * logit(f.mu) +
    w.home +
    w.vsChar * ((logit(f.vsHome) - logit(f.vsAway)) / 2) +
    w.h2h * logit(f.h2h);
  return sigmoid(z);
}

export function v2Bout(f: BoutFeatures, w: V2Params): number {
  return seriesWinProb(v2GameProb(f, w), f.firstTo);
}

export interface Metrics {
  n: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export function evaluate(preds: Array<{ p: number; y: boolean }>): Metrics {
  const n = preds.length;
  let ll = 0;
  let br = 0;
  let hit = 0;
  for (const { p, y } of preds) {
    const q = clamp(p, 1e-6, 1 - 1e-6);
    ll += -(y ? Math.log(q) : Math.log(1 - q));
    br += (q - (y ? 1 : 0)) ** 2;
    if ((q >= 0.5) === y) hit++;
  }
  return { n, logLoss: ll / n, brier: br / n, accuracy: hit / n };
}

/** 予測値を区間に分けた実際の勝率 (キャリブレーション) */
export function calibration(preds: Array<{ p: number; y: boolean }>, bins = 5) {
  const out: Array<{ range: string; n: number; predicted: number; actual: number }> = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    const inBin = preds.filter((x) => x.p >= lo && (i === bins - 1 ? x.p <= hi : x.p < hi));
    if (inBin.length === 0) continue;
    out.push({
      range: `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`,
      n: inBin.length,
      predicted: inBin.reduce((s, x) => s + x.p, 0) / inBin.length,
      actual: inBin.filter((x) => x.y).length / inBin.length,
    });
  }
  return out;
}

/** v2 のパラメータを最尤推定 (L2 正則化・数値勾配の勾配降下) */
export function fitV2(
  data: Array<{ f: BoutFeatures; y: boolean }>,
  init: V2Params = { rating: 1, matchup: 1, home: 0, vsChar: 0, h2h: 0 },
  lambda = 0.02,
  iterations = 3000
): V2Params {
  const loss = (w: V2Params) => {
    let ll = 0;
    for (const { f, y } of data) {
      const p = clamp(v2Bout(f, w), 1e-6, 1 - 1e-6);
      ll += -(y ? Math.log(p) : Math.log(1 - p));
    }
    const reg =
      (w.rating - 1) ** 2 + (w.matchup - 1) ** 2 + w.home ** 2 + w.vsChar ** 2 + w.h2h ** 2;
    return ll / data.length + lambda * reg;
  };
  let w = { ...init };
  let lr = 0.5;
  let current = loss(w);
  for (let it = 0; it < iterations; it++) {
    const grad: Partial<V2Params> = {};
    for (const k of V2_PARAM_KEYS) {
      const h = 1e-4;
      grad[k] = (loss({ ...w, [k]: w[k] + h }) - loss({ ...w, [k]: w[k] - h })) / (2 * h);
    }
    const next = { ...w };
    for (const k of V2_PARAM_KEYS) next[k] = w[k] - lr * (grad[k] ?? 0);
    const nextLoss = loss(next);
    if (nextLoss < current) {
      w = next;
      current = nextLoss;
      lr *= 1.05;
    } else {
      lr *= 0.5;
      if (lr < 1e-6) break;
    }
  }
  return w;
}
