import type {
  CheeringMatchGuide,
  CptMatchupsTop96Data,
  DivisionId,
  MatchRecord,
  NextMatchOrderRecommendation,
  PlayerStatsData,
  ScoreOutcome,
  ScorePatternId,
  TeamMeta,
  TeamScenarioAnalysis,
  TeamStanding,
  TargetMatchPlan,
} from "./types";
import { predictTeamMatchOutcomeDistribution } from "./predictor";

export const TEAM_META_MAP: Record<string, TeamMeta> = {
  // Division S
  fav: {
    key: "fav",
    name: "KADOKAWA FAV gaming",
    nameJp: "カドカワ ファブ ゲーミング",
    shortName: "FAV",
    division: "s",
    color: "#f59e0b",
    order: 0,
    players: ["sako", "fujimura", "moke", "ryukichi"],
  },
  cr: {
    key: "cr",
    name: "Crazy Raccoon",
    nameJp: "クレイジーラクーン",
    shortName: "CR",
    division: "s",
    color: "#ef4444",
    order: 1,
    players: ["dogura", "shuto", "bonchan", "kazunoko"],
  },
  sol: {
    key: "sol",
    name: "Saishunkan Sol 熊本",
    nameJp: "サイシュンカン ソル クマモト",
    shortName: "SOL",
    division: "s",
    color: "#f97316",
    order: 2,
    players: ["machabo", "kobayan", "cosa", "kincho"],
  },
  zeta: {
    key: "zeta",
    name: "ZETA DIVISION Geekly",
    nameJp: "ゼータディビジョン ギークリー",
    shortName: "ZETA",
    division: "s",
    color: "#10b981",
    order: 3,
    players: ["momochi", "higuchi", "yamaguchi", "mena"],
  },
  ixa: {
    key: "ixa",
    name: "広島 TEAM iXA",
    nameJp: "ヒロシマ チーム イクサ",
    shortName: "iXA",
    division: "s",
    color: "#3b82f6",
    order: 4,
    players: ["acqua", "hibiki", "akira", "takepi"],
  },
  ibsg: {
    key: "ibsg",
    name: "FUKUSHIMA IBUSHIGIN",
    nameJp: "フクシマ イブシギン",
    shortName: "IBSG",
    division: "s",
    color: "#8b5cf6",
    order: 5,
    players: ["yanai", "johnny", "torimeshi", "2bassa"],
  },
  // Division F
  varrel: {
    key: "varrel",
    name: "VARREL",
    nameJp: "ヴァレル",
    shortName: "VARREL",
    division: "f",
    color: "#ec4899",
    order: 6,
    players: ["tokido", "mago", "mizuha", "wabiichi"],
  },
  good8: {
    key: "good8",
    name: "Good 8 Squad",
    nameJp: "グッドエイトスクワッド",
    shortName: "G8S",
    division: "f",
    color: "#06b6d4",
    order: 7,
    players: ["gachikun", "kawano", "pugera", "sahara"],
  },
  dng: {
    key: "dng",
    name: "DetonatioN FocusMe",
    nameJp: "デトネーション フォーカスミー",
    shortName: "DFM",
    division: "f",
    color: "#2563eb",
    order: 8,
    players: ["itazan", "nauman", "takeuchi", "keib"],
  },
  oja: {
    key: "oja",
    name: "名古屋NTPOJA",
    nameJp: "ナゴヤ エヌティーピー オージャ",
    shortName: "OJA",
    division: "f",
    color: "#eab308",
    order: 9,
    players: ["seiya", "otani", "mocchi", "raoyamu"],
  },
  rc: {
    key: "rc",
    name: "REJECT",
    nameJp: "リジェクト",
    shortName: "RC",
    division: "f",
    color: "#a855f7",
    order: 10,
    players: ["daigo", "fuudo", "yas", "hinao"],
  },
  rid: {
    key: "rid",
    name: "RIDDLE ORDER",
    nameJp: "リドルオーダー",
    shortName: "RID",
    division: "f",
    color: "#14b8a6",
    order: 11,
    players: ["jr", "takagi", "adelie", "hikaru"],
  },
};

