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
    /** startgg: start.gg プレミア大会実績 / estimated: Elo からの推定値 */
    source: z.enum(["startgg", "estimated"]).default("estimated"),
    performanceRating: z.number().nullable().default(null),
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

export const LineupSlotAppearanceSchema = z.object({
  home: z.array(z.record(z.string(), z.number())),
  away: z.array(z.record(z.string(), z.number())),
});

export const TopLineupComboSchema = z.object({
  away: z.tuple([z.string(), z.string(), z.string()]),
  home: z.tuple([z.string(), z.string(), z.string()]),
  prob: z.number(),
  boutHomeWin: z.tuple([z.number(), z.number(), z.number()]),
});

export const LineupBreakdownSchema = z.object({
  slotAppearance: LineupSlotAppearanceSchema,
  topLineups: z.array(TopLineupComboSchema),
  tiebreakHomeWin: z.number(),
});

export const RemainingMatchPredictionSchema = z.object({
  matchId: z.string(),
  sectionNumber: z.number(),
  sectionTitle: z.string(),
  scheduledAt: z.string(),
  opponentKey: z.string(),
  opponentName: z.string(),
  side: z.enum(["home", "away"]),
  winProbability: z.number(),
  expectedPoints: z.number(),
  mostLikelyScore: z.string(),
  orderRecommendation: NextMatchOrderRecommendationSchema,
  lineupBreakdown: LineupBreakdownSchema.nullable().optional(),
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
  remainingMatchPredictions: z.array(RemainingMatchPredictionSchema).optional(),
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

/**
 * Bout解説。source=editorial は配信の文字起こし・映像・公式ログを確認して書いた解説、
 * gemini-video は2回の独立した動画解析で一致した事実のみ、
 * official-data は公式ラウンドログのみから組み立てたもの。
 */
export const RecentBoutAnalysisSchema = z.object({
  source: z.enum(["editorial", "gemini-video", "official-data"]),
  summary: z.string(),
  keyPoints: z.array(z.string()),
});


/**
 * 映像解析で抽出する画面上の事実（決着方法・PERFECT・バーンアウト・タグ）。
 * ラウンド勝者が公式ログと一致したゲームの値だけを採用する。
 */
export const RoundFinishSchema = z.enum(["SA1", "SA2", "SA3", "CA", "DI", "NORMAL", "TIME"]);

export const BOUT_TAG_IDS = [
  "just_parry",
  "anti_air",
  "whiff_punish",
  "drive_impact",
  "drive_rush",
  "corner",
  "throw",
  "projectile",
  "punish_counter",
  "reversal",
] as const;
export const BoutTagIdSchema = z.enum(BOUT_TAG_IDS);

export const BoutGameDetailSchema = z.object({
  winner: z.enum(["home", "away"]),
  rounds: z.array(
    z.object({
      winner: z.enum(["home", "away"]),
      finish: RoundFinishSchema.optional(),
      perfect: z.boolean().optional(),
    })
  ),
  burnout: z.array(z.enum(["home", "away"])).optional(),
});

export const BoutTagSchema = z.object({
  id: BoutTagIdSchema,
  side: z.enum(["home", "away"]),
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
  analysis: RecentBoutAnalysisSchema,
  games: z.array(BoutGameDetailSchema).optional(),
  tags: z.array(BoutTagSchema).optional(),
  highlight: VideoHighlightMomentSchema.optional(),
  /**
   * 映像解析の進み具合。pending は解析待ち (無料枠の上限などで翌日以降に持ち越し)、
   * unavailable は動画・区間が無いか解析できなかったもの。スコアは常に公式記録から表示する。
   */
  videoStatus: z.enum(["complete", "pending", "unavailable"]).default("complete"),
});

export const RecentMatchRecapSchema = z.object({
  matchId: z.string(),
  division: DivisionIdSchema,
  sectionNumber: z.number(),
  sectionTitle: z.string(),
  matchNumber: z.number(),
  scheduledAt: z.string(),
  youtubeUrl: z.string(),
  matchVideoUrl: z.string().optional(),
  matchStartTime: z.number().optional(),
  matchStartLabel: z.string().optional(),
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
  /**
   * 試合解説文の進み具合。pending は映像解析または解説生成が持ち越し中で、
   * その間の見出し・要約は公式記録から組み立てた暫定文。
   */
  narrationStatus: z.enum(["complete", "pending", "unavailable"]).default("complete"),
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
  generatorMode: z.enum(["editorial", "gemini-video", "mixed", "deterministic-rules"]),
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


/**
 * 動画解析キャッシュ (src/data/video-facts.json)。
 * Gemini無料枠を節約するため、一度解析したBout・生成済み解説は再利用する。
 */
export const VideoChapterSchema = z.object({
  startSec: z.number(),
  title: z.string(),
});

export const BoutVideoTopicSchema = z.object({
  topic: z.string(),
  evidence: z.enum(["映像", "実況", "両方"]),
});

export const BoutVideoRunSchema = z.object({
  model: z.string(),
  analyzedAt: z.string(),
  gameWinnersSeen: z.array(z.enum(["A", "B", "不明"])),
  gatePassed: z.boolean(),
  gateReason: z.string(),
  topics: z.array(BoutVideoTopicSchema),
});

export const BoutVideoFactsSchema = z.object({
  videoId: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  status: z.enum(["pending", "complete", "failed"]),
  runs: z.array(BoutVideoRunSchema),
});

export const MatchNarrativeSchema = z.object({
  inputHash: z.string(),
  model: z.string(),
  generatedAt: z.string(),
  matchHeadline: z.string(),
  matchSummary: z.string(),
  bouts: z.array(
    z.object({
      boutId: z.string(),
      summary: z.string(),
      keyPoints: z.array(z.string()),
    })
  ),
});

export const VisualRunSchema = z.object({
  model: z.string(),
  analyzedAt: z.string(),
  games: z.array(
    z.object({
      rounds: z.array(
        z.object({
          winner: z.enum(["A", "B", "不明"]),
          finish: z.union([RoundFinishSchema, z.literal("不明")]),
          perfect: z.boolean(),
        })
      ),
      burnout: z.array(z.enum(["A", "B"])),
    })
  ),
  tags: z.array(z.object({ id: BoutTagIdSchema, side: z.enum(["A", "B"]) })),
  /** 公式ログとラウンド勝者が完全一致したゲームの添字 */
  matchedGames: z.array(z.number()),
  error: z.string().optional(),
});

export const BoutVisualFactsSchema = z.object({
  videoId: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  status: z.enum(["pending", "complete"]),
  runs: z.array(VisualRunSchema),
});

export const VideoFactsDataSchema = z.object({
  updatedAt: z.string(),
  videos: z.record(
    z.string(),
    z.object({ videoId: z.string(), chapters: z.array(VideoChapterSchema) })
  ),
  bouts: z.record(z.string(), BoutVideoFactsSchema),
  narratives: z.record(z.string(), MatchNarrativeSchema),
  visual: z.record(z.string(), BoutVisualFactsSchema).default({}),
  /** 解説生成モデルが使えず翌日以降に持ち越した試合 */
  pendingNarrations: z.array(z.string()).default([]),
});

/**
 * 手書き（編集）解説 (src/data/editorial-recaps.json)。存在するBout/試合は自動生成より優先する。
 */
export const EditorialRecapsDataSchema = z.object({
  bouts: z.record(
    z.string(),
    z.object({
      summary: z.string(),
      keyPoints: z.array(z.string()),
      writtenAt: z.string(),
    })
  ),
  matches: z.record(
    z.string(),
    z.object({
      headline: z.string(),
      summary: z.string(),
    })
  ),
});

// ============================================================================
// start.gg プレミア大会 実戦データ スキーマ
// ============================================================================

export const StartggIdentitiesDataSchema = z.object({
  note: z.string().optional(),
  updatedAt: z.string(),
  players: z.record(
    z.string(),
    z.object({
      startggPlayerId: z.number(),
      gamerTag: z.string(),
      userSlug: z.string().nullable(),
      /** 対応付けの根拠 (tag+team-prefix / participant-search など) */
      evidence: z.string(),
    })
  ),
});

export const PremierCategorySchema = z.enum([
  "Capcom Cup",
  "CPT Premier",
  "CPT WW",
  "EVO",
  "Major",
]);

export const StartggEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  tournamentName: z.string(),
  eventName: z.string(),
  /** YYYY-MM-DD */
  startDate: z.string(),
  numEntrants: z.number().nullable(),
  isOnline: z.boolean().nullable(),
  countryCode: z.string().nullable(),
  /** null はプレミア対象外 (取得済みとしてキャッシュするために保持) */
  category: PremierCategorySchema.nullable(),
});

export const StartggGameSchema = z.object({
  won: z.boolean(),
  myChar: z.string().nullable(),
  oppChar: z.string().nullable(),
});

export const StartggSetSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  /** UNIX秒 */
  completedAt: z.number(),
  /** 負数はルーザーズ側 */
  round: z.number().nullable(),
  roundText: z.string(),
  phaseName: z.string().nullable(),
  mySeed: z.number().nullable(),
  oppSeed: z.number().nullable(),
  oppPlayerId: z.number().nullable(),
  oppTag: z.string(),
  myScore: z.number(),
  oppScore: z.number(),
  won: z.boolean(),
  games: z.array(StartggGameSchema),
});

