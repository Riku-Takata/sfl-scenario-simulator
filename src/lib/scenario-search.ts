/**
 * 予測モデルの確率にもとづいて、最も起こりやすい展開を探す。
 * 設計: docs/simulator-feasibility-and-realistic-fill.md §4
 *
 * - 試合は互いに独立とみなし、展開の確率は各試合のスコア確率の積とする
 * - 目標 (チーム・順位) があるときは、その順位になる展開のうち確率の積が大きい順に最大 limit 件を返す
 * - 分枝限定法: 「ここまでの対数確率 + 残りの試合の最大対数確率」が limit 件目に届かない枝は打ち切る。
 *   ポイントの上限・下限から目標の順位に届かない枝も打ち切る
 * - 順位は画面と同じ calculateStandings (得失差は代表値) で判定する
 */
import { calculateStandings, SCORE_OUTCOMES, TEAM_META_MAP } from "./simulator";
import type { DivisionId, MatchOutcomePrediction, MatchRecord, ScorePatternId } from "./types";

const POINTS: Record<ScorePatternId, { home: number; away: number }> = Object.fromEntries(
  SCORE_OUTCOMES.map((o) => [o.id, { home: o.homePoint, away: o.awayPoint }])
) as Record<ScorePatternId, { home: number; away: number }>;
const MIN_PROBABILITY = 1e-6;

export interface ScenarioDeviation {
  matchId: string;
  pattern: ScorePatternId;
  probability: number;
  mostLikely: ScorePatternId;
  mostLikelyProbability: number;
}

export interface LikelyScenario {
  /** 未確定の試合 ID → スコア (固定した試合を含む) */
  outcomes: Record<string, ScorePatternId>;
  /** 探索した試合だけの確率の積 (固定した試合は含めない) */
  probability: number;
  /** モデルの最有力と違うスコアを選んだ試合 */
  deviations: ScenarioDeviation[];
}

export interface LikelyScenarioResult {
  scenarios: LikelyScenario[];
  /** 時間内に探索を終えたか。false なら、見つかった中で最も起こりやすいもの */
  exhaustive: boolean;
}

export interface LikelyScenarioParams {
  division: DivisionId;
  matches: MatchRecord[];
  predictions: Record<string, MatchOutcomePrediction> | undefined;
  /** すでに決めた試合 (ユーザー入力など)。探索せずにこのまま使う */
  fixed?: Record<string, ScorePatternId>;
  target?: { teamKey: string; rank: number };
  limit?: number;
  timeLimitMs?: number;
}

/** 予測が無い試合は、これまでのスコアの出現率 (SCORE_OUTCOMES の重み) を使う。 */
function weightsFor(match: MatchRecord, predictions: LikelyScenarioParams["predictions"]): Record<ScorePatternId, number> {
  const predicted = predictions?.[match.id]?.weights;
  const raw = Object.fromEntries(
    SCORE_OUTCOMES.map((o) => [o.id, predicted?.[o.id] ?? o.probabilityWeight])
  ) as Record<ScorePatternId, number>;
  const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.max(MIN_PROBABILITY, v / total)])) as Record<ScorePatternId, number>;
}

export function findLikelyScenarios(params: LikelyScenarioParams): LikelyScenarioResult {
  const { division, matches, predictions, fixed = {}, target, limit = 5 } = params;
  const deadline = Date.now() + (params.timeLimitMs ?? 1500);
  const open = matches
    .filter((m) => m.division === division && !m.played && !fixed[m.id])
    .map((m) => {
      const weights = weightsFor(m, predictions);
      const order = [...SCORE_OUTCOMES].map((o) => o.id).sort((a, b) => weights[b] - weights[a]);
      return { match: m, weights, order, maxLog: Math.log(weights[order[0]]) };
    });
  // 確率の偏りが大きい試合から決めると、早く良い解が見つかり枝刈りが効く
  open.sort((a, b) => b.maxLog - a.maxLog);
  const suffixMax: number[] = new Array(open.length + 1).fill(0);
  for (let i = open.length - 1; i >= 0; i--) suffixMax[i] = suffixMax[i + 1] + open[i].maxLog;

  // ポイントによる枝刈り用の状態
  const teamKeys = Object.values(TEAM_META_MAP).filter((t) => t.division === division).map((t) => t.key);
  const base = calculateStandings(division, matches, fixed);
  const points: Record<string, number> = Object.fromEntries(base.map((t) => [t.key, t.point]));
  const remaining: Record<string, number> = Object.fromEntries(teamKeys.map((k) => [k, 0]));
  for (const { match } of open) {
    remaining[match.home]++;
    remaining[match.away]++;
  }

  const found: Array<{ logp: number; outcomes: Record<string, ScorePatternId> }> = [];
  const assignment: Record<string, ScorePatternId> = {};
  let exhaustive = true;
  let nodes = 0;

  const threshold = () => (found.length < limit ? Number.NEGATIVE_INFINITY : found[found.length - 1].logp);

  const targetStillReachable = (): boolean => {
    if (!target) return true;
    const t = target.teamKey;
    const tMax = points[t] + remaining[t] * 40;
    const tMin = points[t];
    let certainlyAbove = 0;
    let certainlyBelow = 0;
    for (const k of teamKeys) {
      if (k === t) continue;
      if (points[k] > tMax) certainlyAbove++;
      if (points[k] + remaining[k] * 40 < tMin) certainlyBelow++;
    }
    return certainlyAbove <= target.rank - 1 && certainlyBelow <= teamKeys.length - target.rank;
  };

  const accept = (logp: number) => {
    const outcomes = { ...fixed, ...assignment };
    if (target) {
      const rank = calculateStandings(division, matches, outcomes).find((t) => t.key === target.teamKey)?.rank;
      if (rank !== target.rank) return;
    }
    found.push({ logp, outcomes });
    found.sort((a, b) => b.logp - a.logp);
    if (found.length > limit) found.pop();
  };

  const recurse = (i: number, logp: number): boolean => {
    if (++nodes % 2048 === 0 && Date.now() > deadline) {
      exhaustive = false;
      return false;
    }
    if (logp + suffixMax[i] <= threshold()) return true;
    if (!targetStillReachable()) return true;
    if (i === open.length) {
      accept(logp);
      return true;
    }
    const { match, weights, order } = open[i];
    for (const pattern of order) {
      const lp = logp + Math.log(weights[pattern]);
      if (lp + suffixMax[i + 1] <= threshold()) break; // 以降のスコアはさらに確率が低い
      assignment[match.id] = pattern;
      points[match.home] += POINTS[pattern].home;
      points[match.away] += POINTS[pattern].away;
      remaining[match.home]--;
      remaining[match.away]--;
      const ok = recurse(i + 1, lp);
      points[match.home] -= POINTS[pattern].home;
      points[match.away] -= POINTS[pattern].away;
      remaining[match.home]++;
      remaining[match.away]++;
      delete assignment[match.id];
      if (!ok) return false;
    }
    return true;
  };
  recurse(0, 0);

  const scenarios = found.map(({ logp, outcomes }) => ({
    outcomes,
    probability: Math.exp(logp),
    deviations: open
      .filter(({ match, order }) => outcomes[match.id] !== order[0])
      .map(({ match, weights, order }) => ({
        matchId: match.id,
        pattern: outcomes[match.id],
        probability: weights[outcomes[match.id]],
        mostLikely: order[0],
        mostLikelyProbability: weights[order[0]],
      })),
  }));
  return { scenarios, exhaustive };
}
