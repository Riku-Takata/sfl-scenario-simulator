/**
 * スコアごとにバトル得失差・ラウンド得失差がとりうる幅。
 *
 * シミュレーターは得失差を代表値で扱う (SCORE_OUTCOMES) が、実際の値は幅が大きい
 * (2026 年の実績では 40-0 のバトル差が +3〜+6)。ポイントが同点になる順位を
 * 「不可能」と決めつけないよう、到達可能性の判定ではこの幅を使う。
 *
 * 試合形式 (2026 年の実績で確認):
 * - 先鋒 10pt・中堅 10pt は2本先取、大将 20pt は3本先取
 * - 20-20 になったら延長 10pt (2本先取) を行い、30-20 で決着する
 * - 各ゲームは2ラウンド先取。勝ったゲームのラウンド差は +1 か +2
 */
import type { ScorePatternId } from "./types";

export interface Range {
  min: number;
  max: number;
}

export interface DiffRange {
  battle: Range;
  round: Range;
}

/** 1ボウトの得失差の幅。firstTo 本先取で、won なら勝ち。 */
export function boutDiffRange(firstTo: number, won: boolean): DiffRange {
  let battle: Range | undefined;
  let round: Range | undefined;
  for (let lost = 0; lost < firstTo; lost++) {
    // 勝ったゲームは +1〜+2 ラウンド、負けたゲームは -2〜-1 ラウンド
    const b = firstTo - lost;
    const rMin = firstTo * 1 - lost * 2;
    const rMax = firstTo * 2 - lost * 1;
    battle = battle ? { min: Math.min(battle.min, b), max: Math.max(battle.max, b) } : { min: b, max: b };
    round = round ? { min: Math.min(round.min, rMin), max: Math.max(round.max, rMax) } : { min: rMin, max: rMax };
  }
  const result = { battle: battle!, round: round! };
  return won ? result : { battle: negate(result.battle), round: negate(result.round) };
}

function negate(range: Range): Range {
  return { min: -range.max, max: -range.min };
}

function sum(ranges: DiffRange[]): DiffRange {
  return ranges.reduce(
    (acc, r) => ({
      battle: { min: acc.battle.min + r.battle.min, max: acc.battle.max + r.battle.max },
      round: { min: acc.round.min + r.round.min, max: acc.round.max + r.round.max },
    }),
    { battle: { min: 0, max: 0 }, round: { min: 0, max: 0 } }
  );
}

function union(ranges: DiffRange[]): DiffRange {
  return {
    battle: { min: Math.min(...ranges.map((r) => r.battle.min)), max: Math.max(...ranges.map((r) => r.battle.max)) },
    round: { min: Math.min(...ranges.map((r) => r.round.min)), max: Math.max(...ranges.map((r) => r.round.max)) },
  };
}

const vanguard = (homeWon: boolean) => boutDiffRange(2, homeWon); // 先鋒・中堅・延長
const captain = (homeWon: boolean) => boutDiffRange(3, homeWon); // 大将

/** HOME から見た、スコアごとの得失差の幅。 */
function homeRange(pattern: ScorePatternId): DiffRange {
  switch (pattern) {
    case "HOME_40_0":
      return sum([vanguard(true), vanguard(true), captain(true)]);
    case "HOME_30_10":
      // 大将と、先鋒・中堅のどちらか1つに勝つ
      return sum([captain(true), vanguard(true), vanguard(false)]);
    case "HOME_30_20":
      return union([
        // 先鋒・中堅に勝ち、大将に負けて、延長に勝つ
        sum([vanguard(true), vanguard(true), captain(false), vanguard(true)]),
        // 大将に勝ち、先鋒・中堅に負けて、延長に勝つ
        sum([captain(true), vanguard(false), vanguard(false), vanguard(true)]),
      ]);
    case "AWAY_30_20":
      return mirror(homeRange("HOME_30_20"));
    case "AWAY_30_10":
      return mirror(homeRange("HOME_30_10"));
    case "AWAY_40_0":
      return mirror(homeRange("HOME_40_0"));
  }
}

function mirror(range: DiffRange): DiffRange {
  return { battle: negate(range.battle), round: negate(range.round) };
}

const PATTERNS: ScorePatternId[] = ["HOME_40_0", "HOME_30_10", "HOME_30_20", "AWAY_30_20", "AWAY_30_10", "AWAY_40_0"];

/** スコアごとに、HOME・AWAY それぞれから見た得失差の幅。 */
export const SCORE_DIFF_RANGES: Record<ScorePatternId, { home: DiffRange; away: DiffRange }> = Object.fromEntries(
  PATTERNS.map((pattern) => {
    const home = homeRange(pattern);
    return [pattern, { home, away: mirror(home) }];
  })
) as Record<ScorePatternId, { home: DiffRange; away: DiffRange }>;

/** ポイントからスコアの種類を決める (実績の試合を幅と突き合わせるため)。 */
export function patternFromPoints(homePoint: number, awayPoint: number): ScorePatternId | undefined {
  const key = `${homePoint}-${awayPoint}`;
  return ({
    "40-0": "HOME_40_0",
    "30-10": "HOME_30_10",
    "30-20": "HOME_30_20",
    "20-30": "AWAY_30_20",
    "10-30": "AWAY_30_10",
    "0-40": "AWAY_40_0",
  } as Record<string, ScorePatternId>)[key];
}