export const PLAYER_NAME_MAP: Record<string, string> = {
  ryukichi: "りゅうきち",
  sako: "sako",
  fujimura: "藤村",
  moke: "もけ",
  dogura: "どぐら",
  bonchan: "ボンちゃん",
  kazunoko: "かずのこ",
  shuto: "Shuto",
  cosa: "cosa",
  machabo: "まちゃぼー",
  kobayan: "こばやん",
  kincho: "きんちょ",
  momochi: "ももち",
  higuchi: "ひぐち",
  yamaguchi: "ヤマグチ",
  mena: "MenaRD",
  acqua: "ACQUA",
  hibiki: "ひびき",
  akira: "あきら",
  takepi: "takepi",
  yanai: "ヤナイ",
  johnny: "ジョニィ",
  torimeshi: "鶏めし",
  "2bassa": "2BASSA",
  mago: "マゴ",
  tokido: "ときど",
  mizuha: "水派",
  wabiichi: "わびいち",
  gachikun: "ガチくん",
  kawano: "カワノ",
  pugera: "ぷげら",
  sahara: "さはら",
  itazan: "板橋ザンギエフ",
  keib: "KEI.B",
  nauman: "ナウマン",
  takeuchi: "竹内ジョン",
  seiya: "Seiya",
  raoyamu: "らおやむ",
  otani: "大谷",
  mocchi: "もっちー",
  daigo: "ウメハラ",
  fuudo: "ふ～ど",
  yas: "YAS",
  hinao: "ひなお",
  takagi: "高木",
  adelie: "あでりい",
  jr: "Jr.",
  hikaru: "ひかる",
};

export const SCORE_OUTCOMES: ScoreOutcome[] = [
  {
    id: "HOME_40_0",
    label: "HOME 40 - 0 AWAY",
    homePoint: 40,
    awayPoint: 0,
    homeBattleDiff: 5,
    awayBattleDiff: -5,
    homeRoundDiff: 8,
    awayRoundDiff: -8,
    winner: "home",
    isTiebreaker: false,
    probabilityWeight: 0.12,
  },
  {
    id: "HOME_30_10",
    label: "HOME 30 - 10 AWAY",
    homePoint: 30,
    awayPoint: 10,
    homeBattleDiff: 2,
    awayBattleDiff: -2,
    homeRoundDiff: 4,
    awayRoundDiff: -4,
    winner: "home",
    isTiebreaker: false,
    probabilityWeight: 0.25,
  },
  {
    id: "HOME_30_20",
    label: "HOME 30 - 20 AWAY (延長)",
    homePoint: 30,
    awayPoint: 20,
    homeBattleDiff: 1,
    awayBattleDiff: -1,
    homeRoundDiff: 2,
    awayRoundDiff: -2,
    winner: "home",
    isTiebreaker: true,
    probabilityWeight: 0.15,
  },
  {
    id: "AWAY_30_20",
    label: "HOME 20 - 30 AWAY (延長)",
    homePoint: 20,
    awayPoint: 30,
    homeBattleDiff: -1,
    awayBattleDiff: 1,
    homeRoundDiff: -2,
    awayRoundDiff: 2,
    winner: "away",
    isTiebreaker: true,
    probabilityWeight: 0.14,
  },
  {
    id: "AWAY_30_10",
    label: "HOME 10 - 30 AWAY",
    homePoint: 10,
    awayPoint: 30,
    homeBattleDiff: -2,
    awayBattleDiff: 2,
    homeRoundDiff: -4,
    awayRoundDiff: 4,
    winner: "away",
    isTiebreaker: false,
    probabilityWeight: 0.23,
  },
  {
    id: "AWAY_40_0",
    label: "HOME 0 - 40 AWAY",
    homePoint: 0,
    awayPoint: 40,
    homeBattleDiff: -5,
    awayBattleDiff: 5,
    homeRoundDiff: -8,
    awayRoundDiff: 8,
    winner: "away",
    isTiebreaker: false,
    probabilityWeight: 0.11,
  },
];

export const SCORE_OUTCOME_MAP: Record<ScorePatternId, ScoreOutcome> =
  Object.fromEntries(SCORE_OUTCOMES.map((o) => [o.id, o])) as Record<
    ScorePatternId,
    ScoreOutcome
  >;

export function sortStandings(teams: TeamStanding[]): TeamStanding[] {
  const sorted = [...teams].sort((a, b) => {
    if (a.point !== b.point) return b.point - a.point;
    if (a.battleDiff !== b.battleDiff) return b.battleDiff - a.battleDiff;
    if (a.roundDiff !== b.roundDiff) return b.roundDiff - a.roundDiff;
    return a.name.localeCompare(b.name);
  });

  let currentRank = 0;
  let step = 1;
  sorted.forEach((team, idx) => {
    if (
      idx > 0 &&
      team.point === sorted[idx - 1].point &&
      team.battleDiff === sorted[idx - 1].battleDiff &&
      team.roundDiff === sorted[idx - 1].roundDiff
    ) {
      step++;
    } else {
      currentRank += step;
      step = 1;
    }
    team.rank = currentRank;
  });

  return sorted;
}

