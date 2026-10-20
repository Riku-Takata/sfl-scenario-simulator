/**
 * Buckler の応答 → 自宅サーバーに蓄積する最小限のレコード
 *
 * 相手プレイヤーの名前・CFN ID は保存しない (SFL選手同士の対戦のみ選手キーで記録)。
 */
import { normalizeSflCharKey } from "../characters";

/** replay_battle_type */
export const BUCKLER_MODES: Record<number, "rank" | "casual" | "hub" | "custom"> = {
  1: "rank",
  2: "casual",
  3: "hub",
  4: "custom",
};

export interface BucklerMatch {
  id: string;
  /** UNIX秒 */
  t: number;
  mode: number;
  myChar: string;
  /** battle_input_type (0: クラシック / 1: モダン) */
  myInput: number | null;
  myMr: number | null;
  myLp: number | null;
  oppChar: string;
  oppInput: number | null;
  oppMr: number | null;
  oppLeague: number | null;
  /** 相手が SFL 選手の場合のみ */
  oppSflKey: string | null;
  won: boolean | null;
  roundsWon: number;
  roundsLost: number;
}

export interface BucklerSnapshot {
  /** YYYY-MM-DD (JST) */
  date: string;
  fetchedAt: string;
  seasonId: number | null;
  favoriteChar: string | null;
  characters: Array<{
    char: string;
    leagueRank: number | null;
    lp: number | null;
    mr: number | null;
    mrRanking: number | null;
    battles: number;
    wins: number;
  }>;
  /** 使用キャラ → 相手キャラ → 戦績 (今季) */
  vsChar: Record<string, Record<string, { n: number; w: number }>>;
  battleStats: Record<string, number>;
}

interface RawPlayerInfo {
  player?: { short_id?: number | string };
  character_tool_name?: string;
  playing_character_tool_name?: string;
  battle_input_type?: number;
  master_rating?: number;
  league_point?: number;
  league_rank?: number;
  round_results?: number[];
}

