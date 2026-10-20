import type {
  CptMatchupsTop96Data,
  MatchRecord,
  NextMatchOrderRecommendation,
  PlayerMatchupPrediction,
  PlayerStatsData,
  ScoreOutcome,
  ScorePatternId,
} from "./types";
import { PLAYER_NAME_MAP, SCORE_OUTCOMES, TEAM_META_MAP } from "./simulator";
import rawModelV2 from "../data/model-v2.json";
import { seriesWinProb } from "./model/series";
import type { ProductionModel } from "./model/production";

const MODEL_V2 = rawModelV2 as ProductionModel;

/**
 * 予測モデル v2 (既定): 1ゲーム勝率をロジスティックモデルで出し、先取本数でボウト勝率に換算
 *   logit p_game = a·(実力差·ln10/400) + b·logit(キャラ相性) ± c (HOME/AWAY)
 * 実力値・パラメータは Step 0 が SFL 全履歴 + start.gg から学習 (src/data/model-v2.json)。
 * 2026年の68ボウトのバックテストで v1 より対数損失・Brier が良かった (docs/model-eval-report.md)。
 *
 * v1 (実力値が無い選手のフォールバック):
 * P(A) = w1 * Matchup(X, Y) + w2 * PlayerVsChar(A, Y) + w3 * H2H(A, B)
 */
export const PREDICTOR_WEIGHTS = {
  w1MacroTop96: 0.4,
  w2PlayerVsChar: 0.35,
  w3H2hAndHome: 0.25,
  homeCounterBonus: 0.045, // HOME側（後出し被せ）の戦術アドバンテージ (+4.5%)
};

export function predictBoutWinRate(
  playerAKey: string,
  playerBKey: string,
  isPlayerAHome: boolean,
  cptMatchups: CptMatchupsTop96Data,
  playerStats: PlayerStatsData,
  overrideCharA?: string,
  overrideCharB?: string,
  /** n本先取 (大将戦は3、それ以外は2) */
  firstTo = 2,
  model: ProductionModel | null = MODEL_V2
): PlayerMatchupPrediction {
  const statA = playerStats.players[playerAKey];
  const statB = playerStats.players[playerBKey];

  const charA = overrideCharA || statA?.mainChar || "ken";
  const charB = overrideCharB || statB?.mainChar || "ryu";

  const ratingA = model?.ratings[playerAKey];
  const ratingB = model?.ratings[playerBKey];
  if (model && ratingA != null && ratingB != null) {
    return predictBoutWinRateV2(
      playerAKey,
      playerBKey,
      isPlayerAHome,
      cptMatchups,
      playerStats,
      charA,
      charB,
      firstTo,
      model,
      ratingA,
      ratingB
    );
  }

  // 1. Macro Matchup (CPT Top 96 ベイズ平滑化済み相性)
  const macroRate =
    cptMatchups.matrix[charA]?.[charB]?.smoothedWinRate ?? 0.5;

  // 2. Player vs Character (選手Aの対キャラY勝率 + 直近フォーム補正)
  const vsCharEntry = statA?.vsCharStats?.[charB];
  const baseVsChar = vsCharEntry?.smoothedWinRate ?? macroRate;
  const formDelta = ((statA?.recentFormScore ?? 0.5) - (statB?.recentFormScore ?? 0.5)) * 0.15;
  const playerVsCharRate = Math.max(
    0.25,
    Math.min(0.78, baseVsChar + formDelta)
  );

  // 3. Head-to-Head & Elo + Home/Away 後出し被せボーナス
  const h2hEntry = statA?.h2hStats?.[playerBKey];
  const baseH2h = h2hEntry?.smoothedWinRate ?? 0.5;
  const eloA = statA?.eloRating ?? 1920;
  const eloB = statB?.eloRating ?? 1920;
  const eloProb = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const homeBonus = isPlayerAHome
    ? PREDICTOR_WEIGHTS.homeCounterBonus
    : -PREDICTOR_WEIGHTS.homeCounterBonus;
  const h2hAndHomeRate = Math.max(
    0.25,
    Math.min(0.8, baseH2h * 0.45 + eloProb * 0.55 + homeBonus)
  );

  // 重み付け合算 P(A) = w1 * Matchup_Top96 + w2 * PlayerVsChar + w3 * H2H
  const rawCombined =
    PREDICTOR_WEIGHTS.w1MacroTop96 * macroRate +
    PREDICTOR_WEIGHTS.w2PlayerVsChar * playerVsCharRate +
    PREDICTOR_WEIGHTS.w3H2hAndHome * h2hAndHomeRate;

  const clampedProb = Math.max(0.22, Math.min(0.82, rawCombined));

  const nameA = statA?.name || PLAYER_NAME_MAP[playerAKey] || playerAKey;
  const nameB = statB?.name || PLAYER_NAME_MAP[playerBKey] || playerBKey;

  const macroPct = Math.round(macroRate * 1000) / 10;
  const vsCharPct = Math.round(playerVsCharRate * 1000) / 10;
  const h2hPct = Math.round(h2hAndHomeRate * 1000) / 10;
  const totalPct = Math.round(clampedProb * 1000) / 10;

  return {
    roleName: "シングル戦",
    playerAKey,
    playerAName: nameA,
    charA: charA.toUpperCase(),
    playerBKey,
    playerBName: nameB,
    charB: charB.toUpperCase(),
    macroMatchupTop96: macroPct,
    playerVsCharRate: vsCharPct,
    h2hAndHomeRate: h2hPct,
    expectedWinRateA: totalPct,
    isHomeCounterPick: isPlayerAHome,
    rationale: `キャラ相性(${charA.toUpperCase()} vs ${charB.toUpperCase()}): ${macroPct}% / ${nameA}の対${charB.toUpperCase()}熟練度: ${vsCharPct}% / H2H・Elo・${isPlayerAHome ? "HOME後出し被せ補正" : "AWAY先出し"}: ${h2hPct}% → 総合期待勝率 ${totalPct}%`,
  };
}

