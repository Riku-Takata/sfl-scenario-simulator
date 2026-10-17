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
