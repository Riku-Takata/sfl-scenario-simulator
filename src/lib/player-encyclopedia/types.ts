import type { DivisionId, Sf6TournamentBout } from "../types";
import type { PlayerTournamentProfile } from "../startgg/profile";

export type { PlayerTournamentProfile } from "../startgg/profile";
import type { PlayerPlayStyleProfile } from "../sfl/play-style";

export type { PlayerPlayStyleProfile } from "../sfl/play-style";
import type { BucklerPlayerProfile } from "../buckler/aggregate";

export type { BucklerPlayerProfile } from "../buckler/aggregate";
import type { CommentarySection } from "./commentary";

export type { CommentarySection } from "./commentary";

export interface PositionRecord {
  entries: number;
  wins: number;
  losses: number;
  points: number;
  winRate: number;
}

export interface PlayerBoutLog {
  matchId: string;
  sectionNumber: number;
  sectionTitle: string;
  scheduledAt: string;
  side: "home" | "away";
  status: number;
  statusName: string;
  myChar: string;
  opponentPlayerKey: string;
  opponentPlayerName: string;
  opponentTeamKey: string;
  opponentTeamShort: string;
  opponentChar: string;
  myBattle: number;
  opponentBattle: number;
  myPoint: number;
  won: boolean;
}

export interface VsCharDetail {
  charKey: string;
  charName: string;
  // SFL 2026 実戦集計
  playedInSfl: boolean;
  sflBattlesWon: number;
  sflBattlesLost: number;
  sflBattlesTotal: number;
  sflBattleWinRate: number | null; // 0..100 (%) または 未対戦時は null
  sflBoutsWon: number;
  sflBoutsLost: number;
  sflBoutsTotal: number;
  sflBoutWinRate: number | null; // 0..100 (%) または 未対戦時は null
  homeBattlesWon: number;
  homeBattlesLost: number;
  awayBattlesWon: number;
  awayBattlesLost: number;
  tierLabel: "大得意" | "勝ち越し" | "五分" | "苦戦" | "未対戦";
  matchups: PlayerBoutLog[]; // 計算に使用している今期SFL実戦の対戦組み合わせ内訳

  // ★ SF6公式・大型大会 通算実戦集計
  playedInTournament: boolean;
  tournamentMatchesWon: number;
  tournamentMatchesLost: number;
  tournamentMatchesTotal: number;
  tournamentMatchWinRate: number | null; // 0..100 (%) または 未対戦時は null
  tournamentTierLabel: "大得意" | "勝ち越し" | "五分" | "苦戦" | "未対戦";
  tournamentMatchups: Sf6TournamentBout[]; // 計算に使用している大会対戦組み合わせ履歴
}

export interface PlayerRadarParameters {
  pointEfficiency: number; // ポイント獲得力 (0..100)
  clutchPower: number; // 大将・勝負強さ (0..100)
  homeControl: number; // HOME後出し制圧力 (0..100)
  awayResilience: number; // AWAY先出し突破力 (0..100)
  roundDominance: number; // ラウンド支配力 (0..100)
  matchupCoverage: number; // 対応キャラ幅 (0..100)
  overallScore: number; // 総合データ評価 (0..100)
  overallGrade: "S+" | "S" | "A+" | "A" | "B+" | "B";
}

export interface PlayerSnsLinks {
  x?: string;
  youtube?: string;
  twitch?: string;
  instagram?: string;
  sflOfficial: string;
}

export interface PlayerEncyclopediaEntry {
  playerKey: string;
  name: string;
  nameEn: string;
  teamKey: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  division: DivisionId;
  mainChar: string;
  mainCharName: string;
  subChars: string[];
  subCharNames: string[];
  eloRating: number;
  snsLinks: PlayerSnsLinks;
  sfl: {
    entry: number;
    victory: number;
    losses: number;
    winRate: number; // 0..100
    point: number;
    avgPointPerEntry: number;
    battleWon: number;
    battleLost: number;
    battlePlayed: number;
    battleWinRate: number; // 0..100
    roundWon: number;
    roundLost: number;
    roundPlayed: number;
    roundWinRate: number; // 0..100
    homeWinRate: number; // 0..100
    awayWinRate: number; // 0..100
    homeEntries: number;
    homeWins: number;
    awayEntries: number;
    awayWins: number;
  };
  positions: {
    vanguard: PositionRecord; // 先鋒 (10pt)
    middle: PositionRecord; // 中堅 (10pt)
    anchor: PositionRecord; // 大将 (20pt)
    tiebreaker: PositionRecord; // 延長 (10pt)
  };
  usedCharacters: Array<{
    charKey: string;
    charName: string;
    battlesWon: number;
    battlesLost: number;
    battlesTotal: number;
    battleWinRate: number;
  }>;
  parameters: PlayerRadarParameters;
  featureTags: string[];
  objectiveSummary: string[];
  vsCharacters: VsCharDetail[];
  strongestMatchups: VsCharDetail[];
  closestMatchups: VsCharDetail[];
  tournamentVsCharacters: VsCharDetail[];
  tournamentStrongestMatchups: VsCharDetail[];
  tournamentClosestMatchups: VsCharDetail[];
  tournamentSummary: {
    totalMatches: number;
    won: number;
    lost: number;
    winRate: number;
    tournamentsCount: number;
  };
  boutLogs: PlayerBoutLog[];
  /** start.gg 直近1年のプレミア大会プロファイル (対応付けが無い選手は null) */
  tournamentProfile: PlayerTournamentProfile | null;
  /** SFL公式の試合内プレイ統計から見た傾向 (今季データが無い選手は null) */
  playStyle: PlayerPlayStyleProfile | null;
  /** Buckler (ランクマ) の集計 (未取得の選手は null) */
  rankedProfile: BucklerPlayerProfile | null;
  /** 追加データに基づく選手特徴の解説 */
  commentary: CommentarySection[];
}
