/**
 * 選手の対戦データ詳細 (start.gg プレミア大会のセット単位)
 */
import type { StartggIdentitiesData, StartggPremierResultsData, PremierCategory } from "../types";

export interface MatchDetailSet {
  roundText: string;
  phaseName: string | null;
  completedAt: number;
  oppTag: string;
  /** 相手が SFL 選手の場合の選手キー */
  oppSflKey: string | null;
  mySeed: number | null;
  oppSeed: number | null;
  myScore: number;
  oppScore: number;
  won: boolean;
  games: Array<{ won: boolean; myChar: string | null; oppChar: string | null }>;
}

export interface MatchDetailEvent {
  eventId: string;
  tournamentName: string;
  category: PremierCategory;
  date: string;
  numEntrants: number | null;
  isOnline: boolean;
  placement: number | null;
  sets: MatchDetailSet[];
}

export interface PlayerMatchDetail {
  playerKey: string;
  windowStart: string;
  updatedAt: string;
  events: MatchDetailEvent[];
}

export function buildPlayerMatchDetail(
  playerKey: string,
  results: StartggPremierResultsData,
  identities: StartggIdentitiesData
): PlayerMatchDetail {
  const sflKeyByPlayerId = new Map(
    Object.entries(identities.players).map(([k, v]) => [v.startggPlayerId, k])
  );
  const p = results.players[playerKey];
  const placements = new Map((p?.placements ?? []).map((pl) => [pl.eventId, pl.placement]));
  const byEvent = new Map<string, MatchDetailSet[]>();
  for (const s of p?.sets ?? []) {
    if (!results.events[s.eventId]?.category) continue;
    const list = byEvent.get(s.eventId) ?? [];
    list.push({
      roundText: s.roundText,
      phaseName: s.phaseName,
      completedAt: s.completedAt,
      oppTag: s.oppTag,
      oppSflKey: s.oppPlayerId != null ? sflKeyByPlayerId.get(s.oppPlayerId) ?? null : null,
      mySeed: s.mySeed,
      oppSeed: s.oppSeed,
      myScore: s.myScore,
      oppScore: s.oppScore,
      won: s.won,
      games: s.games,
    });
    byEvent.set(s.eventId, list);
  }
  const events: MatchDetailEvent[] = [...byEvent.entries()]
    .map(([eventId, sets]) => {
      const ev = results.events[eventId];
      return {
        eventId,
        tournamentName: ev.tournamentName,
        category: ev.category as PremierCategory,
        date: ev.startDate,
        numEntrants: ev.numEntrants,
        isOnline: Boolean(ev.isOnline),
        placement: placements.get(eventId) ?? null,
        sets: sets.sort((a, b) => a.completedAt - b.completedAt),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return { playerKey, windowStart: results.windowStart, updatedAt: results.updatedAt, events };
}
