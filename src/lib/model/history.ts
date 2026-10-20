/**
 * SFL 公式戦のボウト履歴 (予測モデルの学習・検証用)
 */
import { normalizeSflCharKey, sflCharMode } from "../characters";

export interface SflBout {
  season: string;
  slug: string;
  stage: "regular" | "playoff" | "final";
  /** YYYY-MM-DD */
  date: string;
  matchNo: number;
  homeTeam: string;
  awayTeam: string;
  /** 0: 先鋒 / 1: 中堅 / 2: 大将 / 3: 延長 */
  position: number;
  homePlayer: string;
  awayPlayer: string;
  homeChar: string;
  awayChar: string;
  homeMode: "c" | "m" | null;
  awayMode: "c" | "m" | null;
  homeBattles: number;
  awayBattles: number;
}

/**
 * 大将戦 (各セットの3番目: 2 / 5 / 8) は3本先取、それ以外 (先鋒・中堅・延長) は2本先取
 * 2025年233ボウト・2026年68ボウトの決着スコアで確認
 */
export function firstToForPosition(position: number): number {
  return position % 3 === 2 ? 3 : 2;
}

interface RawBoutPlayer {
  player: string;
  battle: number;
  status: number;
  use_chara?: Record<string, unknown>;
}

interface RawSlot {
  home?: string;
  away?: string;
  result?: "" | { "1p"?: RawBoutPlayer[]; "2p"?: RawBoutPlayer[] };
}

export interface RawSchedule {
  post_name: string;
  fields?: { section?: { time?: string } & Record<string, RawSlot | string | unknown> };
}

function stageOf(slug: string): SflBout["stage"] | null {
  if (/^div-[sf]-sec\d+$/.test(slug)) return "regular";
  if (slug.startsWith("playoff")) return "playoff";
  if (slug === "final") return "final";
  return null;
}

/** 公式 API の schedules → ボウト一覧 (1P 側が HOME) */
export function extractBouts(season: string, schedules: RawSchedule[]): SflBout[] {
  const bouts: SflBout[] = [];
  for (const sched of schedules) {
    const stage = stageOf(sched.post_name);
    const sec = sched.fields?.section;
    if (!stage || !sec) continue;
    const date = String(sec.time ?? "").slice(0, 10);
    for (let n = 1; n <= 4; n++) {
      const slot = sec[`match${n}`] as RawSlot | undefined;
      const result = slot?.result;
      if (!slot || !result || typeof result === "string") continue;
      const p1 = result["1p"] ?? [];
      const p2 = result["2p"] ?? [];
      for (let i = 0; i < Math.min(p1.length, p2.length); i++) {
        const rawHome = Object.keys(p1[i].use_chara ?? {})[0] ?? "";
        const rawAway = Object.keys(p2[i].use_chara ?? {})[0] ?? "";
        const modeOf = (raw: string, obj: Record<string, unknown> | undefined) =>
          sflCharMode(raw) ??
          ((obj?.[raw] as { mode?: string } | undefined)?.mode === "m"
            ? "m"
            : (obj?.[raw] as { mode?: string } | undefined)?.mode === "c"
              ? "c"
              : null);
        bouts.push({
          season,
          slug: sched.post_name,
          stage,
          date,
          matchNo: n,
          homeTeam: slot.home ?? "",
          awayTeam: slot.away ?? "",
          position: Number(p1[i].status),
          homePlayer: p1[i].player,
          awayPlayer: p2[i].player,
          homeChar: normalizeSflCharKey(rawHome),
          awayChar: normalizeSflCharKey(rawAway),
          homeMode: modeOf(rawHome, p1[i].use_chara),
          awayMode: modeOf(rawAway, p2[i].use_chara),
          homeBattles: Number(p1[i].battle || 0),
          awayBattles: Number(p2[i].battle || 0),
        });
      }
    }
  }
  return bouts.sort((a, b) => a.date.localeCompare(b.date) || a.matchNo - b.matchNo || a.position - b.position);
}