export function calculateStandings(
  division: DivisionId,
  matches: MatchRecord[],
  customOutcomes: Record<string, ScorePatternId> = {}
): TeamStanding[] {
  const divTeams = Object.values(TEAM_META_MAP).filter(
    (t) => t.division === division
  );
  const standingsMap: Record<string, TeamStanding> = {};

  for (const meta of divTeams) {
    standingsMap[meta.key] = {
      key: meta.key,
      name: meta.name,
      nameJp: meta.nameJp,
      shortName: meta.shortName,
      division: meta.division,
      color: meta.color,
      order: meta.order,
      rank: 1,
      point: 0,
      pointHome: 0,
      pointAway: 0,
      battleDiff: 0,
      battleDiffHome: 0,
      battleDiffAway: 0,
      roundDiff: 0,
      roundDiffHome: 0,
      roundDiffAway: 0,
      entry: 0,
      entryHome: 0,
      entryAway: 0,
      victory: 0,
      victoryHome: 0,
      victoryAway: 0,
      remainingMatches: 0,
      remainingHome: 0,
      remainingAway: 0,
      players: meta.players,
    };
  }

  const divMatches = matches.filter((m) => m.division === division);

  for (const m of divMatches) {
    const homeTeam = standingsMap[m.home];
    const awayTeam = standingsMap[m.away];
    if (!homeTeam || !awayTeam) continue;

    const customId = customOutcomes[m.id];
    const customOutcome = customId ? SCORE_OUTCOME_MAP[customId] : undefined;

    if (customOutcome) {
      homeTeam.entry += 1;
      homeTeam.entryHome += 1;
      homeTeam.point += customOutcome.homePoint;
      homeTeam.pointHome += customOutcome.homePoint;
      homeTeam.battleDiff += customOutcome.homeBattleDiff;
      homeTeam.battleDiffHome += customOutcome.homeBattleDiff;
      homeTeam.roundDiff += customOutcome.homeRoundDiff;
      homeTeam.roundDiffHome += customOutcome.homeRoundDiff;

      awayTeam.entry += 1;
      awayTeam.entryAway += 1;
      awayTeam.point += customOutcome.awayPoint;
      awayTeam.pointAway += customOutcome.awayPoint;
      awayTeam.battleDiff += customOutcome.awayBattleDiff;
      awayTeam.battleDiffAway += customOutcome.awayBattleDiff;
      awayTeam.roundDiff += customOutcome.awayRoundDiff;
      awayTeam.roundDiffAway += customOutcome.awayRoundDiff;

      if (customOutcome.winner === "home") {
        homeTeam.victory += 1;
        homeTeam.victoryHome += 1;
      } else {
        awayTeam.victory += 1;
        awayTeam.victoryAway += 1;
      }
    } else if (m.played) {
      homeTeam.entry += 1;
      homeTeam.entryHome += 1;
      homeTeam.point += m.homePoint;
      homeTeam.pointHome += m.homePoint;
      homeTeam.battleDiff += m.homeBattleDiff;
      homeTeam.battleDiffHome += m.homeBattleDiff;
      homeTeam.roundDiff += m.homeRoundDiff;
      homeTeam.roundDiffHome += m.homeRoundDiff;

      awayTeam.entry += 1;
      awayTeam.entryAway += 1;
      awayTeam.point += m.awayPoint;
      awayTeam.pointAway += m.awayPoint;
      awayTeam.battleDiff += m.awayBattleDiff;
      awayTeam.battleDiffAway += m.awayBattleDiff;
      awayTeam.roundDiff += m.awayRoundDiff;
      awayTeam.roundDiffAway += m.awayRoundDiff;

      if (m.winner === "home") {
        homeTeam.victory += 1;
        homeTeam.victoryHome += 1;
      } else if (m.winner === "away") {
        awayTeam.victory += 1;
        awayTeam.victoryAway += 1;
      }
    } else {
      homeTeam.remainingMatches += 1;
      homeTeam.remainingHome += 1;
      awayTeam.remainingMatches += 1;
      awayTeam.remainingAway += 1;
    }
  }

  return sortStandings(Object.values(standingsMap));
}

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeightedOutcome(
  rng: () => number,
  customWeights?: Record<ScorePatternId, number>
): ScoreOutcome {
  const r = rng();
  let acc = 0;
  for (const outcome of SCORE_OUTCOMES) {
    const w = customWeights ? customWeights[outcome.id] : outcome.probabilityWeight;
    acc += w;
    if (r <= acc) return outcome;
  }
  return SCORE_OUTCOMES[SCORE_OUTCOMES.length - 1];
}

export interface DivisionSimulationSummary {
  firstAvgPoints: number;
  secondAvgPoints: number;
  thirdAvgPoints: number;
  nextSectionTitle: string;
  teams: Record<string, TeamScenarioAnalysis>;
}

/**
 * ディビジョン内の全チームに対するモンテカルロ推計＆4大シナリオ逆算
 * CPT Top 96相性マトリクス & 48選手統計データが渡された場合は、試合ごとの選手・キャラ相性予測確率を適用する
 */