export const StartggPlacementSchema = z.object({
  eventId: z.string(),
  placement: z.number(),
  seed: z.number().nullable(),
});

export const StartggPremierResultsDataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  windowDays: z.number(),
  /** YYYY-MM-DD */
  windowStart: z.string(),
  events: z.record(z.string(), StartggEventSchema),
  players: z.record(
    z.string(),
    z.object({
      startggPlayerId: z.number(),
      gamerTag: z.string(),
      fetchedAt: z.string(),
      placements: z.array(StartggPlacementSchema),
      sets: z.array(StartggSetSchema),
    })
  ),
});

// ============================================================================
// SFL公式 試合内プレイ統計 (api/sfl20xx/?data=stats) スキーマ
// ============================================================================

export const SflPlayStatsMetricKeySchema = z.enum([
  "dr",
  "drc",
  "di",
  "dis",
  "dir",
  "dip",
  "dp",
  "jp",
  "jpp",
  "dre",
  "ov",
  "udn",
  "bn",
  "air",
  "tt",
  "wuds",
  "hwin",
  "awin",
]);

export const SflPlayStatsSeasonSchema = z.object({
  /** 集計時点の節 (公式は節ごとの累積値を返すため、空でない最新の節を採用) */
  asOfSection: z.string(),
  asOfTitle: z.string(),
  players: z.record(
    z.string(),
    z.object({
      name: z.string(),
      /** そのシーズンの出場バトル数 (公式 battle_entry) */
      battles: z.number(),
      metrics: z.record(SflPlayStatsMetricKeySchema, z.number()),
    })
  ),
});