const logit = (p: number) => {
  const q = Math.max(1e-4, Math.min(1 - 1e-4, p));
  return Math.log(q / (1 - q));
};

function predictBoutWinRateV2(
  playerAKey: string,
  playerBKey: string,
  isPlayerAHome: boolean,
  cptMatchups: CptMatchupsTop96Data,
  playerStats: PlayerStatsData,
  charA: string,
  charB: string,
  firstTo: number,
  model: ProductionModel,
  ratingA: number,
  ratingB: number
): PlayerMatchupPrediction {
  const w = model.params;
  const mu = cptMatchups.matrix[charA]?.[charB]?.smoothedWinRate ?? 0.5;
  const ratingTerm = w.rating * (((ratingA - ratingB) * Math.LN10) / 400);
  const homeTerm = isPlayerAHome ? w.home : -w.home;
  const gameProb = 1 / (1 + Math.exp(-(ratingTerm + w.matchup * logit(mu) + homeTerm)));
  const skillProb = 1 / (1 + Math.exp(-(ratingTerm + homeTerm)));
  const boutProb = seriesWinProb(gameProb, firstTo);
  const vsChar = playerStats.players[playerAKey]?.vsCharStats?.[charB]?.smoothedWinRate ?? mu;

  const nameA = playerStats.players[playerAKey]?.name || PLAYER_NAME_MAP[playerAKey] || playerAKey;
  const nameB = playerStats.players[playerBKey]?.name || PLAYER_NAME_MAP[playerBKey] || playerBKey;
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const diff = Math.round(ratingA - ratingB);

  return {
    roleName: "シングル戦",
    playerAKey,
    playerAName: nameA,
    charA: charA.toUpperCase(),
    playerBKey,
    playerBName: nameB,
    charB: charB.toUpperCase(),
    macroMatchupTop96: pct(mu),
    playerVsCharRate: pct(vsChar),
    h2hAndHomeRate: pct(skillProb),
    expectedWinRateA: pct(boutProb),
    isHomeCounterPick: isPlayerAHome,
    rationale: `実力差 ${diff >= 0 ? "+" : ""}${diff}（実力のみの1ゲーム勝率 ${pct(skillProb)}%） / キャラ相性(${charA.toUpperCase()} vs ${charB.toUpperCase()}): ${pct(mu)}% / ${isPlayerAHome ? "HOME後出し" : "AWAY先出し"} → 1ゲーム勝率 ${pct(gameProb)}% → ${firstTo}本先取 ${pct(boutProb)}%`,
  };
}

/**
 * チーム間対戦カード (MatchRecord) に対する先鋒・中堅・大将・延長の最適被せオーダーと
 * SFL8通りのスコアパターン確率分布を算出する
 */
