/**
 * 出場選手モデル (予測モデル v2 ステップ5)
 *
 * 「AWAY は実力上位3人を固定順」「HOME は必ず最善の被せ」という楽観的な仮定をやめ、
 * SFL の実際の起用実績から、誰がどのポジションに出るかを確率として扱う。
 * - AWAY: 選手ごとの出場率 × ポジション傾向の積でラインナップ (3人の並び 24通り) に確率を付ける
 * - HOME: 同じく起用傾向を基本に、相手の先出しに対して勝率が高い並びほど選ばれやすくする (softmax)
 * - 延長: 4人の誰でも出られるとして、延長戦の起用傾向で重み付け
 */
import type { SflBout } from "./history";

/** 先鋒・中堅・大将・延長 */
export type Slot = 0 | 1 | 2 | 3;
const SLOT_POINTS = [10, 10, 20];

export interface Propensity {
  /** チームの試合のうち、先鋒〜大将のどこかに出場した割合 */
  participation: number;
  /** 出場時のポジション傾向 [先鋒, 中堅, 大将] (合計1) */
  position: [number, number, number];
  /** 延長戦に出る傾向 (チーム内の相対値) */
  tiebreak: number;
}

export interface LineupParams {
  /** 前シーズンの起用実績の重み (今季を1とする) */
  previousSeasonWeight: number;
  /** ポジション傾向の事前分布 (各ポジションの疑似回数) */
  positionPrior: number;
  /** 出場率の事前分布 (3/4 に寄せる疑似試合数) */
  participationPrior: number;
  /** HOME 被せの強さ (0 で起用傾向のみ、大きいほど勝率最大の並びに寄る) */
  homeCounterBeta: number;
  /** 過去のポジション傾向をどれだけ使うか (0: 並び順は均等、1: 傾向どおり) */
  positionWeight: number;
}

/**
 * バックテスト (docs/model-eval-report.md) で決めた既定値
 * - 誰が出るか (出場率) は予測できるが、どのポジションに出るかは過去の傾向では予測できず、
 *   使うと一様より悪化した → positionWeight 0
 * - HOME の「勝率最大の被せ」を仮定すると勝敗予測が悪化した → homeCounterBeta 0
 */
export const DEFAULT_LINEUP_PARAMS: LineupParams = {
  previousSeasonWeight: 0.5,
  positionPrior: 1,
  participationPrior: 2,
  homeCounterBeta: 0,
  positionWeight: 0,
};

/** 起用傾向の推定 (cutoff より前のレギュラーシーズンのみ) */
export function estimatePropensities(
  bouts: SflBout[],
  roster: string[],
  currentSeason: string,
  params: LineupParams = DEFAULT_LINEUP_PARAMS,
  cutoffDate?: string
): Record<string, Propensity> {
  const out: Record<string, Propensity> = {};
  const regular = bouts.filter(
    (b) => b.stage === "regular" && b.position <= 3 && (!cutoffDate || b.date < cutoffDate)
  );
  for (const player of roster) {
    const pos = [params.positionPrior, params.positionPrior, params.positionPrior];
    let tiebreak = 0.5;
    let appearances = 0;
    let teamMatches = 0;
    // 選手が所属していたチームの試合数 (シーズン×チームごと)
    const matchKeys = new Map<string, number>();
    for (const b of regular) {
      const side = b.homePlayer === player ? "home" : b.awayPlayer === player ? "away" : null;
      if (!side) continue;
      const w = b.season === currentSeason ? 1 : params.previousSeasonWeight;
      const team = side === "home" ? b.homeTeam : b.awayTeam;
      matchKeys.set(`${b.season}|${team}|${b.slug}|${b.matchNo}`, w);
      if (b.position === 3) tiebreak += w;
      else {
        pos[b.position] += w;
        appearances += w;
      }
    }
    // 所属チームの全試合数 (出場しなかった試合も含める)
    const teams = new Set([...matchKeys.keys()].map((k) => k.split("|").slice(0, 2).join("|")));
    const seen = new Set<string>();
    for (const b of regular) {
      for (const team of [b.homeTeam, b.awayTeam]) {
        const tk = `${b.season}|${team}`;
        const mk = `${tk}|${b.slug}|${b.matchNo}`;
        if (!teams.has(tk) || seen.has(mk)) continue;
        seen.add(mk);
        teamMatches += b.season === currentSeason ? 1 : params.previousSeasonWeight;
      }
    }
    const total = pos[0] + pos[1] + pos[2];
    const blend = (x: number) => (1 - params.positionWeight) / 3 + params.positionWeight * (x / total);
    out[player] = {
      participation:
        (appearances + params.participationPrior * 0.75) / (teamMatches + params.participationPrior),
      position: [blend(pos[0]), blend(pos[1]), blend(pos[2])],
      tiebreak,
    };
  }
  return out;
}

/** 4人から3人を選んで並べる全通り (先鋒, 中堅, 大将) */
export function permutations3(roster: string[]): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const a of roster)
    for (const b of roster)
      for (const c of roster) if (a !== b && a !== c && b !== c) out.push([a, b, c]);
  return out;
}

function lineupWeight(lineup: [string, string, string], props: Record<string, Propensity>): number {
  let w = 1;
  lineup.forEach((p, slot) => {
    const pr = props[p];
    w *= pr ? pr.participation * pr.position[slot] : 0.25;
  });
  return w;
}

function normalize<T>(items: Array<{ item: T; w: number }>): Array<{ item: T; p: number }> {
  const sum = items.reduce((s, x) => s + x.w, 0) || 1;
  return items.map((x) => ({ item: x.item, p: x.w / sum }));
}

