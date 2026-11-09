/**
 * 到達可能性の厳密判定。残り試合を全通り数え上げ、各チームの最良・最悪の順位を求める。
 * 設計: docs/simulator-feasibility-and-realistic-fill.md §3
 *
 * - 最良の順位: 自チームの残り試合をすべて 40-0 の勝ちにして、ほかの試合を数え上げる
 *   (40-0 は自チームのポイント・得失差を最大に、相手のポイントを最小にするので、これより良くはならない)
 * - 最悪の順位: 自チームを全敗 (0-40) にして同様に数え上げる
 * - ポイントが同点なら、得失差の幅 (score-format) が重なる限り「得失差次第」とする。
 *   そのため「不可能」「確定」と出すのは、どの得失差でもそうなるときだけになる。
 */
import { SCORE_DIFF_RANGES, type Range } from "./score-format";
import { TEAM_META_MAP } from "./simulator";
import type { DivisionId, MatchRecord, ScorePatternId } from "./types";

const PATTERNS: Array<{ id: ScorePatternId; home: number; away: number }> = [
  { id: "HOME_40_0", home: 40, away: 0 },
  { id: "HOME_30_10", home: 30, away: 10 },
  { id: "HOME_30_20", home: 30, away: 20 },
  { id: "AWAY_30_20", home: 20, away: 30 },
  { id: "AWAY_30_10", home: 10, away: 30 },
  { id: "AWAY_40_0", home: 0, away: 40 },
];
const POINTS: Record<ScorePatternId, { home: number; away: number }> = Object.fromEntries(
  PATTERNS.map((p) => [p.id, { home: p.home, away: p.away }])
) as Record<ScorePatternId, { home: number; away: number }>;

export interface TeamRankBounds {
  teamKey: string;
  /** 最も都合のよい結果での順位 */
  bestRank: number;
  /** bestRank が、ポイント同点を得失差で上回ることを前提にしているか */
  bestRankNeedsTiebreak: boolean;
  /** 得失差に頼らずに (同点を不利に数えても) 届く最高の順位 */
  bestRankWithoutTiebreak: number;
  /** 最も都合の悪い結果での順位 */
  worstRank: number;
  /** worstRank が、ポイント同点を得失差で下回ることを前提にしているか */
  worstRankNeedsTiebreak: boolean;
  maxPoints: number;
  minPoints: number;
  /** 時間内に数え上げを終えたか。false なら bestRank/worstRank は目安 */
  exhaustive: boolean;
}

interface TeamState {
  key: string;
  name: string;
  point: number;
  battle: Range;
  round: Range;
}

type Relation = "above" | "below" | "either";

/** o が t より上か。ポイント → バトル得失 → ラウンド得失 → 名前 (sortStandings と同じ順)。 */
function relation(o: TeamState, t: TeamState): Relation {
  if (o.point !== t.point) return o.point > t.point ? "above" : "below";
  if (o.battle.min > t.battle.max) return "above";
  if (o.battle.max < t.battle.min) return "below";
  const battleFixed = o.battle.min === o.battle.max && t.battle.min === t.battle.max;
  if (!battleFixed) return "either";
  if (o.round.min > t.round.max) return "above";
  if (o.round.max < t.round.min) return "below";
  const roundFixed = o.round.min === o.round.max && t.round.min === t.round.max;
  if (!roundFixed) return "either";
  return o.name.localeCompare(t.name) < 0 ? "above" : "below";
}

function addRange(a: Range, b: Range): Range {
  return { min: a.min + b.min, max: a.max + b.max };
}

function applyPattern(states: Record<string, TeamState>, match: MatchRecord, pattern: ScorePatternId): void {
  const home = states[match.home];
  const away = states[match.away];
  const ranges = SCORE_DIFF_RANGES[pattern];
  home.point += POINTS[pattern].home;
  away.point += POINTS[pattern].away;
  home.battle = addRange(home.battle, ranges.home.battle);
  home.round = addRange(home.round, ranges.home.round);
  away.battle = addRange(away.battle, ranges.away.battle);
  away.round = addRange(away.round, ranges.away.round);
}

function snapshot(states: Record<string, TeamState>): Record<string, TeamState> {
  return Object.fromEntries(Object.entries(states).map(([k, s]) => [k, { ...s, battle: { ...s.battle }, round: { ...s.round } }]));
}

