/**
 * 「プレミア大会」の定義 (start.gg 取得対象)
 *
 * 対象: CPT Premier / World Warrior / EVO 系 / Capcom Cup / 大型オフライン大会
 * 期間: 直近 PREMIER_WINDOW_DAYS 日 (シーズン開始の定義が曖昧なため固定期間で判定)
 *
 * 判定は大会名ベースのため、新しい大会を追加・除外したい場合は
 * MAJOR_TOURNAMENT_PATTERNS / EXCLUDED_EVENT_PATTERNS を編集する。
 */
import type { PremierCategory } from "../types";

export const SF6_VIDEOGAME_ID = 43868;
export const PREMIER_WINDOW_DAYS = 365;

// CPT Premier として扱う大型大会 (大会名に CPT 表記がないもの)
const MAJOR_TOURNAMENT_PATTERNS: RegExp[] = [
  /combo\s*breaker/i,
  /\bceo\b/i,
  /blink\s*respawn/i,
  /red\s*bull\s*kumite/i,
  /esports\s*world\s*cup|\bewc\b/i,
  /ultimate\s*fighting\s*arena|\bufa\b/i,
  /battle\s*arena\s*melbourne|\bbam\b/i,
  /thaiger\s*uppercut/i,
  /stunfest/i,
  /frosty\s*faustings/i,
  /east\s*coast\s*throwdown/i,
  /dreamhack/i,
];

// 個人戦メイン以外のサイドイベント
const EXCLUDED_EVENT_PATTERNS: RegExp[] = [
  /team|crew|duo|doubles|2v2|3v3|teams/i,
  /amateur|beginner|casual|novice|rookie|newcomer/i,
  /ladies|women|girls|junior|kids|u-?1[0-9]|under\s*1[0-9]/i,
  /side\s*event|redemption|exhibition|showmatch|invitational|ranbat|weekly/i,
  /last\s*chance|lcq/i,
  /\bmr\b|master\s*rate|ranked/i,
];

const MIN_ENTRANTS = 64;
const LARGE_OFFLINE_ENTRANTS = 512;

export interface PremierEventInput {
  tournamentName: string;
  eventName: string;
  numEntrants: number | null;
  isOnline: boolean | null;
  videogameId: number | null;
}

export function classifyPremierEvent(
  ev: PremierEventInput
): PremierCategory | null {
  if (ev.videogameId !== SF6_VIDEOGAME_ID) return null;
  const entrants = ev.numEntrants ?? 0;
  if (entrants < MIN_ENTRANTS) return null;
  if (EXCLUDED_EVENT_PATTERNS.some((re) => re.test(ev.eventName))) return null;

  const t = ev.tournamentName;
  const both = `${t} ${ev.eventName}`;
  if (/capcom\s*cup/i.test(t)) return "Capcom Cup";
  if (/world\s*warrior/i.test(t)) return "CPT WW";
  if (/\bevo\b/i.test(t)) return "EVO";
  if (/premier|capcom\s*pro\s*tour|\bcpt\b/i.test(both)) return "CPT Premier";
  if (MAJOR_TOURNAMENT_PATTERNS.some((re) => re.test(t))) return "CPT Premier";
  if (!ev.isOnline && entrants >= LARGE_OFFLINE_ENTRANTS) return "Major";
  return null;
}