export const SflPlayStatsDataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  seasons: z.record(z.string(), SflPlayStatsSeasonSchema),
});

// ============================================================================
// Buckler (ランクマ) 集計スキーマ — 自宅サーバーで集計し、公開するのはこの集計のみ
// ============================================================================

const BucklerCharCountSchema = z.object({ char: z.string(), n: z.number(), w: z.number() });

const BucklerActivityWindowSchema = z.object({
  matches: z.number(),
  wins: z.number(),
  activeDays: z.number(),
  byChar: z.array(BucklerCharCountSchema),
  byMode: z.object({ rank: z.number(), casual: z.number(), hub: z.number(), custom: z.number() }),
});

const BucklerActSummarySchema = z.object({
  seasonId: z.number(),
  rankBattles: z.number(),
  rankWins: z.number(),
  chars: z.array(
    z.object({
      char: z.string(),
      n: z.number(),
      w: z.number(),
      mr: z.number().nullable(),
      lp: z.number().nullable(),
      mrRanking: z.number().nullable(),
    })
  ),
});

export const BucklerPlayerProfileSchema = z.object({
  sflKey: z.string(),
  asOf: z.string(),
  seasonId: z.number().nullable(),
  mainChar: z.string().nullable(),
  characters: z.array(
    z.object({
      char: z.string(),
      leagueRank: z.number().nullable(),
      lp: z.number().nullable(),
      mr: z.number().nullable(),
      mrRanking: z.number().nullable(),
      battles: z.number(),
      wins: z.number(),
    })
  ),
  last7Days: BucklerActivityWindowSchema,
  last30Days: BucklerActivityWindowSchema,
  mrTrend: z.array(z.object({ date: z.string(), mr: z.number() })),
  risingChars: z.array(
    z.object({
      char: z.string(),
      recentShare: z.number(),
      priorShare: z.number(),
      recentMatches: z.number(),
    })
  ),
  mainVsChar: z.array(BucklerCharCountSchema),
  battleStats: z.record(z.string(), z.number()),
  recentMatches: z.array(
    z.object({
      t: z.number(),
      mode: z.string(),
      myChar: z.string(),
      myMr: z.number().nullable(),
      oppChar: z.string(),
      oppMr: z.number().nullable(),
      won: z.boolean().nullable(),
      roundsWon: z.number(),
      roundsLost: z.number(),
    })
  ),
  acts: z
    .object({
      current: BucklerActSummarySchema.nullable(),
      previous: BucklerActSummarySchema.nullable(),
    })
    .default({ current: null, previous: null }),
  storedMatches: z.number(),
  storedSince: z.string().nullable(),
});

export const BucklerProfilesDataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  players: z.record(z.string(), BucklerPlayerProfileSchema),
});

export const BucklerDiaDataSchema = z.object({
  updatedAt: z.string(),
  source: z.string(),
  /** YYYYMM */
  month: z.string(),
  variant: z.string(),
  /** Buckler のリーグ帯キー */
  block: z.string(),
  chars: z.array(z.string()),
  /** 行キャラ視点の勝率 (0..1)。null はデータなし */
  matrix: z.array(z.array(z.number().nullable())),
});