/** 確定した試合 (実績・ユーザー入力) を反映した状態と、未確定の試合。 */
function baseState(division: DivisionId, matches: MatchRecord[], customOutcomes: Record<string, ScorePatternId>) {
  const states: Record<string, TeamState> = {};
  for (const meta of Object.values(TEAM_META_MAP)) {
    if (meta.division !== division) continue;
    states[meta.key] = { key: meta.key, name: meta.name, point: 0, battle: { min: 0, max: 0 }, round: { min: 0, max: 0 } };
  }
  const open: MatchRecord[] = [];
  for (const m of matches) {
    if (m.division !== division || !states[m.home] || !states[m.away]) continue;
    const custom = customOutcomes[m.id];
    if (custom) {
      applyPattern(states, m, custom);
    } else if (m.played) {
      const h = states[m.home];
      const a = states[m.away];
      h.point += m.homePoint;
      a.point += m.awayPoint;
      h.battle = addRange(h.battle, { min: m.homeBattleDiff, max: m.homeBattleDiff });
      h.round = addRange(h.round, { min: m.homeRoundDiff, max: m.homeRoundDiff });
      a.battle = addRange(a.battle, { min: m.awayBattleDiff, max: m.awayBattleDiff });
      a.round = addRange(a.round, { min: m.awayRoundDiff, max: m.awayRoundDiff });
    } else {
      open.push(m);
    }
  }
  return { states, open };
}

export interface RankBoundsOptions {
  /** この時間を過ぎたら数え上げを打ち切り、exhaustive: false を返す */
  timeLimitMs?: number;
}

/** ディビジョンの全チームについて、最良・最悪の順位を求める。 */
export function computeRankBounds(
  division: DivisionId,
  matches: MatchRecord[],
  customOutcomes: Record<string, ScorePatternId> = {},
  options: RankBoundsOptions = {}
): Record<string, TeamRankBounds> {
  const deadline = Date.now() + (options.timeLimitMs ?? 10_000);
  const { states: base, open } = baseState(division, matches, customOutcomes);
  const result: Record<string, TeamRankBounds> = {};
  for (const teamKey of Object.keys(base)) {
    const best = searchRank(base, open, teamKey, "best", deadline);
    const worst = searchRank(base, open, teamKey, "worst", deadline);
    const own = open.filter((m) => m.home === teamKey || m.away === teamKey).length;
    result[teamKey] = {
      teamKey,
      bestRank: 1 + best.strict,
      bestRankNeedsTiebreak: best.safe > best.strict,
      bestRankWithoutTiebreak: 1 + best.safe,
      worstRank: 1 + worst.pessimistic,
      worstRankNeedsTiebreak: worst.safe < worst.pessimistic,
      maxPoints: base[teamKey].point + own * 40,
      minPoints: base[teamKey].point,
      exhaustive: best.exhaustive && worst.exhaustive,
    };
  }
  return result;
}

interface SearchResult {
  /** best: 得失差を有利に解釈したときの、上にいるチーム数の最小 / worst: 未使用 */
  strict: number;
  /** best: 得失差を不利に解釈したときの最小 / worst: 有利に解釈したときの最大 */
  safe: number;
  /** worst: 得失差を不利に解釈したときの、上にいるチーム数の最大 */
  pessimistic: number;
  exhaustive: boolean;
}

