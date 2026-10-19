import { z } from "zod";
import {
  CheeringMatchGuideSchema,
  CptCharMatchupCellSchema,
  CptMatchupsTop96DataSchema,
  DivisionIdSchema,
  MasterPlayerSchema,
  MasterPlayersDataSchema,
  MatchBoutSummarySchema,
  MatchesDataSchema,
  MatchRecordSchema,
  NextMatchOrderRecommendationSchema,
  PlayerCharVsRecordSchema,
  PlayerH2HRecordSchema,
  PlayerMatchupPredictionSchema,
  PlayerStatEntrySchema,
  PlayerStatsDataSchema,
  Sf6TournamentBoutSchema,
  Sf6TournamentMatchupsDataSchema,
  ScenarioRouteDetailSchema,
  ScenariosDataSchema,
  ScoreOutcomeSchema,
  ScorePatternIdSchema,
  StandingsDataSchema,
  TargetMatchPlanSchema,
  TeamMetaSchema,
  TeamScenarioAnalysisSchema,
  TeamStandingSchema,
  VideoHighlightMomentSchema,
  RecentBoutAnalysisSchema,
  RecentBoutRecapSchema,
  RecentMatchRecapSchema,
  PastSectionMatchArchiveSchema,
  PastSectionArchiveSchema,
  MatchRecapsDataSchema,
  VideoFactsDataSchema,
  BoutVideoRunSchema,
  BoutVideoFactsSchema,
  BoutVideoTopicSchema,
  VideoChapterSchema,
  MatchNarrativeSchema,
  EditorialRecapsDataSchema,
} from "./schema";

export type DivisionId = z.infer<typeof DivisionIdSchema>;
export type ScorePatternId = z.infer<typeof ScorePatternIdSchema>;
export type ScoreOutcome = z.infer<typeof ScoreOutcomeSchema>;
export type TeamMeta = z.infer<typeof TeamMetaSchema>;
export type MatchBoutSummary = z.infer<typeof MatchBoutSummarySchema>;
export type MatchRecord = z.infer<typeof MatchRecordSchema>;
export type MatchesData = z.infer<typeof MatchesDataSchema>;
export type TeamStanding = z.infer<typeof TeamStandingSchema>;
export type StandingsData = z.infer<typeof StandingsDataSchema>;

export type MasterPlayer = z.infer<typeof MasterPlayerSchema>;
export type MasterPlayersData = z.infer<typeof MasterPlayersDataSchema>;
export type CptCharMatchupCell = z.infer<typeof CptCharMatchupCellSchema>;
export type CptMatchupsTop96Data = z.infer<typeof CptMatchupsTop96DataSchema>;
export type PlayerCharVsRecord = z.infer<typeof PlayerCharVsRecordSchema>;
export type PlayerH2HRecord = z.infer<typeof PlayerH2HRecordSchema>;
export type PlayerStatEntry = z.infer<typeof PlayerStatEntrySchema>;
export type PlayerStatsData = z.infer<typeof PlayerStatsDataSchema>;
export type Sf6TournamentBout = z.infer<typeof Sf6TournamentBoutSchema>;
export type Sf6TournamentMatchupsData = z.infer<
  typeof Sf6TournamentMatchupsDataSchema
>;

export type PlayerMatchupPrediction = z.infer<
  typeof PlayerMatchupPredictionSchema
>;
export type NextMatchOrderRecommendation = z.infer<
  typeof NextMatchOrderRecommendationSchema
>;
export type TargetMatchPlan = z.infer<typeof TargetMatchPlanSchema>;
export type CheeringMatchGuide = z.infer<typeof CheeringMatchGuideSchema>;
export type ScenarioRouteDetail = z.infer<typeof ScenarioRouteDetailSchema>;
export type TeamScenarioAnalysis = z.infer<typeof TeamScenarioAnalysisSchema>;
export type ScenariosData = z.infer<typeof ScenariosDataSchema>;

export type VideoHighlightMoment = z.infer<typeof VideoHighlightMomentSchema>;
export type RecentBoutAnalysis = z.infer<
  typeof RecentBoutAnalysisSchema
>;
export type RecentBoutRecap = z.infer<typeof RecentBoutRecapSchema>;
export type RecentMatchRecap = z.infer<typeof RecentMatchRecapSchema>;
export type PastSectionMatchArchive = z.infer<
  typeof PastSectionMatchArchiveSchema
>;
export type PastSectionArchive = z.infer<typeof PastSectionArchiveSchema>;
export type MatchRecapsData = z.infer<typeof MatchRecapsDataSchema>;
export type VideoFactsData = z.infer<typeof VideoFactsDataSchema>;
export type VideoChapter = z.infer<typeof VideoChapterSchema>;
export type BoutVideoTopic = z.infer<typeof BoutVideoTopicSchema>;
export type BoutVideoRun = z.infer<typeof BoutVideoRunSchema>;
export type BoutVideoFacts = z.infer<typeof BoutVideoFactsSchema>;
export type MatchNarrative = z.infer<typeof MatchNarrativeSchema>;
export type EditorialRecapsData = z.infer<typeof EditorialRecapsDataSchema>;
