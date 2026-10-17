import type { PlayerRadarParameters, PositionRecord, VsCharDetail } from "./types";
import { formatCharName } from "./constants";

export function clampScore(val: number, min = 35, max = 99): number {
  return Math.round(Math.max(min, Math.min(max, val)));
}

export function calcPlayerParameters({
  entry,
  avgPointPerEntry,
  winRate,
  eloRating,
  positions,
  homeWinRate,
  awayWinRate,
  battleWinRate,
  roundWinRate,
  overallWinRate,
  playedVsChars,
  actualSubChars,
}: {
  entry: number;
  avgPointPerEntry: number;
  winRate: number;
  eloRating: number;
  positions: {
    anchor: PositionRecord;
    tiebreaker: PositionRecord;
  };
  homeWinRate: number;
  awayWinRate: number;
  battleWinRate: number;
  roundWinRate: number;
  overallWinRate: number;
  playedVsChars: VsCharDetail[];
  actualSubChars: string[];
}): PlayerRadarParameters {
  const eloNorm = (eloRating - 1850) / 2.2;
  const pointEfficiency = clampScore(
    entry > 0
      ? 48 + avgPointPerEntry * 2.1 + (winRate - 50) * 0.25
      : 52 + eloNorm * 0.45
  );

  const anchorAndTieEntries =
    positions.anchor.entries + positions.tiebreaker.entries;
  const anchorAndTieWins =
    positions.anchor.wins + positions.tiebreaker.wins;
  const clutchPower = clampScore(
    anchorAndTieEntries > 0
      ? 55 +
          (anchorAndTieWins / anchorAndTieEntries) * 28 +
          anchorAndTieEntries * 3.5 +
          (eloRating - 1920) * 0.08
      : 48 + (eloRating - 1900) * 0.22 + (winRate - 50) * 0.2
  );

  const homeControl = clampScore(
    42 + (homeWinRate - 40) * 1.35 + (eloRating - 1920) * 0.08
  );

  const awayResilience = clampScore(
    45 + (awayWinRate - 38) * 1.45 + (eloRating - 1920) * 0.1
  );

  const roundDominance = clampScore(
    entry > 0
      ? 45 + (battleWinRate - 45) * 0.65 + (roundWinRate - 45) * 0.55
      : 50 + (overallWinRate * 100 - 50) * 1.4
  );

  const favorableCharCount = playedVsChars.filter(
    (c) => (c.sflBattleWinRate ?? 0) >= 50.0
  ).length;
  const matchupCoverage = clampScore(
    playedVsChars.length > 0
      ? 50 +
          (favorableCharCount / playedVsChars.length) * 35 +
          Math.min(10, actualSubChars.length * 3)
      : 50 + Math.min(10, actualSubChars.length * 3)
  );

  const overallScore = Math.round(
    pointEfficiency * 0.2 +
      clutchPower * 0.18 +
      homeControl * 0.15 +
      awayResilience * 0.17 +
      roundDominance * 0.16 +
      matchupCoverage * 0.14
  );

  const overallGrade: PlayerRadarParameters["overallGrade"] =
    overallScore >= 82
      ? "S+"
      : overallScore >= 76
        ? "S"
        : overallScore >= 70
          ? "A+"
          : overallScore >= 64
            ? "A"
            : overallScore >= 58
              ? "B+"
              : "B";

  return {
    pointEfficiency,
    clutchPower,
    homeControl,
    awayResilience,
    roundDominance,
    matchupCoverage,
    overallScore,
    overallGrade,
  };
}

export function generateFeatureTags({
  positions,
  entry,
  winRate,
  point,
  awayEntries,
  awayWins,
  homeEntries,
  homeWins,
  playedVsChars,
  actualMainChar,
}: {
  positions: {
    vanguard: PositionRecord;
    middle: PositionRecord;
    anchor: PositionRecord;
  };
  entry: number;
  winRate: number;
  point: number;
  awayEntries: number;
  awayWins: number;
  homeEntries: number;
  homeWins: number;
  playedVsChars: VsCharDetail[];
  actualMainChar: string;
}): string[] {
  const featureTags: string[] = [];
  if (positions.anchor.entries >= 2) {
    featureTags.push(
      `大将戦メイン (${positions.anchor.entries}戦${positions.anchor.wins}勝)`
    );
  } else if (
    positions.vanguard.entries + positions.middle.entries >= 2 &&
    positions.anchor.entries === 0
  ) {
    featureTags.push("先鋒・中堅スペシャリスト");
  }

  if (entry >= 2 && winRate >= 75) {
    featureTags.push(`高勝率 (${winRate.toFixed(0)}%)`);
  }
  if (point >= 40) {
    featureTags.push(`ポイントゲッター (${point}pt)`);
  }
  if (awayEntries >= 1 && awayWins === awayEntries) {
    featureTags.push(`AWAY先出し無敗 (${awayWins}勝0敗)`);
  } else if (homeEntries >= 1 && homeWins === homeEntries) {
    featureTags.push(`HOME後出し無敗 (${homeWins}勝0敗)`);
  }
  const favorableCharCount = playedVsChars.filter(
    (c) => (c.sflBattleWinRate ?? 0) >= 50.0
  ).length;
  if (playedVsChars.length >= 2 && favorableCharCount === playedVsChars.length) {
    featureTags.push(`対戦キャラ全勝 (${favorableCharCount}キャラ相手に勝ち越し)`);
  }
  if (featureTags.length === 0) {
    featureTags.push(`主要使用キャラ: ${formatCharName(actualMainChar)}`);
  }
  return featureTags;
}