function searchRank(
  base: Record<string, TeamState>,
  open: MatchRecord[],
  teamKey: string,
  mode: "best" | "worst",
  deadline: number
): SearchResult {
  const states = snapshot(base);
  // 自チームの試合は、best なら全勝 (40-0)、worst なら全敗 (0-40) に固定する
  for (const m of open) {
    if (m.home !== teamKey && m.away !== teamKey) continue;
    const teamIsHome = m.home === teamKey;
    const win = mode === "best";
    const pattern: ScorePatternId = teamIsHome === win ? "HOME_40_0" : "AWAY_40_0";
    applyPattern(states, m, pattern);
  }
  const others = open.filter((m) => m.home !== teamKey && m.away !== teamKey);
  const team = states[teamKey];
  const otherKeys = Object.keys(states).filter((k) => k !== teamKey);
  // 枝刈り用: 各チームが残りの試合で得られる最大ポイント
  const remainingMax: Record<string, number> = Object.fromEntries(otherKeys.map((k) => [k, 0]));
  for (const m of others) {
    remainingMax[m.home] += 40;
    remainingMax[m.away] += 40;
  }

  let strict = Number.POSITIVE_INFINITY;
  let safe = Number.POSITIVE_INFINITY;
  let pessimistic = -1;
  let safeMax = -1;
  let exhaustive = true;
  let nodes = 0;

  const leaf = () => {
    let above = 0;
    let either = 0;
    for (const k of otherKeys) {
      const r = relation(states[k], team);
      if (r === "above") above++;
      else if (r === "either") either++;
    }
    if (mode === "best") {
      strict = Math.min(strict, above);
      safe = Math.min(safe, above + either);
    } else {
      pessimistic = Math.max(pessimistic, above + either);
      safeMax = Math.max(safeMax, above);
    }
  };

  const recurse = (i: number): boolean => {
    if (++nodes % 4096 === 0 && Date.now() > deadline) {
      exhaustive = false;
      return false;
    }
    if (mode === "best") {
      if (safe === 0) return true; // これ以上良くならない
      // ポイントは増えるだけなので、すでに上にいるチームは上に残る。strict ≤ safe なので safe で枝刈りする
      let certain = 0;
      for (const k of otherKeys) if (states[k].point > team.point) certain++;
      if (certain >= safe) return true;
    } else {
      // 有利・不利どちらの解釈の最大も正確に残すため、safeMax で枝刈りする (safeMax ≤ pessimistic)
      if (safeMax === otherKeys.length) return true;
      let possible = 0;
      for (const k of otherKeys) {
        const left = remainingMax[k];
        if (states[k].point + left >= team.point) possible++;
      }
      if (possible <= safeMax) return true;
    }
    if (i === others.length) {
      leaf();
      return true;
    }
    const m = others[i];
    for (const p of PATTERNS) {
      const h = states[m.home];
      const a = states[m.away];
      const saved = { h: { ...h, battle: { ...h.battle }, round: { ...h.round } }, a: { ...a, battle: { ...a.battle }, round: { ...a.round } } };
      remainingMax[m.home] -= 40;
      remainingMax[m.away] -= 40;
      applyPattern(states, m, p.id);
      const ok = recurse(i + 1);
      states[m.home] = saved.h;
      states[m.away] = saved.a;
      remainingMax[m.home] += 40;
      remainingMax[m.away] += 40;
      if (!ok) return false;
    }
    return true;
  };
  recurse(0);

  if (mode === "best") {
    return { strict, safe, pessimistic: -1, exhaustive };
  }
  return { strict: -1, safe: safeMax, pessimistic, exhaustive };
}

export type TargetStatus = "clinched" | "possible" | "tiny" | "tiebreak" | "impossible" | "unknown";

/**
 * 目標順位 (1位、プレイオフ = 3位以内) に対する状態。probability はモンテカルロの確率 (%)。
 * 設計 §3.4 の対応表どおり。
 */
export function targetStatus(bounds: TeamRankBounds | undefined, targetRank: number, probability: number): TargetStatus {
  if (!bounds) return "unknown";
  if (bounds.exhaustive && bounds.worstRank <= targetRank) return "clinched";
  if (bounds.bestRank > targetRank) return bounds.exhaustive ? "impossible" : "unknown";
  if (!bounds.exhaustive) return "unknown";
  // 目標に届くのが、ポイント同点を得失差で上回る場合だけか
  if (bounds.bestRankWithoutTiebreak > targetRank && probability < 0.1) return "tiebreak";
  if (probability < 0.1) return "tiny";
  return "possible";
}

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  clinched: "確定",
  possible: "",
  tiny: "0.1%未満（可能性あり）",
  tiebreak: "得失差次第で可能",
  impossible: "不可能",
  unknown: "判定中（概算）",
};

/** 状態と確率から、画面に出す文字列を作る。 */
export function formatTargetProbability(status: TargetStatus, probability: number): string {
  if (status === "possible") return `${probability.toFixed(1)}%`;
  if (status === "unknown") return `${probability.toFixed(1)}%（概算）`;
  return TARGET_STATUS_LABEL[status];
}

/** 不可能・得失差次第の理由を1行で説明する。targetLabel は「1位」「プレイオフ（3位以内）」など。 */
export function explainTarget(bounds: TeamRankBounds, targetRank: number, targetLabel: string): string {
  const head = `全勝しても最大${bounds.maxPoints}pt`;
  if (bounds.bestRank > targetRank) {
    const n = bounds.bestRank - 1;
    return `${head}。残り試合の結果がどうなっても少なくとも${n}チームが上に残るため、${targetLabel}は不可能（最高${bounds.bestRank}位${bounds.bestRankNeedsTiebreak ? "・それも得失差次第" : ""}）。`;
  }
  if (bounds.bestRankWithoutTiebreak > targetRank) {
    return `${head}。${targetLabel}に届くのは、ポイントで並んだチームを得失差で上回る場合だけ。`;
  }
  return `${head}。${targetLabel}に届く組み合わせがある。`;
}
