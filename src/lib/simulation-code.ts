import type {
  DivisionId,
  MatchRecord,
  ScorePatternId,
} from "./types";
import { calculateStandings } from "./simulator";

export const HOME_WIN_PATTERNS: ScorePatternId[] = [
  "HOME_30_10",
  "HOME_30_20",
  "HOME_40_0",
];

export const AWAY_WIN_PATTERNS: ScorePatternId[] = [
  "AWAY_30_10",
  "AWAY_30_20",
  "AWAY_40_0",
];

export const ALL_PATTERNS: ScorePatternId[] = [
  ...HOME_WIN_PATTERNS,
  ...AWAY_WIN_PATTERNS,
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function mapPlanToScorePattern(
  side: "home" | "away",
  teamGain: number,
  oppGain: number
): ScorePatternId {
  const homePt = side === "home" ? teamGain : oppGain;
  const awayPt = side === "home" ? oppGain : teamGain;
  if (homePt === 40 && awayPt === 0) return "HOME_40_0";
  if (homePt === 30 && awayPt === 10) return "HOME_30_10";
  if (homePt === 30 && awayPt === 20) return "HOME_30_20";
  if (homePt === 20 && awayPt === 30) return "AWAY_30_20";
  if (homePt === 10 && awayPt === 30) return "AWAY_30_10";
  return "AWAY_40_0";
}

/**
 * 指定した推しチーム (targetTeamKey) が指定順位 (targetRank: 1 | 2 | 3) になるような
 * 未消化全試合のスコアパターン組み合わせを探索して返す
 */
export function generateOutcomesForTargetRank(
  division: DivisionId,
  allMatches: MatchRecord[],
  targetTeamKey: string,
  targetRank: 1 | 2 | 3
): Record<string, ScorePatternId> {
  const unplayed = allMatches.filter(
    (m) => m.division === division && !m.played
  );
  const currentStandings = calculateStandings(division, allMatches);
  const otherTeams = currentStandings
    .filter((t) => t.key !== targetTeamKey)
    .map((t) => t.key);

  const winForSide = (side: "home" | "away", dominant = false): ScorePatternId => {
    if (dominant) {
      return side === "home"
        ? Math.random() < 0.6
          ? "HOME_40_0"
          : "HOME_30_10"
        : Math.random() < 0.6
          ? "AWAY_40_0"
          : "AWAY_30_10";
    }
    return side === "home"
      ? pickRandom(HOME_WIN_PATTERNS)
      : pickRandom(AWAY_WIN_PATTERNS);
  };

  const misses: Array<{ gap: number; candidate: Record<string, ScorePatternId> }> = [];

  // 最大800回試行し、targetTeamKey がちょうど targetRank 位になる自然なスコア分布を探す
  for (let attempt = 0; attempt < 800; attempt++) {
    const candidate: Record<string, ScorePatternId> = {};

    const shuffledOthers = [...otherTeams].sort(() => Math.random() - 0.5);
    const higherCount = targetRank - 1;
    const higherSet = new Set(
      (attempt < 400 ? otherTeams : shuffledOthers).slice(0, higherCount)
    );

    const targetWinRateVsLower =
      targetRank === 1
        ? 0.95
        : targetRank === 2
          ? 0.35 + (attempt % 10) * 0.06
          : 0.2 + (attempt % 10) * 0.06;

    for (const m of unplayed) {
      if (m.home === targetTeamKey || m.away === targetTeamKey) {
        const targetSide: "home" | "away" =
          m.home === targetTeamKey ? "home" : "away";
        const oppSide: "home" | "away" =
          targetSide === "home" ? "away" : "home";
        const oppKey = targetSide === "home" ? m.away : m.home;

        if (targetRank === 1) {
          candidate[m.id] =
            Math.random() < 0.92
              ? winForSide(targetSide, attempt > 200)
              : winForSide(oppSide);
        } else if (higherSet.has(oppKey)) {
          candidate[m.id] =
            Math.random() < 0.85
              ? winForSide(oppSide, true)
              : winForSide(targetSide);
        } else {
          candidate[m.id] =
            Math.random() < targetWinRateVsLower
              ? winForSide(targetSide)
              : winForSide(oppSide);
        }
      } else {
        const homeIsHigher = higherSet.has(m.home);
        const awayIsHigher = higherSet.has(m.away);

        if (homeIsHigher && !awayIsHigher) {
          candidate[m.id] =
            Math.random() < 0.88
              ? winForSide("home", true)
              : winForSide("away");
        } else if (awayIsHigher && !homeIsHigher) {
          candidate[m.id] =
            Math.random() < 0.88
              ? winForSide("away", true)
              : winForSide("home");
        } else if (!homeIsHigher && !awayIsHigher && targetRank < 3) {
          candidate[m.id] = pickRandom([
            "HOME_30_20",
            "AWAY_30_20",
            "HOME_30_10",
            "AWAY_30_10",
          ]);
        } else {
          candidate[m.id] = pickRandom(ALL_PATTERNS);
        }
      }
    }

    const gap = rankGap(division, allMatches, candidate, targetTeamKey, targetRank);
    if (gap === 0) {
      return candidate;
    }
    misses.push({ gap, candidate });
  }

  // 下位チームの「2位・3位」のように条件が厳しいと、ランダム探索だけでは
  // 見つからないことがある。近かった候補から順に1試合ずつ直して目標順位に寄せる。
  misses.sort((a, b) => a.gap - b.gap);
  for (const { candidate } of misses.slice(0, 20)) {
    const repaired = repairTowardRank(division, allMatches, unplayed, candidate, targetTeamKey, targetRank);
    if (repaired) return repaired;
  }
  return misses[0]?.candidate ?? {};
}

/**
 * 目標順位までの距離。0 なら目標順位ちょうど。
 * 抜く/抜かれる必要があるチームごとの勝ち点差（最低1）の合計。
 */
function rankGap(
  division: DivisionId,
  allMatches: MatchRecord[],
  outcomes: Record<string, ScorePatternId>,
  targetTeamKey: string,
  targetRank: number
): number {
  const standings = calculateStandings(division, allMatches, outcomes);
  const index = standings.findIndex((t) => t.key === targetTeamKey);
  if (index < 0) return Number.POSITIVE_INFINITY;
  const rank = standings[index].rank;
  if (rank === targetRank) return 0;
  const point = standings[index].point;
  // 上にいてはいけないチーム、または上に来るべきチーム
  const others = rank > targetRank
    ? standings.slice(targetRank - 1, index)
    : standings.slice(index + 1, targetRank);
  // 同率順位では入れ替えるべきチームが範囲に入らないことがあるので、最低1にする
  return Math.max(1, others.reduce((sum, team) => sum + Math.abs(team.point - point) + 1, 0));
}

function repairTowardRank(
  division: DivisionId,
  allMatches: MatchRecord[],
  unplayed: MatchRecord[],
  start: Record<string, ScorePatternId>,
  targetTeamKey: string,
  targetRank: number
): Record<string, ScorePatternId> | undefined {
  let current = { ...start };
  let currentGap = rankGap(division, allMatches, current, targetTeamKey, targetRank);
  for (let step = 0; step < unplayed.length * 4 && currentGap > 0; step++) {
    let next: Record<string, ScorePatternId> | undefined;
    let nextGap = currentGap;
    for (const m of unplayed) {
      for (const pattern of ALL_PATTERNS) {
        if (current[m.id] === pattern) continue;
        const candidate = { ...current, [m.id]: pattern };
        const gap = rankGap(division, allMatches, candidate, targetTeamKey, targetRank);
        if (gap < nextGap) {
          nextGap = gap;
          next = candidate;
        }
      }
    }
    if (!next) return undefined;
    current = next;
    currentGap = nextGap;
  }
  return currentGap === 0 ? current : undefined;
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const CODE_TO_PATTERN: Array<ScorePatternId | null> = [
  null,
  "AWAY_40_0",
  "AWAY_30_10",
  "AWAY_30_20",
  "HOME_30_20",
  "HOME_30_10",
  "HOME_40_0",
];

const PATTERN_TO_CODE: Record<ScorePatternId, number> = {
  AWAY_40_0: 1,
  AWAY_30_10: 2,
  AWAY_30_20: 3,
  HOME_30_20: 4,
  HOME_30_10: 5,
  HOME_40_0: 6,
};

/**
 * 未消化試合の選択状態を 1文字あたり2試合（3bit × 2 = 6bit Base64url）に圧縮エンコードする
 */
export function encodeSimulationCode(
  unplayedMatches: MatchRecord[],
  outcomes: Record<string, ScorePatternId>
): string {
  let result = "";
  for (let i = 0; i < unplayedMatches.length; i += 2) {
    const m1 = unplayedMatches[i];
    const m2 = unplayedMatches[i + 1];
    const c1 = (m1 && outcomes[m1.id] ? PATTERN_TO_CODE[outcomes[m1.id]] : 0) || 0;
    const c2 = (m2 && outcomes[m2.id] ? PATTERN_TO_CODE[outcomes[m2.id]] : 0) || 0;
    const val = (c1 << 3) | c2;
    result += B64_CHARS[val];
  }
  return result.replace(/A+$/, "");
}

/**
 * 短縮Base64urlコードから試合結果マップへ安全にデコードする
 */
export function decodeSimulationCode(
  unplayedMatches: MatchRecord[],
  code: string
): Record<string, ScorePatternId> {
  const nextMap: Record<string, ScorePatternId> = Object.create(null);
  const maxChars = Math.ceil(unplayedMatches.length / 2);
  const cleanCode = code.slice(0, maxChars);

  for (let i = 0; i < cleanCode.length; i++) {
    const val = B64_CHARS.indexOf(cleanCode[i]);
    if (val < 0) continue;
    const c1 = (val >> 3) & 0b111;
    const c2 = val & 0b111;
    const m1 = unplayedMatches[i * 2];
    const m2 = unplayedMatches[i * 2 + 1];
    const pat1 = CODE_TO_PATTERN[c1];
    const pat2 = CODE_TO_PATTERN[c2];
    if (m1 && pat1) nextMap[m1.id] = pat1;
    if (m2 && pat2) nextMap[m2.id] = pat2;
  }
  return { ...nextMap };
}
