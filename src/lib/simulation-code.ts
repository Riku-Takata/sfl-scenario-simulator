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

    const simResult = calculateStandings(division, allMatches, candidate);
    const achievedRank = simResult.find((t) => t.key === targetTeamKey)?.rank;
    if (achievedRank === targetRank) {
      return candidate;
    }
  }

  const fallback: Record<string, ScorePatternId> = {};
  for (const m of unplayed) {
    fallback[m.id] = pickRandom(ALL_PATTERNS);
  }
  return fallback;
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