export function generateObjectiveSummary({
  entry,
  victory,
  losses,
  winRate,
  point,
  avgPointPerEntry,
  positions,
  overallWinRate,
  homeEntries,
  homeWins,
  homeWinRate,
  awayEntries,
  awayWins,
  awayWinRate,
  battleWinRate,
  battleWon,
  battleLost,
  roundWinRate,
  roundWon,
  roundPlayed,
  actualMainChar,
  actualSubChars,
  playedVsChars,
  strongestMatchups,
}: {
  entry: number;
  victory: number;
  losses: number;
  winRate: number;
  point: number;
  avgPointPerEntry: number;
  positions: {
    vanguard: PositionRecord;
    middle: PositionRecord;
    anchor: PositionRecord;
    tiebreaker: PositionRecord;
  };
  overallWinRate: number;
  homeEntries: number;
  homeWins: number;
  homeWinRate: number;
  awayEntries: number;
  awayWins: number;
  awayWinRate: number;
  battleWinRate: number;
  battleWon: number;
  battleLost: number;
  roundWinRate: number;
  roundWon: number;
  roundPlayed: number;
  actualMainChar: string;
  actualSubChars: string[];
  playedVsChars: VsCharDetail[];
  strongestMatchups: VsCharDetail[];
}): string[] {
  const objectiveSummary: string[] = [];

  if (entry > 0) {
    const posBreakdown = [
      positions.vanguard.entries > 0
        ? `先鋒${positions.vanguard.entries}戦(${positions.vanguard.wins}勝)`
        : null,
      positions.middle.entries > 0
        ? `中堅${positions.middle.entries}戦(${positions.middle.wins}勝)`
        : null,
      positions.anchor.entries > 0
        ? `大将${positions.anchor.entries}戦(${positions.anchor.wins}勝)`
        : null,
      positions.tiebreaker.entries > 0
        ? `延長${positions.tiebreaker.entries}戦(${positions.tiebreaker.wins}勝)`
        : null,
    ]
      .filter(Boolean)
      .join("・");

    objectiveSummary.push(
      `【SFL 2026 起用・戦績データ】現在${entry}試合に出場し${victory}勝${losses}敗（勝率${winRate.toFixed(1)}%・計${point}pt獲得 / 1出場平均${avgPointPerEntry}pt）。ポジション別内訳は「${posBreakdown}」となっています。`
    );
  } else {
    objectiveSummary.push(
      `【SFL 2026 起用・戦績データ】現時点ではSFL本戦未出場（温存）ですが、公式大会統計ではセット勝率${(overallWinRate * 100).toFixed(1)}%を記録しています。`
    );
  }

  objectiveSummary.push(
    `【HOME / AWAY・ラウンド取得傾向】HOME（後出し）出場時は${homeEntries}戦${homeWins}勝（推定勝率${homeWinRate.toFixed(1)}%）、AWAY（先出し）出場時は${awayEntries}戦${awayWins}勝（推定勝率${awayWinRate.toFixed(1)}%）。バトル取得率は${battleWinRate.toFixed(1)}%（${battleWon}勝${battleLost}敗）、ラウンド取得率は${roundWinRate.toFixed(1)}%（${roundWon}R/${roundPlayed}R）です。`
  );

  const subCharText =
    actualSubChars.length > 0
      ? `（サブ使用: ${actualSubChars.map(formatCharName).join("・")}）`
      : "";
  if (playedVsChars.length > 0) {
    const topNames = strongestMatchups
      .map(
        (m) =>
          `${m.charName}（${m.sflBattleWinRate?.toFixed(1)}% / ${m.sflBattlesWon}勝${m.sflBattlesLost}敗）`
      )
      .join("・");
    objectiveSummary.push(
      `【今期SFL 対キャラクター戦績】今期メイン使用キャラ「${formatCharName(actualMainChar)}」${subCharText}を軸に、今期SFL本戦で${playedVsChars.length}キャラクターと対戦。${topNames ? `特に ${topNames} に対して勝ち越し` : "各キャラクターと接戦を展開"}を記録しています。`
    );
  } else {
    objectiveSummary.push(
      `【今期SFL 対キャラクター戦績】今期メイン使用キャラ「${formatCharName(actualMainChar)}」${subCharText}。現時点では今期SFL本戦での対戦データはありません。`
    );
  }

  return objectiveSummary;
}
