/**
 * ローカルに蓄積した Buckler データ → 公開用の集計 (src/data/buckler-*.json)
 *
 * 公開するのはプロ本人のキャラ別成績・活動量・行動傾向と、公式ダイアグラムのみ。
 * 対戦相手の情報 (名前・ID・SFL選手同士の練習相手) は含めない。
 */
import type { BucklerActRecord, BucklerDiaMonth, BucklerMatch, BucklerSnapshot } from "./records";
import { BUCKLER_MODES } from "./records";

const DAY = 86_400;
const RECENT_MATCHES = 30;

/** 公開する行動傾向 (Buckler の battle_stats、今季集計) */
export const PUBLISHED_BATTLE_STATS = [
  "rank_match_play_count",
  "casual_match_play_count",
  "battle_hub_match_play_count",
  "custom_room_match_play_count",
  "drive_parry",
  "just_parry",
  "drive_impact",
  "received_drive_impact",
  "drive_reversal",
  "throw_count",
  "received_throw_count",
  "throw_tech",
  "punish_counter",
  "received_punish_counter",
  "corner_time",
  "cornered_time",
  "gauge_rate_drive_arts",
  "gauge_rate_drive_guard",
  "gauge_rate_drive_impact",
  "gauge_rate_drive_reversal",
  "gauge_rate_drive_rush_from_parry",
  "gauge_rate_drive_rush_from_cancel",
  "gauge_rate_sa_lv1",
  "gauge_rate_sa_lv2",
  "gauge_rate_sa_lv3",
  "gauge_rate_ca",
] as const;

export interface CharCount {
  char: string;
  n: number;
  w: number;
}

export interface ActivityWindow {
  matches: number;
  wins: number;
  activeDays: number;
  byChar: CharCount[];
  byMode: Record<"rank" | "casual" | "hub" | "custom", number>;
}

/** Act (シーズン) 単位のランクマ集計 */
export interface ActSummary {
  seasonId: number;
  rankBattles: number;
  rankWins: number;
  /** キャラ別: ランクマ対戦数・勝利数と、その Act の MR/LP */
  chars: Array<{ char: string; n: number; w: number; mr: number | null; lp: number | null; mrRanking: number | null }>;
}

export function summarizeAct(record: BucklerActRecord | undefined): ActSummary | null {
  if (!record) return null;
  const league = new Map(record.league.map((l) => [l.char, l]));
  const chars = record.rank.map((r) => ({
    ...r,
    mr: league.get(r.char)?.mr ?? null,
    lp: league.get(r.char)?.lp ?? null,
    mrRanking: league.get(r.char)?.mrRanking ?? null,
  }));
  return {
    seasonId: record.seasonId,
    rankBattles: chars.reduce((s, c) => s + c.n, 0),
    rankWins: chars.reduce((s, c) => s + c.w, 0),
    chars: chars.slice(0, 6),
  };
}

export interface BucklerPlayerProfile {
  sflKey: string;
  asOf: string;
  seasonId: number | null;
  mainChar: string | null;
  characters: BucklerSnapshot["characters"];
  last7Days: ActivityWindow;
  last30Days: ActivityWindow;
  /** メインキャラのランクマ MR (日ごとの最終値) */
  mrTrend: Array<{ date: string; mr: number }>;
  /** 直近14日で使用割合が増えたキャラ */
  risingChars: Array<{ char: string; recentShare: number; priorShare: number; recentMatches: number }>;
  /** 今季のメインキャラの対キャラ戦績 (15戦以上) */
  mainVsChar: CharCount[];
  battleStats: Record<string, number>;
  /** 直近の対戦の明細 (相手の名前・IDは含めない) */
  recentMatches: Array<{
    t: number;
    mode: string;
    myChar: string;
    myMr: number | null;
    oppChar: string;
    oppMr: number | null;
    won: boolean | null;
    roundsWon: number;
    roundsLost: number;
  }>;
  /** 今の Act と1つ前の Act のランクマ集計 (キャラ別の戦績・MR) */
  acts: { current: ActSummary | null; previous: ActSummary | null };
  /** 蓄積済みの対戦ログ件数と最古の日付 */
  storedMatches: number;
  storedSince: string | null;
}

function jstDate(unixSec: number): string {
  return new Date(unixSec * 1000 + 9 * 3600_000).toISOString().slice(0, 10);
}