export interface RawReplay {
  replay_id: string;
  replay_battle_type: number;
  uploaded_at: number;
  player1_info: RawPlayerInfo;
  player2_info: RawPlayerInfo;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function charOf(p: RawPlayerInfo): string {
  return normalizeSflCharKey(p.playing_character_tool_name || p.character_tool_name || "");
}

/** round_results の 0 は落としたラウンド、0 以外は取ったラウンド (決着の種類) */
export function normalizeReplay(
  raw: RawReplay,
  mySid: string,
  sflKeyByCfn: Map<string, string>
): BucklerMatch | null {
  const p1 = raw.player1_info;
  const p2 = raw.player2_info;
  const isP1 = String(p1?.player?.short_id) === mySid;
  const isP2 = String(p2?.player?.short_id) === mySid;
  if (!raw.replay_id || (!isP1 && !isP2)) return null;
  const me = isP1 ? p1 : p2;
  const opp = isP1 ? p2 : p1;
  const rounds = me.round_results ?? [];
  const roundsWon = rounds.filter((r) => r !== 0).length;
  const roundsLost = rounds.filter((r) => r === 0).length;
  return {
    id: raw.replay_id,
    t: raw.uploaded_at,
    mode: raw.replay_battle_type,
    myChar: charOf(me),
    myInput: num(me.battle_input_type),
    myMr: num(me.master_rating),
    myLp: num(me.league_point),
    oppChar: charOf(opp),
    oppInput: num(opp.battle_input_type),
    oppMr: num(opp.master_rating),
    oppLeague: num(opp.league_rank),
    oppSflKey: sflKeyByCfn.get(String(opp?.player?.short_id)) ?? null,
    won: roundsWon === roundsLost ? null : roundsWon > roundsLost,
    roundsWon,
    roundsLost,
  };
}

interface RawPlay {
  current_season_id?: number;
  battle_stats?: Record<string, unknown>;
  character_league_infos?: Array<{
    character_tool_name?: string;
    is_played?: boolean;
    league_info?: {
      league_rank?: number;
      league_point?: number;
      master_rating?: number;
      master_rating_ranking?: number;
    };
  }>;
  character_win_rates?: Array<{ character_tool_name?: string; battle_count?: number; win_count?: number }>;
  character_win_rates_by_rival_character?: Array<{
    character_tool_name?: string;
    rival_character_win_rates?: Array<{
      rival_character_tool_name?: string;
      battle_count?: number;
      win_count?: number;
    }>;
  }>;
}

export function normalizePlay(
  pageProps: { play?: RawPlay; fighter_banner_info?: { favorite_character_tool_name?: string } },
  date: string,
  fetchedAt: string
): BucklerSnapshot {
  const play = pageProps.play ?? {};
  const winRates = new Map(
    (play.character_win_rates ?? [])
      .filter((c) => c.character_tool_name && c.character_tool_name !== "all")
      .map((c) => [normalizeSflCharKey(c.character_tool_name), c])
  );
  const characters = (play.character_league_infos ?? [])
    .filter((c) => c.is_played && c.character_tool_name)
    .map((c) => {
      const char = normalizeSflCharKey(c.character_tool_name);
      const wr = winRates.get(char);
      const li = c.league_info ?? {};
      return {
        char,
        leagueRank: num(li.league_rank),
        lp: num(li.league_point),
        mr: num(li.master_rating),
        mrRanking: num(li.master_rating_ranking),
        battles: wr?.battle_count ?? 0,
        wins: wr?.win_count ?? 0,
      };
    })
    .sort((a, b) => b.battles - a.battles || (b.lp ?? 0) - (a.lp ?? 0));

  const vsChar: BucklerSnapshot["vsChar"] = {};
  for (const row of play.character_win_rates_by_rival_character ?? []) {
    const mine = normalizeSflCharKey(row.character_tool_name);
    if (!mine || mine === "all") continue;
    for (const r of row.rival_character_win_rates ?? []) {
      const opp = normalizeSflCharKey(r.rival_character_tool_name);
      if (!opp || opp === "all" || !r.battle_count) continue;
      vsChar[mine] ??= {};
      vsChar[mine][opp] = { n: r.battle_count, w: r.win_count ?? 0 };
    }
  }

  const battleStats: Record<string, number> = {};
  for (const [k, v] of Object.entries(play.battle_stats ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) battleStats[k] = v;
  }

  return {
    date,
    fetchedAt,
    seasonId: num(play.current_season_id),
    favoriteChar: pageProps.fighter_banner_info?.favorite_character_tool_name
      ? normalizeSflCharKey(pageProps.fighter_banner_info.favorite_character_tool_name)
      : null,
    characters,
    vsChar,
    battleStats,
  };
}

/** Act (シーズン) 単位のランクマ集計 */
export interface BucklerActRecord {
  seasonId: number;
  fetchedAt: string;
  /** ランクマッチのキャラ別戦績 (対戦のあったキャラのみ) */
  rank: Array<{ char: string; n: number; w: number }>;
  /** そのActのキャラ別 LP・MR (プレイ実績のあるキャラのみ) */
  league: Array<{ char: string; lp: number | null; mr: number | null; mrRanking: number | null; leagueRank: number | null }>;
}

export function normalizeAct(
  seasonId: number,
  winRates: { character_win_rates?: Array<{ character_tool_name?: string; battle_count?: number; win_count?: number }> },
  league: {
    character_league_infos?: Array<{
      character_tool_name?: string;
      is_played?: boolean;
      league_info?: { league_point?: number; master_rating?: number; master_rating_ranking?: number; league_rank?: number };
    }>;
  },
  fetchedAt: string
): BucklerActRecord {
  return {
    seasonId,
    fetchedAt,
    rank: (winRates.character_win_rates ?? [])
      .filter((c) => c.character_tool_name && c.character_tool_name !== "all" && (c.battle_count ?? 0) > 0)
      .map((c) => ({ char: normalizeSflCharKey(c.character_tool_name), n: c.battle_count ?? 0, w: c.win_count ?? 0 }))
      .sort((a, b) => b.n - a.n),
    league: (league.character_league_infos ?? [])
      .filter((c) => c.is_played && c.character_tool_name && (c.league_info?.league_point ?? -1) >= 0)
      .map((c) => ({
        char: normalizeSflCharKey(c.character_tool_name),
        lp: num(c.league_info?.league_point),
        mr: num(c.league_info?.master_rating),
        mrRanking: num(c.league_info?.master_rating_ranking),
        leagueRank: num(c.league_info?.league_rank),
      }))
      .sort((a, b) => (b.lp ?? 0) - (a.lp ?? 0)),
  };
}

export interface BucklerDiaMonth {
  month: string;
  variant: string;
  /** リーグ帯キー (Buckler の ci_sort のキー) → 31×31 などの相性行列 */
  blocks: Record<string, { chars: string[]; matrix: Array<Array<number | null>> }>;
}

interface RawDiaBlock {
  opponent_header?: Array<{ tool_name?: string }>;
  records?: Array<{ tool_name?: string; values?: Array<{ val?: string }> }>;
}

/**
 * Capcom 公式ダイアグラム → 勝率 (0..1) の行列
 * values[i] は opponent_header[i] に対応する (位置で対応付け、_oid では引かない)。
 * 公式スコアは 0〜10 (5.0 が五分)、"-" はデータなし。
 */
export function normalizeDia(
  raw: { diaData?: { c?: { ci_sort?: Record<string, RawDiaBlock> } } },
  month: string,
  variant: string
): BucklerDiaMonth {
  const blocks: BucklerDiaMonth["blocks"] = {};
  for (const [key, blk] of Object.entries(raw.diaData?.c?.ci_sort ?? {})) {
    const header = (blk.opponent_header ?? []).map((h) => normalizeSflCharKey(h.tool_name));
    const rows = blk.records ?? [];
    blocks[key] = {
      chars: rows.map((r) => normalizeSflCharKey(r.tool_name)),
      matrix: rows.map((r) =>
        header.map((_, i) => {
          const v = Number.parseFloat(r.values?.[i]?.val ?? "");
          return Number.isFinite(v) ? Math.round((v / 10) * 10000) / 10000 : null;
        })
      ),
    };
    // 列ヘッダの順序が行と異なる場合に備え、行列を行キャラ順の正方行列に揃える
    const colIndex = new Map(header.map((c, i) => [c, i]));
    blocks[key].matrix = blocks[key].matrix.map((row) =>
      blocks[key].chars.map((c) => {
        const i = colIndex.get(c);
        return i == null ? null : row[i];
      })
    );
  }
  return { month, variant, blocks };
}