export function predictTeamMatchOutcomeDistribution(
  match: MatchRecord,
  cptMatchups: CptMatchupsTop96Data,
  playerStats: PlayerStatsData,
  model: ProductionModel | null = MODEL_V2
): {
  outcomeWeights: Record<ScorePatternId, number>;
  homeWinProbability: number;
  awayWinProbability: number;
  homeOrderRecommendation: NextMatchOrderRecommendation;
  awayOrderRecommendation: NextMatchOrderRecommendation;
} {
  const homeMeta = TEAM_META_MAP[match.home];
  const awayMeta = TEAM_META_MAP[match.away];

  const homeRoster = (homeMeta?.players || []).filter(
    (p) => p !== "keib_oja" && playerStats.players[p]
  );
  const awayRoster = (awayMeta?.players || []).filter(
    (p) => p !== "keib_oja" && playerStats.players[p]
  );

  // AWAY側の想定標準ラインナップ (出場数・Elo順で先鋒・中堅・大将・リザーブを選定)
  const strength = (p: string) =>
    model?.ratings[p] ?? playerStats.players[p]?.eloRating ?? 1900;
  const sortedAway = [...awayRoster].sort((a, b) => strength(b) - strength(a));
  // 大将にエース(0番目)、中堅に2番手、先鋒に3番手、延長に4番手
  const awayAnchor = sortedAway[0] || awayRoster[0] || "ryukichi";
  const awayMiddle = sortedAway[1] || awayRoster[1] || awayAnchor;
  const awayVanguard = sortedAway[2] || awayRoster[2] || awayMiddle;
  const awayReserve = sortedAway[3] || awayVanguard;

  // HOME側は相手の先出しを見て期待勝率が最大になる選手を貪欲に被せる（大将戦20ptを最優先）
  const usedHome = new Set<string>();
  const pickBestHomeCounter = (
    targetAwayPlayer: string,
    roleLabel: string,
    firstTo: number
  ): PlayerMatchupPrediction => {
    let bestPred: PlayerMatchupPrediction | null = null;
    for (const hPlayer of homeRoster) {
      if (usedHome.has(hPlayer) && usedHome.size < homeRoster.length) continue;
      const pred = predictBoutWinRate(
        hPlayer,
        targetAwayPlayer,
        true,
        cptMatchups,
        playerStats,
        undefined,
        undefined,
        firstTo,
        model
      );
      if (!bestPred || pred.expectedWinRateA > bestPred.expectedWinRateA) {
        bestPred = { ...pred, roleName: roleLabel };
      }
    }
    if (bestPred) {
      usedHome.add(bestPred.playerAKey);
      return bestPred;
    }
    return predictBoutWinRate(
      homeRoster[0] || "sako",
      targetAwayPlayer,
      true,
      cptMatchups,
      playerStats,
      undefined,
      undefined,
      firstTo,
      model
    );
  };

  // 大将戦は3本先取、先鋒・中堅・延長は2本先取
  const anchorBout = pickBestHomeCounter(awayAnchor, "大将戦 (20pt)", 3);
  const middleBout = pickBestHomeCounter(awayMiddle, "中堅戦 (10pt)", 2);
  const vanguardBout = pickBestHomeCounter(awayVanguard, "先鋒戦 (10pt)", 2);
  const tiebreakerBout = pickBestHomeCounter(awayReserve, "延長戦 (10pt)", 2);

  const pV = vanguardBout.expectedWinRateA / 100; // 先鋒(10pt) HOME勝率
  const pM = middleBout.expectedWinRateA / 100;   // 中堅(10pt) HOME勝率
  const pA = anchorBout.expectedWinRateA / 100;   // 大将(20pt) HOME勝率
  const pT = tiebreakerBout.expectedWinRateA / 100; // 延長(10pt) HOME勝率

  const qV = 1 - pV;
  const qM = 1 - pM;
  const qA = 1 - pA;
  const qT = 1 - pT;

  // 6通りのSFL公式レギュラーシーズンスコアパターンの厳密な結合確率
  // （先鋒10pt・中堅10pt・大将20ptの3試合は必ず全て実施されるため、合計40ptが配分され30-0は発生しない）
  // HOME 40-0: 先鋒H(10)・中堅H(10)・大将H(20)
  const probHome40_0 = pV * pM * pA;
  // HOME 30-10: (先鋒H(10)・中堅A(10)・大将H(20)) または (先鋒A(10)・中堅H(10)・大将H(20))
  const probHome30_10 = (pV * qM + qV * pM) * pA;
  // 20-20 延長突入: (先鋒H(10)・中堅H(10)・大将A(20)) または (先鋒A(10)・中堅A(10)・大将H(20))
  const probTie20_20 = pV * pM * qA + qV * qM * pA;
  const probHome30_20 = probTie20_20 * pT;
  const probAway30_20 = probTie20_20 * qT;
  // AWAY 30-10: (先鋒A(10)・中堅H(10)・大将A(20)) または (先鋒H(10)・中堅A(10)・大将A(20))
  const probAway30_10 = (qV * pM + pV * qM) * qA;
  // AWAY 40-0: 先鋒A(10)・中堅A(10)・大将A(20)
  const probAway40_0 = qV * qM * qA;

  const outcomeWeights: Record<ScorePatternId, number> = {
    HOME_40_0: Math.round(probHome40_0 * 10000) / 10000,
    HOME_30_10: Math.round(probHome30_10 * 10000) / 10000,
    HOME_30_20: Math.round(probHome30_20 * 10000) / 10000,
    AWAY_30_20: Math.round(probAway30_20 * 10000) / 10000,
    AWAY_30_10: Math.round(probAway30_10 * 10000) / 10000,
    AWAY_40_0: Math.round(probAway40_0 * 10000) / 10000,
  };

  const homeWinProb =
    Math.round(
      (probHome40_0 + probHome30_10 + probHome30_20) * 1000
    ) / 10;
  const awayWinProb = Math.round((100 - homeWinProb) * 10) / 10;

  let expectedHomePts = 0;
  let expectedAwayPts = 0;
  let mostLikelyId: ScorePatternId = "HOME_30_10";
  let maxW = -1;

  for (const o of SCORE_OUTCOMES) {
    const w = outcomeWeights[o.id];
    expectedHomePts += o.homePoint * w;
    expectedAwayPts += o.awayPoint * w;
    if (w > maxW) {
      maxW = w;
      mostLikelyId = o.id;
    }
  }

  const mostLikelyOut: ScoreOutcome =
    SCORE_OUTCOMES.find((o) => o.id === mostLikelyId) || SCORE_OUTCOMES[1];

  const homeLineup = [vanguardBout, middleBout, anchorBout];
  const awayLineup: PlayerMatchupPrediction[] = homeLineup.map((b) => ({
    roleName: b.roleName,
    playerAKey: b.playerBKey,
    playerAName: b.playerBName,
    charA: b.charB,
    playerBKey: b.playerAKey,
    playerBName: b.playerAName,
    charB: b.charA,
    macroMatchupTop96: Math.round((100 - b.macroMatchupTop96) * 10) / 10,
    playerVsCharRate: Math.round((100 - b.playerVsCharRate) * 10) / 10,
    h2hAndHomeRate: Math.round((100 - b.h2hAndHomeRate) * 10) / 10,
    expectedWinRateA: Math.round((100 - b.expectedWinRateA) * 10) / 10,
    isHomeCounterPick: false,
    rationale: `キャラ相性(${b.charB} vs ${b.charA}): ${Math.round((100 - b.macroMatchupTop96) * 10) / 10}% / AWAY先出し時の対${b.playerAName}予測勝率: ${Math.round((100 - b.expectedWinRateA) * 10) / 10}%`,
  }));

  const homeOrderRecommendation: NextMatchOrderRecommendation = {
    matchId: match.id,
    sectionTitle: match.sectionTitle,
    scheduledAt: match.scheduledAt,
    opponentKey: match.away,
    opponentName: awayMeta?.shortName ?? match.away,
    side: "home",
    teamWinProbability: homeWinProb,
    expectedTeamPoints: Math.round(expectedHomePts * 10) / 10,
    mostLikelyScore: `${homeMeta?.shortName ?? match.home} ${mostLikelyOut.homePoint} - ${mostLikelyOut.awayPoint} ${awayMeta?.shortName ?? match.away}`,
    recommendedLineup: homeLineup,
    tacticalSummary: `HOME（後出し）の利を活かし、相手エース${anchorBout.playerBName}(${anchorBout.charB})に対して${anchorBout.playerAName}(${anchorBout.charA})を被せることで大将戦勝率${anchorBout.expectedWinRateA}%を確保。チーム全体勝率は${homeWinProb}%（期待獲得ポイント ${Math.round(expectedHomePts * 10) / 10}pt）と推計されます。`,
  };

  const awayOrderRecommendation: NextMatchOrderRecommendation = {
    matchId: match.id,
    sectionTitle: match.sectionTitle,
    scheduledAt: match.scheduledAt,
    opponentKey: match.home,
    opponentName: homeMeta?.shortName ?? match.home,
    side: "away",
    teamWinProbability: awayWinProb,
    expectedTeamPoints: Math.round(expectedAwayPts * 10) / 10,
    mostLikelyScore: `${awayMeta?.shortName ?? match.away} ${mostLikelyOut.awayPoint} - ${mostLikelyOut.homePoint} ${homeMeta?.shortName ?? match.home}`,
    recommendedLineup: awayLineup,
    tacticalSummary: `AWAY（先出し）のハンデを克服するため、キャラ相性で不利がつきにくい${awayLineup[2].playerAName}(${awayLineup[2].charA})を大将に据え、先鋒・中堅で最低1勝をもぎ取って大将戦または延長戦へ持ち込むプラン（チーム期待勝率${awayWinProb}% / 期待獲得 ${Math.round(expectedAwayPts * 10) / 10}pt）が最有力です。`,
  };

  return {
    outcomeWeights,
    homeWinProbability: homeWinProb,
    awayWinProbability: awayWinProb,
    homeOrderRecommendation,
    awayOrderRecommendation,
  };
}