function countByChar(matches: BucklerMatch[]): CharCount[] {
  const map = new Map<string, CharCount>();
  for (const m of matches) {
    const c = map.get(m.myChar) ?? { char: m.myChar, n: 0, w: 0 };
    c.n++;
    if (m.won) c.w++;
    map.set(m.myChar, c);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

function activity(matches: BucklerMatch[]): ActivityWindow {
  const byMode = { rank: 0, casual: 0, hub: 0, custom: 0 };
  for (const m of matches) {
    const mode = BUCKLER_MODES[m.mode];
    if (mode) byMode[mode]++;
  }
  return {
    matches: matches.length,
    wins: matches.filter((m) => m.won).length,
    activeDays: new Set(matches.map((m) => jstDate(m.t))).size,
    byChar: countByChar(matches),
    byMode,
  };
}

export function buildBucklerProfile(
  sflKey: string,
  matches: BucklerMatch[],
  snapshots: BucklerSnapshot[],
  nowSec = Math.floor(Date.now() / 1000),
  acts: Record<string, BucklerActRecord> = {}
): BucklerPlayerProfile | null {
  const snap = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!snap && matches.length === 0) return null;

  const within = (days: number, from = nowSec) =>
    matches.filter((m) => m.t > from - days * DAY && m.t <= from);
  const last7 = within(7);
  const last30 = within(30);

  const currentSeason = snap?.seasonId ?? null;
  const currentAct = currentSeason != null ? summarizeAct(acts[String(currentSeason)]) : null;
  const previousAct = currentSeason != null ? summarizeAct(acts[String(currentSeason - 1)]) : null;

  // メインキャラは今 Act のランクマ対戦数が最多のキャラ (直近100戦は新キャラの試し打ちなどに偏るため補助に使う)
  const rank30 = last30.filter((m) => BUCKLER_MODES[m.mode] === "rank");
  const mainChar =
    currentAct?.chars[0]?.char ??
    countByChar(rank30)[0]?.char ??
    snap?.characters[0]?.char ??
    snap?.favoriteChar ??
    null;

  const mrByDate = new Map<string, number>();
  for (const m of [...rank30].sort((a, b) => a.t - b.t)) {
    if (m.myChar === mainChar && m.myMr && m.myMr > 0) mrByDate.set(jstDate(m.t), m.myMr);
  }

  const recent = within(14);
  const prior = within(30, nowSec - 14 * DAY);
  const share = (list: BucklerMatch[], char: string) =>
    list.length ? list.filter((m) => m.myChar === char).length / list.length : 0;
  const risingChars =
    recent.length >= 20
      ? countByChar(recent)
          .map((c) => ({
            char: c.char,
            recentShare: Math.round(share(recent, c.char) * 1000) / 10,
            priorShare: Math.round(share(prior, c.char) * 1000) / 10,
            recentMatches: c.n,
          }))
          .filter((c) => c.recentShare >= 10 && c.recentShare - c.priorShare >= 10)
      : [];

  const mainVsChar = Object.entries((mainChar && snap?.vsChar[mainChar]) || {})
    .map(([char, v]) => ({ char, n: v.n, w: v.w }))
    .filter((v) => v.n >= 15)
    .sort((a, b) => b.n - a.n);

  const battleStats: Record<string, number> = {};
  for (const k of PUBLISHED_BATTLE_STATS) {
    const v = snap?.battleStats[k];
    if (v != null) battleStats[k] = v;
  }

  const sorted = [...matches].sort((a, b) => a.t - b.t);
  return {
    sflKey,
    asOf: snap?.date ?? jstDate(nowSec),
    seasonId: snap?.seasonId ?? null,
    mainChar,
    characters: (snap?.characters ?? []).slice(0, 8),
    last7Days: activity(last7),
    last30Days: activity(last30),
    mrTrend: [...mrByDate.entries()].map(([date, mr]) => ({ date, mr })),
    risingChars,
    mainVsChar,
    battleStats,
    recentMatches: sorted
      .slice(-RECENT_MATCHES)
      .reverse()
      .map((x) => ({
        t: x.t,
        mode: BUCKLER_MODES[x.mode] ?? "other",
        myChar: x.myChar,
        myMr: x.myMr,
        oppChar: x.oppChar,
        oppMr: x.oppMr,
        won: x.won,
        roundsWon: x.roundsWon,
        roundsLost: x.roundsLost,
      })),
    acts: { current: currentAct, previous: previousAct },
    storedMatches: matches.length,
    storedSince: sorted[0] ? jstDate(sorted[0].t) : null,
  };
}

/** 予測に使うリーグ帯 (ci_sort のキー)。"36" は Master 全体 */
export const DIA_BLOCK_PREFERENCE = ["36"];

export function pickDiaBlock(month: BucklerDiaMonth): { key: string; chars: string[]; matrix: Array<Array<number | null>> } | null {
  const key = DIA_BLOCK_PREFERENCE.find((k) => month.blocks[k]) ?? Object.keys(month.blocks)[0];
  if (!key) return null;
  return { key, ...month.blocks[key] };
}