/** AWAY (先出し) のラインナップの確率 */
export function awayLineupProb(
  lineup: [string, string, string],
  roster: string[],
  props: Record<string, Propensity>
): number {
  const all = permutations3(roster).map((l) => lineupWeight(l, props));
  const sum = all.reduce((s, w) => s + w, 0) || 1;
  return lineupWeight(lineup, props) / sum;
}

/** 相手の先出しを見た HOME (後出し) のラインナップの確率 */
export function homeLineupProb(
  lineup: [string, string, string],
  away: [string, string, string],
  roster: string[],
  props: Record<string, Propensity>,
  boutHomeWin: (home: string, away: string, firstTo: number) => number,
  params: LineupParams = DEFAULT_LINEUP_PARAMS
): number {
  const score = (home: [string, string, string]) =>
    lineupWeight(home, props) *
    Math.exp(
      params.homeCounterBeta *
        home.reduce((s, h, slot) => s + (SLOT_POINTS[slot] / 10) * boutHomeWin(h, away[slot], slot === 2 ? 3 : 2), 0)
    );
  const sum = permutations3(roster).reduce((s, l) => s + score(l), 0) || 1;
  return score(lineup) / sum;
}

export interface TeamMatchDistribution {
  /** HOME 視点の 6 通りのスコア確率 */
  weights: {
    HOME_40_0: number;
    HOME_30_10: number;
    HOME_30_20: number;
    AWAY_30_20: number;
    AWAY_30_10: number;
    AWAY_40_0: number;
  };
  homeWin: number;
  /** 起こりやすい対戦の組み合わせ (上位) */
  topLineups: Array<{
    away: [string, string, string];
    home: [string, string, string];
    prob: number;
    boutHomeWin: [number, number, number];
  }>;
  /** 各ポジションへの出場確率 */
  slotAppearance: {
    home: Array<Record<string, number>>;
    away: Array<Record<string, number>>;
  };
  tiebreakHomeWin: number;
}

/**
 * 出場選手の不確実性を含めたチーム戦のスコア分布
 * boutHomeWin(homePlayer, awayPlayer, firstTo) は HOME 選手のボウト勝率
 */
export function teamMatchDistribution(
  homeRoster: string[],
  awayRoster: string[],
  homeProps: Record<string, Propensity>,
  awayProps: Record<string, Propensity>,
  boutHomeWin: (home: string, away: string, firstTo: number) => number,
  params: LineupParams = DEFAULT_LINEUP_PARAMS
): TeamMatchDistribution {
  const cache = new Map<string, number>();
  const bout = (h: string, a: string, firstTo: number) => {
    const key = `${h}|${a}|${firstTo}`;
    let v = cache.get(key);
    if (v == null) {
      v = boutHomeWin(h, a, firstTo);
      cache.set(key, v);
    }
    return v;
  };

  const awayLineups = normalize(
    permutations3(awayRoster).map((l) => ({ item: l, w: lineupWeight(l, awayProps) }))
  );
  const homePerms = permutations3(homeRoster);

  // 延長: 双方とも起用傾向で重み付けした平均
  const tbHome = normalize(homeRoster.map((p) => ({ item: p, w: homeProps[p]?.tiebreak ?? 0.5 })));
  const tbAway = normalize(awayRoster.map((p) => ({ item: p, w: awayProps[p]?.tiebreak ?? 0.5 })));
  let pT = 0;
  for (const h of tbHome) for (const a of tbAway) pT += h.p * a.p * bout(h.item, a.item, 2);

  const weights = { HOME_40_0: 0, HOME_30_10: 0, HOME_30_20: 0, AWAY_30_20: 0, AWAY_30_10: 0, AWAY_40_0: 0 };
  const slotHome: Array<Record<string, number>> = [{}, {}, {}];
  const slotAway: Array<Record<string, number>> = [{}, {}, {}];
  const combos: TeamMatchDistribution["topLineups"] = [];

  for (const { item: away, p: pAway } of awayLineups) {
    away.forEach((pl, s) => (slotAway[s][pl] = (slotAway[s][pl] ?? 0) + pAway));
    const homeChoices = normalize(
      homePerms.map((home) => {
        const probs = home.map((h, s) => bout(h, away[s], s === 2 ? 3 : 2));
        const expectedPts = probs.reduce((sum, p, s) => sum + (SLOT_POINTS[s] / 10) * p, 0);
        return {
          item: { home, probs: probs as [number, number, number] },
          w: lineupWeight(home, homeProps) * Math.exp(params.homeCounterBeta * expectedPts),
        };
      })
    );
    for (const { item, p: pHome } of homeChoices) {
      const p = pAway * pHome;
      if (p < 1e-6) continue;
      item.home.forEach((pl, s) => (slotHome[s][pl] = (slotHome[s][pl] ?? 0) + p));
      const [pV, pM, pA] = item.probs;
      const qV = 1 - pV;
      const qM = 1 - pM;
      const qA = 1 - pA;
      const tie = pV * pM * qA + qV * qM * pA;
      weights.HOME_40_0 += p * pV * pM * pA;
      weights.HOME_30_10 += p * (pV * qM + qV * pM) * pA;
      weights.HOME_30_20 += p * tie * pT;
      weights.AWAY_30_20 += p * tie * (1 - pT);
      weights.AWAY_30_10 += p * (qV * pM + pV * qM) * qA;
      weights.AWAY_40_0 += p * qV * qM * qA;
      combos.push({ away, home: item.home, prob: p, boutHomeWin: item.probs });
    }
  }

  combos.sort((a, b) => b.prob - a.prob);
  return {
    weights,
    homeWin: weights.HOME_40_0 + weights.HOME_30_10 + weights.HOME_30_20,
    topLineups: combos.slice(0, 5),
    slotAppearance: { home: slotHome, away: slotAway },
    tiebreakHomeWin: pT,
  };
}
