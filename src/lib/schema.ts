import { z } from "zod";

export const DivisionIdSchema = z.enum(["s", "f"]);

export const ScorePatternIdSchema = z.enum([
  "HOME_40_0",
  "HOME_30_10",
  "HOME_30_20",
  "AWAY_30_20",
  "AWAY_30_10",
  "AWAY_40_0",
]);

export const ScoreOutcomeSchema = z.object({
  id: ScorePatternIdSchema,
  label: z.string(),
  homePoint: z.number(),
  awayPoint: z.number(),
  homeBattleDiff: z.number(),
  awayBattleDiff: z.number(),
  homeRoundDiff: z.number(),
  awayRoundDiff: z.number(),
  winner: z.enum(["home", "away"]),
  isTiebreaker: z.boolean(),
  probabilityWeight: z.number(),
});

export const TeamMetaSchema = z.object({
  key: z.string(),
  name: z.string(),
  nameJp: z.string(),
  shortName: z.string(),
  division: DivisionIdSchema,
  color: z.string(),
  order: z.number(),
  players: z.array(z.string()),
});

export const MatchBoutSummarySchema = z.object({
  status: z.number(),
  statusName: z.string(),
  homePlayer: z.string(),
  awayPlayer: z.string(),
  homeChara: z.string(),
  awayChara: z.string(),
  homePoint: z.number(),
  awayPoint: z.number(),
  homeBattle: z.number(),
  awayBattle: z.number(),
});

export const MatchRecordSchema = z.object({
  id: z.string(),
  sectionSlug: z.string(),
  sectionTitle: z.string(),
  sectionNumber: z.number(),
  division: DivisionIdSchema,
  matchNumber: z.number(),
  scheduledAt: z.string(),
  home: z.string(),
  away: z.string(),
  played: z.boolean(),
  homePoint: z.number(),
  awayPoint: z.number(),
  homeBattleDiff: z.number(),
  awayBattleDiff: z.number(),
  homeRoundDiff: z.number(),
  awayRoundDiff: z.number(),
  winner: z.enum(["home", "away"]).nullable(),
  isTiebreaker: z.boolean(),
  bouts: z.array(MatchBoutSummarySchema).optional(),
  liveUrl: z.string().optional(),
});

export const MatchesDataSchema = z.object({
  updatedAt: z.string(),
  sourceUrl: z.string(),
  completedSectionCount: z.object({
    s: z.number(),
    f: z.number(),
  }),
  matches: z.array(MatchRecordSchema),
});

export const TeamStandingSchema = z.object({
  key: z.string(),
  name: z.string(),
  nameJp: z.string(),
  shortName: z.string(),
  division: DivisionIdSchema,
  color: z.string(),
  order: z.number(),
  rank: z.number(),
  point: z.number(),
  pointHome: z.number(),
  pointAway: z.number(),
  battleDiff: z.number(),
  battleDiffHome: z.number(),
  battleDiffAway: z.number(),
  roundDiff: z.number(),
  roundDiffHome: z.number(),
  roundDiffAway: z.number(),
  entry: z.number(),
  entryHome: z.number(),
  entryAway: z.number(),
  victory: z.number(),
  victoryHome: z.number(),
  victoryAway: z.number(),
  remainingMatches: z.number(),
  remainingHome: z.number(),
  remainingAway: z.number(),
  players: z.array(z.string()),
});

export const StandingsDataSchema = z.object({
  updatedAt: z.string(),
  divisions: z.object({
    s: z.array(TeamStandingSchema),
    f: z.array(TeamStandingSchema),
  }),
});

// ============================================================================
// CPT Top 96 キャラ相性 & SFL48選手戦績スキーマ (追加拡張仕様)
// ============================================================================

export const MasterPlayerSchema = z.object({
  key: z.string(),
  name: z.string(),
  nameEn: z.string(),
  teamKey: z.string(),
  division: DivisionIdSchema,
  mainChar: z.string(),
  subChars: z.array(z.string()),
  startggSlug: z.string(),
  eloRating: z.number(),
});

export const MasterPlayersDataSchema = z.object({
  updatedAt: z.string(),
  totalPlayers: z.number(),
  players: z.record(z.string(), MasterPlayerSchema),
});

export const CptCharMatchupCellSchema = z.object({
  charA: z.string(),
  charB: z.string(),
  rawWinsA: z.number(),
  rawTotalGames: z.number(),
  rawWinRate: z.number(),
  smoothedWinRate: z.number(),
});

export const CptMatchupsTop96DataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  topPlacementThreshold: z.number(),
  bayesianPriorAlpha: z.number(),
  characters: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
    })
  ),
  matrix: z.record(z.string(), z.record(z.string(), CptCharMatchupCellSchema)),
});

export const PlayerCharVsRecordSchema = z.object({
  vsChar: z.string(),
  wins: z.number(),
  losses: z.number(),
  entries: z.number(),
  smoothedWinRate: z.number(),
});