export function analyzeDivisionScenarios(
  division: DivisionId,
  matches: MatchRecord[],
  iterations = 10000,
  predictorData?: {
    cptMatchups: CptMatchupsTop96Data;
    playerStats: PlayerStatsData;
  }
): DivisionSimulationSummary {
  const currentStandings = calculateStandings(division, matches);
  const unplayedMatches = matches
    .filter((m) => m.division === division && !m.played)
    .sort((a, b) =>
      a.sectionNumber !== b.sectionNumber
        ? a.sectionNumber - b.sectionNumber
        : a.matchNumber - b.matchNumber
    );

  // Predictor Engineによる未消化各試合のスコア確率分布＆被せオーダー推奨を事前計算
  const matchPredictionsMap: Record<
    string,
    ReturnType<typeof predictTeamMatchOutcomeDistribution>
  > = {};
  if (predictorData) {
    for (const m of unplayedMatches) {
      matchPredictionsMap[m.id] = predictTeamMatchOutcomeDistribution(
        m,
        predictorData.cptMatchups,
        predictorData.playerStats
      );
    }
  }

  const nextSectionNumber =
    unplayedMatches.length > 0 ? unplayedMatches[0].sectionNumber : 10;
  const nextSectionTitle =
    unplayedMatches.length > 0
      ? unplayedMatches[0].sectionTitle
      : `Division ${division.toUpperCase()} 最終節`;

  const rng = createSeededRng(division === "s" ? 20260825 : 20260828);

  const teamKeys = currentStandings.map((t) => t.key);
  const rankCounts: Record<string, [number, number, number, number, number, number]> = {};
  const pointsSamples: Record<string, number[]> = {};

  for (const key of teamKeys) {
    rankCounts[key] = [0, 0, 0, 0, 0, 0];
    pointsSamples[key] = [];
  }

  let firstBorderSum = 0;
  let secondBorderSum = 0;
  let thirdBorderSum = 0;

  const nextSectionMatches = unplayedMatches.filter(
    (m) => m.sectionNumber === nextSectionNumber
  );
  const conditionalStats: Record<
    string,
    Record<
      ScorePatternId,
      { runs: number; top3: Record<string, number>; first: Record<string, number> }
    >
  > = {};

  for (const nm of nextSectionMatches) {
    conditionalStats[nm.id] = {} as Record<
      ScorePatternId,
      { runs: number; top3: Record<string, number>; first: Record<string, number> }
    >;
    for (const o of SCORE_OUTCOMES) {
      conditionalStats[nm.id][o.id] = {
        runs: 0,
        top3: Object.fromEntries(teamKeys.map((k) => [k, 0])),
        first: Object.fromEntries(teamKeys.map((k) => [k, 0])),
      };
    }
  }

  const baseMap: Record<
    string,
    { point: number; battleDiff: number; roundDiff: number; name: string }
  > = {};
  for (const st of currentStandings) {
    baseMap[st.key] = {
      point: st.point,
      battleDiff: st.battleDiff,
      roundDiff: st.roundDiff,
      name: st.name,
    };
  }

  for (let i = 0; i < iterations; i++) {
    const simState: Record<
      string,
      { key: string; point: number; battleDiff: number; roundDiff: number; name: string }
    > = {};
    for (const k of teamKeys) {
      simState[k] = {
        key: k,
        point: baseMap[k].point,
        battleDiff: baseMap[k].battleDiff,
        roundDiff: baseMap[k].roundDiff,
        name: baseMap[k].name,
      };
    }

    const chosenNextSectionOutcomes: Record<string, ScorePatternId> = {};

    for (const m of unplayedMatches) {
      const predWeights = matchPredictionsMap[m.id]?.outcomeWeights;
      const out = pickWeightedOutcome(rng, predWeights);
      if (m.sectionNumber === nextSectionNumber) {
        chosenNextSectionOutcomes[m.id] = out.id;
      }
      const h = simState[m.home];
      const a = simState[m.away];
      if (h && a) {
        h.point += out.homePoint;
        h.battleDiff += out.homeBattleDiff;
        h.roundDiff += out.homeRoundDiff;
        a.point += out.awayPoint;
        a.battleDiff += out.awayBattleDiff;
        a.roundDiff += out.awayRoundDiff;
      }
    }

    const sorted = Object.values(simState).sort((a, b) => {
      if (a.point !== b.point) return b.point - a.point;
      if (a.battleDiff !== b.battleDiff) return b.battleDiff - a.battleDiff;
      if (a.roundDiff !== b.roundDiff) return b.roundDiff - a.roundDiff;
      return a.name.localeCompare(b.name);
    });

    firstBorderSum += sorted[0].point;
    secondBorderSum += sorted[1].point;
    thirdBorderSum += sorted[2].point;

    sorted.forEach((team, idx) => {
      rankCounts[team.key][idx] += 1;
      pointsSamples[team.key].push(team.point);
    });

    for (const [mId, outId] of Object.entries(chosenNextSectionOutcomes)) {
      const bucket = conditionalStats[mId]?.[outId];
      if (!bucket) continue;
      bucket.runs += 1;
      bucket.first[sorted[0].key] += 1;
      bucket.top3[sorted[0].key] += 1;
      bucket.top3[sorted[1].key] += 1;
      bucket.top3[sorted[2].key] += 1;
    }
  }

  const firstAvgPoints = Math.round((firstBorderSum / iterations) * 10) / 10;
  const secondAvgPoints = Math.round((secondBorderSum / iterations) * 10) / 10;
  const thirdAvgPoints = Math.round((thirdBorderSum / iterations) * 10) / 10;

  const teamsResult: Record<string, TeamScenarioAnalysis> = {};

  for (const st of currentStandings) {
    const key = st.key;
    const rc = rankCounts[key];
    const rankDist = rc.map((c) => Math.round((c / iterations) * 1000) / 10) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const firstPlaceProb = rankDist[0];
    const top2Prob = Math.round(((rc[0] + rc[1]) / iterations) * 1000) / 10;
    const top3Prob =
      Math.round(((rc[0] + rc[1] + rc[2]) / iterations) * 1000) / 10;

    const samples = [...pointsSamples[key]].sort((a, b) => a - b);
    const expectedPts =
      Math.round((samples.reduce((s, v) => s + v, 0) / iterations) * 10) / 10;
    const p10 = samples[Math.floor(iterations * 0.1)] ?? st.point;
    const p50 = samples[Math.floor(iterations * 0.5)] ?? st.point;
    const p90 = samples[Math.floor(iterations * 0.9)] ?? st.point;

    const teamRemainingMatches = unplayedMatches.filter(
      (m) => m.home === key || m.away === key
    );
    const remCount = teamRemainingMatches.length;

    const route1TargetPts = Math.max(
      st.point + 30,
      Math.min(st.point + remCount * 40, Math.ceil(firstAvgPoints / 10) * 10)
    );
    const route2TargetPts = Math.max(
      st.point + 20,
      Math.min(st.point + remCount * 40, Math.ceil(secondAvgPoints / 10) * 10)
    );
    const route3TargetPts = Math.max(
      st.point + 10,
      Math.min(st.point + remCount * 40, Math.round(thirdAvgPoints / 10) * 10)
    );

    // 次節の自チーム対戦カード予測（Predictor Engine）
    const myNextMatch = nextSectionMatches.find(
      (m) => m.home === key || m.away === key
    );
    let nextMatchPrediction: NextMatchOrderRecommendation | undefined;
    if (myNextMatch && matchPredictionsMap[myNextMatch.id]) {
      const mPred = matchPredictionsMap[myNextMatch.id];
      nextMatchPrediction =
        myNextMatch.home === key
          ? mPred.homeOrderRecommendation
          : mPred.awayOrderRecommendation;
    }

    const buildTargetSchedule = (
      goalTotalPts: number,
      mode: "first" | "second" | "third"
    ): {
      schedule: TargetMatchPlan[];
      reqWins: number;
      reqLosses: number;
    } => {
      const needed = Math.max(0, goalTotalPts - st.point);
      let accumulated = 0;
      let wins = 0;
      let losses = 0;

      const schedule: TargetMatchPlan[] = teamRemainingMatches.map((m, idx) => {
        const isHome = m.home === key;
        const oppKey = isHome ? m.away : m.home;
        const oppStanding = currentStandings.find((x) => x.key === oppKey);
        const oppName = oppStanding?.shortName ?? oppKey.toUpperCase();
        const remainingSlots = teamRemainingMatches.length - idx;
        const stillNeeded = needed - accumulated;

        const mPred = matchPredictionsMap[m.id];
        const myWinProb = mPred
          ? isHome
            ? mPred.homeWinProbability
            : mPred.awayWinProbability
          : isHome
            ? 54.0
            : 46.0;
        const orderRec = mPred
          ? isHome
            ? mPred.homeOrderRecommendation
            : mPred.awayOrderRecommendation
          : undefined;
        const anchorMatchup = orderRec?.recommendedLineup?.[2];
        const keyMatchupNote = anchorMatchup
          ? `大将推奨: ${anchorMatchup.playerAName}(${anchorMatchup.charA}) vs ${anchorMatchup.playerBName}(${anchorMatchup.charB}) [勝率${anchorMatchup.expectedWinRateA}%]`
          : undefined;

        let teamGain = 10;
        let oppGain = 30;
        let recScore = isHome ? "10 - 30" : "30 - 10";
        let note = "最低10pt確保（先鋒・中堅で1勝死守）";

        if (
          stillNeeded > (remainingSlots - 1) * 30 + 10 ||
          (mode === "first" && isHome && stillNeeded >= 35 && myWinProb >= 50)
        ) {
          teamGain = 40;
          oppGain = 0;
          recScore = isHome ? "40 - 0" : "0 - 40";
          note = isHome
            ? `HOME被せ有利（予測勝率${myWinProb}%）を活かし40pt完勝狙い`
            : `AWAYで40pt奪取（ライバル直接対決のビッグイニング）`;
          wins++;
        } else if (stillNeeded >= 25 || (myWinProb >= 51 && stillNeeded >= 15)) {
          teamGain = 30;
          oppGain = 10;
          recScore = isHome ? "30 - 10" : "10 - 30";
          note = isHome
            ? `HOME戦（予測勝率${myWinProb}%）で大将20ptを含む30pt必達`
            : `AWAY戦（予測勝率${myWinProb}%）ながら本戦30pt勝利を狙う勝負節`;
          wins++;
        } else if (stillNeeded >= 15) {
          teamGain = 20;
          oppGain = 30;
          recScore = isHome ? "20 - 30 (延長)" : "30 - 20 (延長)";
          note = `相性拮抗カード（予測勝率${myWinProb}%）。敗戦時も延長20ptをもぎ取る粘りが必要`;
          losses++;
        } else {
          teamGain = 10;
          oppGain = 30;
          recScore = isHome ? "10 - 30" : "30 - 10";
          note = "強敵相手でも0pt完封負けを回避し10pt積み上げ";
          losses++;
        }

        accumulated += teamGain;
        return {
          matchId: m.id,
          sectionNumber: m.sectionNumber,
          sectionTitle: m.sectionTitle,
          scheduledAt: m.scheduledAt,
          opponentKey: oppKey,
          opponentName: oppName,
          side: isHome ? "home" : "away",
          recommendedScore: recScore,
          teamPointGain: teamGain,
          opponentPointGain: oppGain,
          predictedWinProb: myWinProb,
          keyMatchupNote,
          note,
        };
      });

      return { schedule, reqWins: wins, reqLosses: losses };
    };

    const plan1 = buildTargetSchedule(route1TargetPts, "first");
    const plan2 = buildTargetSchedule(route2TargetPts, "second");
    const plan3 = buildTargetSchedule(route3TargetPts, "third");

    const otherNextMatches = nextSectionMatches.filter(
      (m) => m.home !== key && m.away !== key
    );
    const cheeringGuide: CheeringMatchGuide[] = otherNextMatches.map((m) => {
      const homeMeta = TEAM_META_MAP[m.home];
      const awayMeta = TEAM_META_MAP[m.away];
      const outcomesStats = conditionalStats[m.id];

      let bestOutcome: ScoreOutcome = SCORE_OUTCOMES[0];
      let bestScoreVal = -1;
      let bestPoProb = top3Prob;
      let worstPoProb = top3Prob;
      let bestFirstProb = firstPlaceProb;

      for (const o of SCORE_OUTCOMES) {
        const stBucket = outcomesStats?.[o.id];
        if (!stBucket || stBucket.runs === 0) continue;
        const poP = (stBucket.top3[key] / stBucket.runs) * 100;
        const firstP = (stBucket.first[key] / stBucket.runs) * 100;
        const combined = poP + firstP * 0.5;
        if (combined > bestScoreVal) {
          bestScoreVal = combined;
          bestOutcome = o;
          bestPoProb = Math.round(poP * 10) / 10;
          bestFirstProb = Math.round(firstP * 10) / 10;
        }
        if (poP < worstPoProb) {
          worstPoProb = Math.round(poP * 10) / 10;
        }
      }

      const winnerIsHome = bestOutcome.winner === "home";
      const recWinnerKey = winnerIsHome ? m.home : m.away;
      const recWinnerName = winnerIsHome
        ? homeMeta?.shortName ?? m.home
        : awayMeta?.shortName ?? m.away;
      const loserName = winnerIsHome
        ? awayMeta?.shortName ?? m.away
        : homeMeta?.shortName ?? m.home;
      const loserStanding = currentStandings.find(
        (s) => s.key === (winnerIsHome ? m.away : m.home)
      );

      const poDelta = Math.round((bestPoProb - top3Prob) * 10) / 10;
      const firstDelta = Math.round((bestFirstProb - firstPlaceProb) * 10) / 10;

      const reason =
        loserStanding && loserStanding.rank <= 3
          ? `現在${loserStanding.rank}位（${loserStanding.point}pt）の${loserName}のポイント加算とバトル得失差を抑え込むことで、${st.shortName}の上位浮上・PO進出確率が最大+${Math.max(0.5, poDelta)}%向上します。`
          : `競合ライバルである${loserName}の追い上げを阻止し、ボーダーラインを引き下げるため${recWinnerName}の勝利（理想は${bestOutcome.homePoint}-${bestOutcome.awayPoint}）が最も有利に働きます。`;

      return {
        matchId: m.id,
        sectionTitle: m.sectionTitle,
        scheduledAt: m.scheduledAt,
        homeKey: m.home,
        homeName: homeMeta?.shortName ?? m.home,
        awayKey: m.away,
        awayName: awayMeta?.shortName ?? m.away,
        recommendedWinnerKey: recWinnerKey,
        recommendedWinnerName: recWinnerName,
        recommendedScoreLabel: `${homeMeta?.shortName ?? m.home} ${bestOutcome.homePoint} - ${bestOutcome.awayPoint} ${awayMeta?.shortName ?? m.away}`,
        playoffProbDelta: poDelta,
        firstPlaceProbDelta: firstDelta,
        bestPlayoffProb: bestPoProb,
        worstPlayoffProb: worstPoProb,
        reason,
      };
    });

    const leader = currentStandings[0];
    const thirdTeam = currentStandings[2];
    const diffFromFirst = leader.point - st.point;
    const diffFromThird = thirdTeam.point - st.point;

    const statusSummary = `${st.name}は現在Division ${division.toUpperCase()} ${st.rank}位（${st.point}pt / バトル得失${st.battleDiff >= 0 ? "+" : ""}${st.battleDiff} / ラウンド得失${st.roundDiff >= 0 ? "+" : ""}${st.roundDiff}）。残り${remCount}試合（HOME ${st.remainingHome}戦・AWAY ${st.remainingAway}戦）を残し、CPT Top 96相性＆48選手データ統合モンテカルロ推計でのプレイオフ進出率は${top3Prob}%、1位突破率は${firstPlaceProb}%です。`;

    const playoffOutlook =
      st.rank === 1
        ? `現在首位のアドバンテージを維持して1位通過を果たせば、プレイオフFINALへシード直行（HOME権確定）となります。`
        : st.rank <= 3
          ? `現在プレイオフ圏内（${st.rank}位）。2位確保なら準決勝で奇数巡目HOME権を獲得、1位逆転ならFINALシード直行が見えてきます。`
          : `3位ボーダー（現在${thirdTeam.shortName}・${thirdTeam.point}pt）まで${diffFromThird}pt差。直接対決での30pt〜40pt勝利とバトル得失差の改善で十分に逆転可能な射程圏内です。`;

    teamsResult[key] = {
      teamKey: key,
      teamName: st.name,
      shortName: st.shortName,
      division,
      currentRank: st.rank,
      currentPoint: st.point,
      currentBattleDiff: st.battleDiff,
      currentRoundDiff: st.roundDiff,
      remainingMatches: remCount,
      remainingHome: st.remainingHome,
      remainingAway: st.remainingAway,
      maxPossiblePoints: st.point + remCount * 40,
      probabilities: {
        firstPlace: firstPlaceProb,
        top2HomeAdvantage: top2Prob,
        playoffTop3: top3Prob,
        rankDistribution: rankDist,
      },
      projectedPoints: {
        expected: expectedPts,
        p10,
        p50,
        p90,
        divisionFirstBorderAvg: firstAvgPoints,
        divisionSecondBorderAvg: secondAvgPoints,
        divisionThirdBorderAvg: thirdAvgPoints,
      },
      statusSummary,
      playoffOutlook,
      routes: {
        route1First: {
          routeId: "route1_first",
          title: "ルート①【1位突破・最短ルート】",
          subtitle: "プレイオフFINALシード直行＆無条件ホーム権獲得",
          targetPoints: route1TargetPts,
          requiredWins: plan1.reqWins,
          requiredLosses: plan1.reqLosses,
          probability: firstPlaceProb,
          headline: `最終${route1TargetPts}pt到達（残り${remCount}戦で${plan1.reqWins}勝${plan1.reqLosses}敗ペース）が1位突破のターゲットライン`,
          narrative: `${st.shortName}がDivision ${division.toUpperCase()} 1位突破（予想ボーダー平均 ${firstAvgPoints}pt）を果たすには、残り${remCount}試合で+${Math.max(0, route1TargetPts - st.point)}ptを上積みし合計${route1TargetPts}ptへ到達することが目標となります。特に残り${st.remainingHome}試合あるHOME戦で確実に30pt〜40ptを稼ぎ、首位${leader.shortName}（現在${leader.point}pt）との${diffFromFirst === 0 ? "首位防衛戦" : `${diffFromFirst}pt差`}を制することが最短ルートです。`,
          keyConditions: [
            `目標合計ポイント: ${route1TargetPts}pt以上（残り+${Math.max(0, route1TargetPts - st.point)}pt）`,
            `残り${remCount}戦の目安戦績: ${plan1.reqWins}勝${plan1.reqLosses}敗（HOME ${st.remainingHome}戦での大将戦勝利が鍵）`,
            `上位直接対決で10pt以下に抑え込まれないこと（バトル得失差現在${st.battleDiff >= 0 ? "+" : ""}${st.battleDiff}）`,
          ],
          targetSchedule: plan1.schedule,
        },
        route2Second: {
          routeId: "route2_second",
          title: "ルート②【2位確保・ホーム権獲得ルート】",
          subtitle: "プレイオフ準決勝（Semifinal）での奇数巡目ホーム権を確保",
          targetPoints: route2TargetPts,
          requiredWins: plan2.reqWins,
          requiredLosses: plan2.reqLosses,
          probability: top2Prob,
          headline: `合計${route2TargetPts}pt確保（残り${plan2.reqWins}勝${plan2.reqLosses}敗ペース）で準決勝ホーム権を手中に`,
          narrative: `SFLのプレイオフ準決勝では、2位通過チームが3位チームに対して「奇数巡目（第1・第3セット等）のホーム＆アウェイ優先権」を握るため、3位通過と2位通過の間には極めて大きな戦略的格差が存在します。Division ${division.toUpperCase()}の2位予想ボーダーは平均${secondAvgPoints}ptであり、${st.shortName}は残り試合で手堅く${plan2.reqWins}勝を挙げつつ、敗戦時も延長20ptや10ptを拾い集めることで2位以内確保率（現在${top2Prob}%）を大きく引き上げられます。`,
          keyConditions: [
            `目標合計ポイント: ${route2TargetPts}pt（2位予想ボーダー平均 ${secondAvgPoints}pt）`,
            `残り${remCount}戦の目安戦績: ${plan2.reqWins}勝${plan2.reqLosses}敗`,
            `AWAY戦（残り${st.remainingAway}試合）でも最低10〜20ptを持ち帰り大崩れしないこと`,
          ],
          targetSchedule: plan2.schedule,
        },
        route3Third: {
          routeId: "route3_third",
          title: "ルート③【3位滑り込み・PO進出ボーダー】",
          subtitle: "プレイオフ進出デッドラインと得失バトル・ラウンド差の勝負条件",
          targetPoints: route3TargetPts,
          requiredWins: plan3.reqWins,
          requiredLosses: plan3.reqLosses,
          probability: top3Prob,
          headline: `PO進出デッドラインは${route3TargetPts}pt前後！同率時はバトル得失差（現在${st.battleDiff >= 0 ? "+" : ""}${st.battleDiff}）が決着を分ける`,
          narrative: `Division ${division.toUpperCase()}の3位プレイオフ進出ボーダーは平均${thirdAvgPoints}ptと推計されています。${st.shortName}がPO進出を果たすための最低デッドラインは合計${route3TargetPts}pt（残り+${Math.max(0, route3TargetPts - st.point)}pt）。最終節付近では10pt刻みのポイントが並ぶ可能性が高く、第2優先順位である「獲得バトル得失差（現在${st.battleDiff >= 0 ? "+" : ""}${st.battleDiff}）」および「獲得ラウンド得失差（現在${st.roundDiff >= 0 ? "+" : ""}${st.roundDiff}）」の1バトル・1ラウンドの重みが直結します。`,
          keyConditions: [
            `PO進出デッドライン目安: 合計${route3TargetPts}pt（平均ボーダー ${thirdAvgPoints}pt）`,
            `残り${remCount}戦での最低クリアライン: ${plan3.reqWins}勝${plan3.reqLosses}敗ペース`,
            `0-40のストレート被完封をゼロに抑え、バトル得失差（現在${st.battleDiff >= 0 ? "+" : ""}${st.battleDiff}）を維持・改善すること`,
          ],
          targetSchedule: plan3.schedule,
        },
        route4Cheering: {
          routeId: "route4_cheering",
          title: `ルート④【次節（${nextSectionTitle}）の「他力本願」応援ガイド】`,
          subtitle: "自チームの試合以外で「誰が何対何で勝つと最も得をするか」を逆算",
          targetPoints: st.point + 30,
          requiredWins: 1,
          requiredLosses: 0,
          probability: cheeringGuide[0]?.bestPlayoffProb ?? top3Prob,
          headline:
            cheeringGuide.length > 0
              ? `次節は「${cheeringGuide.map((c) => `${c.recommendedWinnerName}勝利（理想: ${c.recommendedScoreLabel}）`).join(" ＆ ")}」を全力応援！`
              : "次節の全カード結果が順位に直結",
          narrative: `次節（${nextSectionTitle}）における他チームの対戦カード${cheeringGuide.length}試合について、条件付きモンテカルロ推計で${st.shortName}にとって最も有利になるスコアを算出しました。${cheeringGuide.map((c) => `【${c.homeName} vs ${c.awayName}】では「${c.recommendedScoreLabel}」で決着するとPO進出率が${c.bestPlayoffProb}%（${c.playoffProbDelta >= 0 ? "+" : ""}${c.playoffProbDelta}%変動）となります。`).join("")}`,
          keyConditions: cheeringGuide.map(
            (c) =>
              `${c.homeName} vs ${c.awayName}: 「${c.recommendedScoreLabel}」を応援（PO進出率 ${c.worstPlayoffProb}%〜${c.bestPlayoffProb}%の変動幅）`
          ),
        },
      },
      nextSectionCheeringGuide: cheeringGuide,
      nextMatchPrediction,
    };
  }

  return {
    firstAvgPoints,
    secondAvgPoints,
    thirdAvgPoints,
    nextSectionTitle,
    teams: teamsResult,
  };
}