export const PlayerH2HRecordSchema = z.object({
  opponentKey: z.string(),
  wins: z.number(),
  losses: z.number(),
  smoothedWinRate: z.number(),
});

export const PlayerStatEntrySchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  nameEn: z.string(),
  teamKey: z.string(),
  division: DivisionIdSchema,
  mainChar: z.string(),
  subChars: z.array(z.string()),
  eloRating: z.number(),
  recentFormScore: z.number(),
  sfl2026: z.object({
    entry: z.number(),
    victory: z.number(),
    point: z.number(),
    battleWon: z.number(),
    battlePlayed: z.number(),
    roundWon: z.number(),
    roundPlayed: z.number(),
    homeWinRate: z.number(),
    awayWinRate: z.number(),
  }),
  cptStats: z.object({
    tournamentsCount: z.number(),
    top96Count: z.number(),
    totalSetsWon: z.number(),
    totalSetsPlayed: z.number(),
    overallWinRate: z.number(),
  }),
  useCharStats: z.record(
    z.string(),
    z.object({
      wins: z.number(),
      losses: z.number(),
      entries: z.number(),
      winRate: z.number(),
    })
  ),
  vsCharStats: z.record(z.string(), PlayerCharVsRecordSchema),
  h2hStats: z.record(z.string(), PlayerH2HRecordSchema),
});

export const PlayerStatsDataSchema = z.object({
  updatedAt: z.string(),
  players: z.record(z.string(), PlayerStatEntrySchema),
});

// ============================================================================
// SF6 公式・大型大会対戦ログ スキーマ
// ============================================================================

export const Sf6TournamentBoutSchema = z.object({
  id: z.string(),
  tournamentName: z.string(),
  category: z.enum(["CPT Premier", "CPT WW", "EVO", "Capcom Cup", "SFL"]),
  date: z.string(),
  round: z.string(),
  playerKey: z.string(),
  myChar: z.string(),
  opponentPlayerKey: z.string(),
  opponentPlayerName: z.string(),
  opponentTeam: z.string().optional(),
  opponentChar: z.string(),
  myScore: z.number(),
  opponentScore: z.number(),
  won: z.boolean(),
});

export const Sf6TournamentMatchupsDataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  sf6ReleaseDate: z.string(),
  players: z.record(z.string(), z.array(Sf6TournamentBoutSchema)),
});


// ============================================================================
// Predictor Engine 出力 & シナリオ推計スキーマ
// ============================================================================

export const PlayerMatchupPredictionSchema = z.object({
  roleName: z.string(),
  playerAKey: z.string(),
  playerAName: z.string(),
  charA: z.string(),
  playerBKey: z.string(),
  playerBName: z.string(),
  charB: z.string(),
  macroMatchupTop96: z.number(),
  playerVsCharRate: z.number(),
  h2hAndHomeRate: z.number(),
  expectedWinRateA: z.number(),
  isHomeCounterPick: z.boolean(),
  rationale: z.string(),
});

export const NextMatchOrderRecommendationSchema = z.object({
  matchId: z.string(),
  sectionTitle: z.string(),
  scheduledAt: z.string(),
  opponentKey: z.string(),
  opponentName: z.string(),
  side: z.enum(["home", "away"]),
  teamWinProbability: z.number(),
  expectedTeamPoints: z.number(),
  mostLikelyScore: z.string(),
  recommendedLineup: z.array(PlayerMatchupPredictionSchema),
  tacticalSummary: z.string(),
});

export const TargetMatchPlanSchema = z.object({
  matchId: z.string(),
  sectionNumber: z.number(),
  sectionTitle: z.string(),
  scheduledAt: z.string(),
  opponentKey: z.string(),
  opponentName: z.string(),
  side: z.enum(["home", "away"]),
  recommendedScore: z.string(),
  teamPointGain: z.number(),
  opponentPointGain: z.number(),
  predictedWinProb: z.number().optional(),
  keyMatchupNote: z.string().optional(),
  note: z.string(),
});

export const CheeringMatchGuideSchema = z.object({
  matchId: z.string(),
  sectionTitle: z.string(),
  scheduledAt: z.string(),
  homeKey: z.string(),
  homeName: z.string(),
  awayKey: z.string(),
  awayName: z.string(),
  recommendedWinnerKey: z.string(),
  recommendedWinnerName: z.string(),
  recommendedScoreLabel: z.string(),
  playoffProbDelta: z.number(),
  firstPlaceProbDelta: z.number(),
  bestPlayoffProb: z.number(),
  worstPlayoffProb: z.number(),
  reason: z.string(),
});

export const ScenarioRouteDetailSchema = z.object({
  routeId: z.enum([
    "route1_first",
    "route2_second",
    "route3_third",
    "route4_cheering",
  ]),
  title: z.string(),
  subtitle: z.string(),
  targetPoints: z.number(),
  requiredWins: z.number(),
  requiredLosses: z.number(),
  probability: z.number(),
  headline: z.string(),
  narrative: z.string(),
  keyConditions: z.array(z.string()),
  targetSchedule: z.array(TargetMatchPlanSchema).optional(),
});

export const TeamScenarioAnalysisSchema = z.object({
  teamKey: z.string(),
  teamName: z.string(),
  shortName: z.string(),
  division: DivisionIdSchema,
  currentRank: z.number(),
  currentPoint: z.number(),
  currentBattleDiff: z.number(),
  currentRoundDiff: z.number(),
  remainingMatches: z.number(),
  remainingHome: z.number(),
  remainingAway: z.number(),
  maxPossiblePoints: z.number(),
  probabilities: z.object({
    firstPlace: z.number(),
    top2HomeAdvantage: z.number(),
    playoffTop3: z.number(),
    rankDistribution: z.tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
    ]),
  }),
  projectedPoints: z.object({
    expected: z.number(),
    p10: z.number(),
    p50: z.number(),
    p90: z.number(),
    divisionFirstBorderAvg: z.number(),
    divisionSecondBorderAvg: z.number(),
    divisionThirdBorderAvg: z.number(),
  }),
  statusSummary: z.string(),
  playoffOutlook: z.string(),
  routes: z.object({
    route1First: ScenarioRouteDetailSchema,
    route2Second: ScenarioRouteDetailSchema,
    route3Third: ScenarioRouteDetailSchema,
    route4Cheering: ScenarioRouteDetailSchema,
  }),
  nextSectionCheeringGuide: z.array(CheeringMatchGuideSchema),
  nextMatchPrediction: NextMatchOrderRecommendationSchema.optional(),
});

export const ScenariosDataSchema = z.object({
  updatedAt: z.string(),
  simulationRuns: z.number(),
  generatorMode: z.enum(["agy", "gemini-api", "deterministic-engine"]),
  predictorEnabled: z.boolean().optional(),
  divisionBorders: z.object({
    s: z.object({
      firstAvgPoints: z.number(),
      secondAvgPoints: z.number(),
      thirdAvgPoints: z.number(),
      nextSectionTitle: z.string(),
    }),
    f: z.object({
      firstAvgPoints: z.number(),
      secondAvgPoints: z.number(),
      thirdAvgPoints: z.number(),
      nextSectionTitle: z.string(),
    }),
  }),
  teams: z.record(z.string(), TeamScenarioAnalysisSchema),
});

export const VideoHighlightMomentSchema = z.object({
  timestampSeconds: z.number(),
  timestampLabel: z.string(),
  title: z.string(),
  description: z.string(),
  videoUrlWithTime: z.string(),
});

export const RecentBoutVisualAnalysisSchema = z.object({
  tacticalFocus: z.string(),
  turningPoint: z.string(),
  lethalMove: z.string(),
  commentaryQuote: z.string().optional(),
});

export const RecentBoutRecapSchema = z.object({
  status: z.number(),
  statusName: z.string(),
  homePlayer: z.string(),
  awayPlayer: z.string(),
  homeChara: z.string(),
  awayChara: z.string(),
  homeBattle: z.number(),
  awayBattle: z.number(),
  homePoint: z.number(),
  awayPoint: z.number(),
  winner: z.enum(["home", "away"]),
  isFullSet: z.boolean(),
  roundFlow: z.array(z.string()).optional(),
  visualAnalysis: RecentBoutVisualAnalysisSchema,
  highlight: VideoHighlightMomentSchema.optional(),
});

export const RecentMatchRecapSchema = z.object({
  matchId: z.string(),
  division: DivisionIdSchema,
  sectionNumber: z.number(),
  sectionTitle: z.string(),
  matchNumber: z.number(),
  scheduledAt: z.string(),
  youtubeUrl: z.string(),
  home: z.string(),
  away: z.string(),
  homePoint: z.number(),
  awayPoint: z.number(),
  winner: z.enum(["home", "away"]),
  isTiebreaker: z.boolean(),
  matchHeadline: z.string(),
  matchSummary: z.string(),
  matchHighlight: VideoHighlightMomentSchema.optional(),
  bouts: z.array(RecentBoutRecapSchema),
});

export const PastSectionMatchArchiveSchema = z.object({
  home: z.string(),
  away: z.string(),
  homePoint: z.number(),
  awayPoint: z.number(),
  winner: z.enum(["home", "away"]),
});

export const PastSectionArchiveSchema = z.object({
  sectionNumber: z.number(),
  sectionTitle: z.string(),
  scheduledAt: z.string(),
  youtubeUrl: z.string(),
  playlistUrl: z.string().optional(),
  matches: z.array(PastSectionMatchArchiveSchema),
});

export const MatchRecapsDataSchema = z.object({
  updatedAt: z.string(),
  generatorMode: z.enum(["gemini-video", "deterministic-rules"]),
  latestSection: z.object({
    s: z.number(),
    f: z.number(),
  }),
  recentSections: z.object({
    s: z.array(RecentMatchRecapSchema),
    f: z.array(RecentMatchRecapSchema),
  }),
  pastSections: z.object({
    s: z.array(PastSectionArchiveSchema),
    f: z.array(PastSectionArchiveSchema),
  }),
});

