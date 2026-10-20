import fs from "node:fs";
import path from "node:path";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

import {
  CptMatchupsTop96DataSchema,
  MasterPlayersDataSchema,
  PlayerStatsDataSchema,
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../src/lib/schema";
import type {
  CptCharMatchupCell,
  CptMatchupsTop96Data,
  DivisionId,
  MasterPlayer,
  MasterPlayersData,
  PlayerStatEntry,
  PlayerStatsData,
} from "../src/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../src/lib/simulator";
import { SF6_CHARACTERS as ALL_CHARACTERS, normalizeSflCharKey } from "../src/lib/characters";
import {
  buildTournamentProfiles,
  type PlayerTournamentProfile,
} from "../src/lib/startgg/profile";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const MASTER_PLAYERS_FILE = path.join(DATA_DIR, "master-players.json");
const CPT_MATCHUPS_FILE = path.join(DATA_DIR, "cpt-matchups-top96.json");
const PLAYER_STATS_FILE = path.join(DATA_DIR, "player-stats.json");
const SEED_CAPCOM_FILE = path.join(DATA_DIR, "raw-capcom-seed.json");
const STARTGG_RESULTS_FILE = path.join(DATA_DIR, "startgg-premier-results.json");
const STARTGG_IDENTITIES_FILE = path.join(DATA_DIR, "startgg-identities.json");

export const SF6_CHARACTERS: Array<{ key: string; name: string }> = ALL_CHARACTERS.map(
  ({ key, name }) => ({ key, name })
);

// 各選手のフォールバック主要使用キャラ・手設定の事前Elo (start.gg 実績が少ない選手ほどこの値に寄る)
const PLAYER_DEFAULT_CHAR_ELO: Record<
  string,
  { mainChar: string; subChars: string[]; elo: number; startggSlug: string }
> = {
  // Division S
  sako: { mainChar: "elena", subChars: ["chunli", "aki"], elo: 1920, startggSlug: "user/sako" },
  fujimura: { mainChar: "cviper", subChars: ["ken", "ibuki"], elo: 1965, startggSlug: "user/fujimura" },
  moke: { mainChar: "mai", subChars: ["chunli", "rashid"], elo: 1955, startggSlug: "user/moke" },
  ryukichi: { mainChar: "ken", subChars: ["mai", "gouki_akuma"], elo: 1975, startggSlug: "user/ryukichi" },
  dogura: { mainChar: "elena", subChars: ["vega_mbison", "dee_jay"], elo: 1890, startggSlug: "user/dogura" },
  shuto: { mainChar: "ryu", subChars: ["gouki_akuma", "marisa"], elo: 1950, startggSlug: "user/shuto" },
  bonchan: { mainChar: "sagat", subChars: ["gouki_akuma", "luke"], elo: 1960, startggSlug: "user/bonchan" },
  kazunoko: { mainChar: "cviper", subChars: ["cammy", "jamie"], elo: 1970, startggSlug: "user/kazunoko" },
  machabo: { mainChar: "ryu", subChars: ["ken"], elo: 1945, startggSlug: "user/machabo" },
  kobayan: { mainChar: "zangief", subChars: ["marisa"], elo: 1955, startggSlug: "user/kobayan" },
  cosa: { mainChar: "ken", subChars: ["ryu", "luke"], elo: 1915, startggSlug: "user/cosa" },
  kincho: { mainChar: "terry", subChars: ["ken", "ryu"], elo: 1965, startggSlug: "user/kincho" },
  momochi: { mainChar: "ed", subChars: ["ken", "cviper"], elo: 1985, startggSlug: "user/momochi" },
  higuchi: { mainChar: "guile", subChars: ["sagat"], elo: 1990, startggSlug: "user/higuchi" },
  yamaguchi: { mainChar: "mai", subChars: ["dee_jay", "ed"], elo: 1965, startggSlug: "user/yamaguchi" },
  mena: { mainChar: "blanka", subChars: ["luke", "zangief"], elo: 2040, startggSlug: "user/menard" },
  acqua: { mainChar: "blanka", subChars: ["jp", "ed"], elo: 1895, startggSlug: "user/acqua" },
  hibiki: { mainChar: "lily", subChars: ["mai"], elo: 1935, startggSlug: "user/hibiki" },
  akira: { mainChar: "cammy", subChars: ["cviper"], elo: 1930, startggSlug: "user/akira" },
  takepi: { mainChar: "jp", subChars: ["vega_mbison"], elo: 1890, startggSlug: "user/takepi" },
  yanai: { mainChar: "vega_mbison", subChars: ["sagat"], elo: 1915, startggSlug: "user/yanai" },
  johnny: { mainChar: "elena", subChars: ["marisa"], elo: 1905, startggSlug: "user/johnny" },
  torimeshi: { mainChar: "dhalsim", subChars: ["jp"], elo: 1940, startggSlug: "user/torimeshi" },
  "2bassa": { mainChar: "juri", subChars: ["cammy"], elo: 1955, startggSlug: "user/2bassa" },
  // Division F
  tokido: { mainChar: "jp", subChars: ["ken", "gouki_akuma"], elo: 1995, startggSlug: "user/tokido" },
  mago: { mainChar: "juri", subChars: ["mai", "cammy"], elo: 1940, startggSlug: "user/mago" },
  mizuha: { mainChar: "cammy", subChars: ["mai"], elo: 1915, startggSlug: "user/mizuha" },
  wabiichi: { mainChar: "terry", subChars: ["ken"], elo: 1910, startggSlug: "user/wabiichi" },
  gachikun: { mainChar: "rashid", subChars: ["sagat"], elo: 1995, startggSlug: "user/gachikun" },
  kawano: { mainChar: "luke", subChars: ["gouki_akuma"], elo: 2005, startggSlug: "user/kawano" },
  pugera: { mainChar: "cviper", subChars: ["juri", "vega_mbison"], elo: 1960, startggSlug: "user/pugera" },
  sahara: { mainChar: "ed", subChars: ["ryu"], elo: 1935, startggSlug: "user/sahara" },
  itazan: { mainChar: "zangief", subChars: ["marisa"], elo: 1960, startggSlug: "user/itazan" },
  nauman: { mainChar: "mai", subChars: ["ken", "rashid"], elo: 1915, startggSlug: "user/nauman" },
  takeuchi: { mainChar: "jamie", subChars: ["rashid"], elo: 1965, startggSlug: "user/takeuchi_john" },
  keib: { mainChar: "mai", subChars: ["jp"], elo: 1920, startggSlug: "user/keib" },
  seiya: { mainChar: "chunli", subChars: ["mai"], elo: 1895, startggSlug: "user/seiya" },
  otani: { mainChar: "ken", subChars: ["elena", "luke"], elo: 1925, startggSlug: "user/otani" },
  mocchi: { mainChar: "gouki_akuma", subChars: ["rashid"], elo: 1935, startggSlug: "user/mocchi" },
  raoyamu: { mainChar: "vega_mbison", subChars: ["ken"], elo: 1915, startggSlug: "user/raoyamu" },
  daigo: { mainChar: "gouki_akuma", subChars: ["ken", "guile"], elo: 1965, startggSlug: "user/daigo" },
  fuudo: { mainChar: "ed", subChars: ["dee_jay"], elo: 1985, startggSlug: "user/fuudo" },
  yas: { mainChar: "ryu", subChars: ["juri"], elo: 1950, startggSlug: "user/yas" },
  hinao: { mainChar: "sagat", subChars: ["ryu", "ken"], elo: 1945, startggSlug: "user/hinao" },
  jr: { mainChar: "zangief", subChars: ["honda"], elo: 1955, startggSlug: "user/jr" },
  takagi: { mainChar: "blanka", subChars: ["lily"], elo: 1925, startggSlug: "user/takagi" },
  adelie: { mainChar: "ed", subChars: ["cammy"], elo: 1940, startggSlug: "user/adelie" },
  hikaru: { mainChar: "aki", subChars: ["blanka"], elo: 1995, startggSlug: "user/hikaru" },
};

/**
 * ベイズ平滑化 (Bayesian Smoothing)
 * サンプル数が少ないレアなキャラ組み合わせでも 0% や 100% にならないよう事前分布 (alpha=20, p0=0.50) で補正
 */
export function bayesianSmooth(
  wins: number,
  total: number,
  alpha = 20,
  prior = 0.5
): number {
  return Math.round(((wins + alpha * prior) / (total + alpha)) * 10000) / 10000;
}

/**
 * CPT Top 96 競技シーンのキャラ相性傾向シード（弾キャラ vs コマ投げ、長リーチ vs 突進等）
 */
function getCompetitiveArchetypeBias(charA: string, charB: string): number {
  if (charA === charB) return 0.5;
  const advantages: Record<string, Record<string, number>> = {
    guile: { zangief: 0.57, lily: 0.54, ryu: 0.53, jamie: 0.55, jp: 0.45, blanka: 0.47, cammy: 0.46 },
    jp: { zangief: 0.58, dhalsim: 0.54, guile: 0.55, cammy: 0.44, rashid: 0.46, kimberly: 0.45, cviper: 0.46 },
    dhalsim: { zangief: 0.59, ryu: 0.54, vega_mbison: 0.44, cammy: 0.44, rashid: 0.45, juri: 0.46 },
    zangief: { ken: 0.52, ed: 0.48, cammy: 0.53, mai: 0.53, guile: 0.43, jp: 0.42, dhalsim: 0.41, lily: 0.45 },
    cviper: { sagat: 0.55, jp: 0.54, dhalsim: 0.55, vega_mbison: 0.54, zangief: 0.47, terry: 0.47 },
    mai: { ryu: 0.54, ken: 0.53, jp: 0.53, zangief: 0.47, sagat: 0.46, guile: 0.48 },
    blanka: { guile: 0.53, gouki_akuma: 0.54, cammy: 0.53, elena: 0.54, zangief: 0.48, aki: 0.47 },
    rashid: { jp: 0.54, dhalsim: 0.55, gouki_akuma: 0.53, vega_mbison: 0.52, guile: 0.48, luke: 0.49 },
    ed: { luke: 0.53, mai: 0.53, cammy: 0.52, zangief: 0.52, blanka: 0.48, guile: 0.48 },
    aki: { jamie: 0.55, zangief: 0.54, mai: 0.53, jp: 0.47, cammy: 0.47 },
    terry: { cammy: 0.54, cviper: 0.53, lily: 0.53, ryu: 0.47, rashid: 0.48 },
    sagat: { mai: 0.54, elena: 0.53, ryu: 0.52, cviper: 0.45, juri: 0.47 },
    luke: { elena: 0.55, ryu: 0.53, rashid: 0.51, jp: 0.47, ed: 0.47 },
    juri: { chunli: 0.54, sagat: 0.53, dhalsim: 0.54, elena: 0.53, guile: 0.47 },
  };

  if (advantages[charA]?.[charB] !== undefined) {
    return advantages[charA][charB];
  }
  if (advantages[charB]?.[charA] !== undefined) {
    return Math.round((1 - advantages[charB][charA]) * 100) / 100;
  }

  // 決定論的微小バリエーション (0.48 ~ 0.52)
  let hash = 0;
  const pair = charA < charB ? `${charA}:${charB}` : `${charB}:${charA}`;
  for (let i = 0; i < pair.length; i++) {
    hash = (hash * 31 + pair.charCodeAt(i)) | 0;
  }
  const delta = ((Math.abs(hash) % 5) - 2) * 0.01;
  return charA < charB ? 0.5 + delta : 0.5 - delta;
}

/**
 * SFL公式の use_char / vs_char をキャラ内部キーで集約 ("ken(m)" と "ken" は同一キャラとして合算)
 */
function normalizeCharRecords(
  raw: Record<string, { entry?: number; win?: number; lose?: number }> | undefined
): Record<string, { entry: number; win: number; lose: number }> {
  const out: Record<string, { entry: number; win: number; lose: number }> = {};
  for (const [rawKey, v] of Object.entries(raw ?? {})) {
    const key = normalizeSflCharKey(rawKey);
    if (!key) continue;
    out[key] ??= { entry: 0, win: 0, lose: 0 };
    out[key].entry += Number(v?.entry || 0);
    out[key].win += Number(v?.win || 0);
    out[key].lose += Number(v?.lose || 0);
  }
  return out;
}

interface StartggContext {
  profiles: Record<string, PlayerTournamentProfile>;
  /** 両キャラが登録されたゲーム (SFL選手同士のセットは1回だけ数える) */
  charGames: Array<{ myChar: string; oppChar: string; won: boolean }>;
  windowStart: string;
}

/**
 * Step 0a が保存した start.gg プレミア大会データを読み込み、選手プロファイルを構築
 */
function loadStartggContext(): StartggContext | null {
  if (!fs.existsSync(STARTGG_RESULTS_FILE) || !fs.existsSync(STARTGG_IDENTITIES_FILE)) {
    return null;
  }
  const results = StartggPremierResultsDataSchema.parse(
    JSON.parse(fs.readFileSync(STARTGG_RESULTS_FILE, "utf8"))
  );
  const identities = StartggIdentitiesDataSchema.parse(
    JSON.parse(fs.readFileSync(STARTGG_IDENTITIES_FILE, "utf8"))
  );
  const profiles = buildTournamentProfiles(results, identities, PLAYER_NAME_MAP);

  const seenSetIds = new Set<string>();
  const charGames: StartggContext["charGames"] = [];
  for (const p of Object.values(results.players)) {
    for (const set of p.sets) {
      if (!results.events[set.eventId]?.category || seenSetIds.has(set.id)) continue;
      seenSetIds.add(set.id);
      for (const g of set.games) {
        if (g.myChar && g.oppChar) {
          charGames.push({ myChar: g.myChar, oppChar: g.oppChar, won: g.won });
        }
      }
    }
  }
  return { profiles, charGames, windowStart: results.windowStart };
}

/**
 * start.gg パフォーマンスレーティングを手設定Eloの尺度に合わせて事前Eloと合成
 * (シード由来の相手強度は絶対値に意味がないため、SFL選手全体の平均を手設定Eloの平均に揃える)
 */
function buildEloCalibration(
  profiles: Record<string, PlayerTournamentProfile>
): (playerKey: string, priorElo: number) => number {
  const rated = Object.values(profiles).filter((p) => p.performanceRating != null);
  if (rated.length === 0) return (_key, prior) => prior;
  const priors = rated.map((p) => PLAYER_DEFAULT_CHAR_ELO[p.sflKey]?.elo ?? 1930);
  const shift =
    priors.reduce((a, b) => a + b, 0) / priors.length -
    rated.reduce((a, p) => a + (p.performanceRating ?? 0), 0) / rated.length;
  const PRIOR_SETS = 40;
  return (playerKey, priorElo) => {
    const p = profiles[playerKey];
    if (!p || p.performanceRating == null) return priorElo;
    const w = p.ratingSampleSets / (p.ratingSampleSets + PRIOR_SETS);
    return Math.round(priorElo * (1 - w) + (p.performanceRating + shift) * w);
  };
}

export async function fetchAndBuildCptData(): Promise<{
  masterPlayers: MasterPlayersData;
  cptMatchups: CptMatchupsTop96Data;
  playerStats: PlayerStatsData;
}> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const startgg = loadStartggContext();
  const calibrateElo = startgg
    ? buildEloCalibration(startgg.profiles)
    : (_key: string, prior: number) => prior;
  console.log(
    `[Step 0] Building matchup matrix & SFL 48-player stats (start.gg premier data: ${
      startgg
        ? `${Object.keys(startgg.profiles).length} players / ${startgg.charGames.length} char-reported games since ${startgg.windowStart}`
        : "NOT AVAILABLE (prior + SFL only)"
    })...`
  );

  // SFL公式シードから実戦の選手・キャラ・H2Hデータを読み込む
  const rawCapcom = fs.existsSync(SEED_CAPCOM_FILE)
    ? JSON.parse(fs.readFileSync(SEED_CAPCOM_FILE, "utf8"))
    : null;
  const rawPlayers: Record<string, any> = rawCapcom?.data?.players || {};
  const rawSchedules: any[] = rawCapcom?.data?.schedules || [];

  // 1. SFL実戦ログからキャラ別対戦数を集計
  const sflCharWins: Record<string, Record<string, { w: number; n: number }>> = {};
  for (const c1 of SF6_CHARACTERS) {
    sflCharWins[c1.key] = {};
    for (const c2 of SF6_CHARACTERS) {
      sflCharWins[c1.key][c2.key] = { w: 0, n: 0 };
    }
  }

  for (const sched of rawSchedules) {
    const sec = sched?.fields?.section;
    if (!sec) continue;
    for (const mKey of ["match1", "match2", "match3"]) {
      const m = sec[mKey];
      if (!m?.result || typeof m.result === "string") continue;
      const p1List = m.result["1p"] || [];
      const p2List = m.result["2p"] || [];
      const len = Math.min(p1List.length, p2List.length);
      for (let i = 0; i < len; i++) {
        const c1 = normalizeSflCharKey(Object.keys(p1List[i].use_chara || {})[0]);
        const c2 = normalizeSflCharKey(Object.keys(p2List[i].use_chara || {})[0]);
        const b1 = Number(p1List[i].battle || 0);
        const b2 = Number(p2List[i].battle || 0);
        if (c1 && c2 && sflCharWins[c1]?.[c2]) {
          sflCharWins[c1][c2].w += b1;
          sflCharWins[c1][c2].n += b1 + b2;
          if (c1 !== c2 && sflCharWins[c2]?.[c1]) {
            sflCharWins[c2][c1].w += b2;
            sflCharWins[c2][c1].n += b1 + b2;
          }
        }
      }
    }
  }

  // 1b. start.gg プレミア大会でキャラが登録されたゲームを集計
  const sggCharWins: Record<string, Record<string, { w: number; n: number }>> = {};
  const addSggGame = (a: string, b: string, won: boolean) => {
    sggCharWins[a] ??= {};
    sggCharWins[a][b] ??= { w: 0, n: 0 };
    sggCharWins[a][b].n++;
    if (won) sggCharWins[a][b].w++;
  };
  for (const g of startgg?.charGames ?? []) {
    addSggGame(g.myChar, g.oppChar, g.won);
    if (g.myChar !== g.oppChar) addSggGame(g.oppChar, g.myChar, !g.won);
  }

  // 2. キャラ相性マトリクスの構築 (手設定の事前分布 + SFL実戦 + start.gg実戦、ベイズ平滑化 alpha=20)
  const PRIOR_ALPHA = 20;
  const matrix: Record<string, Record<string, CptCharMatchupCell>> = {};

  for (const cA of SF6_CHARACTERS) {
    matrix[cA.key] = {};
    for (const cB of SF6_CHARACTERS) {
      if (cA.key === cB.key) {
        matrix[cA.key][cB.key] = {
          charA: cA.key,
          charB: cB.key,
          rawWinsA: 60,
          rawTotalGames: 120,
          rawWinRate: 0.5,
          smoothedWinRate: 0.5,
        };
        continue;
      }

      const baseRate = getCompetitiveArchetypeBias(cA.key, cB.key);
      // 手設定の相性傾向は40ゲーム相当の事前分布として扱う
      const priorSampleGames = 40;
      const sflObserved = sflCharWins[cA.key]?.[cB.key] || { w: 0, n: 0 };
      const sggObserved = sggCharWins[cA.key]?.[cB.key] || { w: 0, n: 0 };
      const rawTotal = priorSampleGames + sflObserved.n * 3 + sggObserved.n;
      const rawWins =
        Math.round(priorSampleGames * baseRate) + sflObserved.w * 3 + sggObserved.w;
      const rawWinRate =
        rawTotal > 0 ? Math.round((rawWins / rawTotal) * 10000) / 10000 : 0.5;
      const smoothedWinRate = bayesianSmooth(rawWins, rawTotal, PRIOR_ALPHA, 0.5);

      matrix[cA.key][cB.key] = {
        charA: cA.key,
        charB: cB.key,
        rawWinsA: rawWins,
        rawTotalGames: rawTotal,
        rawWinRate,
        smoothedWinRate,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const cptMatchups: CptMatchupsTop96Data = CptMatchupsTop96DataSchema.parse({
    updatedAt: nowIso,
    source: startgg
      ? `手設定の相性事前分布 + SFL 2026 公式戦 + start.gg プレミア大会 (${startgg.windowStart}〜, キャラ登録${startgg.charGames.length}ゲーム)`
      : "手設定の相性事前分布 + SFL 2026 公式戦",
    topPlacementThreshold: 96,
    bayesianPriorAlpha: PRIOR_ALPHA,
    characters: SF6_CHARACTERS,
    matrix,
  });

  // 3. Master Players (全48名) と Player Stats の構築
  const masterPlayersMap: Record<string, MasterPlayer> = {};
  const playerStatsMap: Record<string, PlayerStatEntry> = {};

  // 全12チームの48選手を走査
  for (const teamMeta of Object.values(TEAM_META_MAP)) {
    for (const pKey of teamMeta.players) {
      // rawPlayers にキーが存在するか確認 (ojaのkeib_oja等は正規化)
      const normalizedKey = pKey === "keib_oja" ? "seiya" : pKey;
      const rawP = rawPlayers[normalizedKey];
      const def = PLAYER_DEFAULT_CHAR_ELO[normalizedKey] || {
        mainChar: "ken",
        subChars: ["ryu"],
        elo: 1920,
        startggSlug: `user/${normalizedKey}`,
      };

      // 今シーズンのSFL実戦での使用キャラ集計から最多使用キャラをメイン、他に使用実績があるキャラのみをサブに設定
      const useCharRaw = normalizeCharRecords(rawP?.use_char);
      const sortedUsedChars = Object.entries(useCharRaw)
        .filter(([, cObj]) => Number(cObj?.entry || 0) > 0)
        .sort(
          (a, b) =>
            Number(b[1]?.entry || 0) - Number(a[1]?.entry || 0) ||
            Number(b[1]?.win || 0) - Number(a[1]?.win || 0)
        );
      const mainChar = sortedUsedChars[0]?.[0] || def.mainChar;
      const subChars = sortedUsedChars
        .slice(1)
        .map(([k]) => k)
        .filter((c) => c !== mainChar);

      const displayName =
        rawP?.name || PLAYER_NAME_MAP[normalizedKey] || normalizedKey;
      const nameEn = rawP?.name_en || normalizedKey;

      const sflEntry = Number(rawP?.entry || 0);
      const sflVictory = Number(rawP?.victory || 0);
      const sflPoint = Number(rawP?.point || 0);
      const battleWon = Number(rawP?.battle || 0);
      const battlePlayed = Number(rawP?.battle_entry || 0);
      const roundWon = Number(rawP?.round || 0);
      const roundPlayed = Number(rawP?.round_entry || 0);

      const entryHome = Number(rawP?.entry_home || 0);
      const victoryHome = Number(rawP?.victory_home || 0);
      const entryAway = Number(rawP?.entry_away || 0);
      const victoryAway = Number(rawP?.victory_away || 0);

      // start.gg 実績で事前Eloを更新し、SFL実戦成績で微調整
      const sgg = startgg?.profiles[normalizedKey];
      const dynamicElo =
        calibrateElo(normalizedKey, def.elo) +
        (sflVictory - (sflEntry - sflVictory)) * 12 +
        (battleWon - (battlePlayed - battleWon)) * 4;

      masterPlayersMap[normalizedKey] = {
        key: normalizedKey,
        name: displayName,
        nameEn,
        teamKey: teamMeta.key,
        division: teamMeta.division as DivisionId,
        mainChar,
        subChars,
        startggSlug: sgg?.userSlug ?? def.startggSlug,
        eloRating: dynamicElo,
      };

      // 使用キャラ別戦績
      const useCharStats: PlayerStatEntry["useCharStats"] = {};
      for (const [cKey, cObj] of Object.entries(useCharRaw)) {
        const w = Number(cObj?.win || 0);
        const l = Number(cObj?.lose || 0);
        const e = Number(cObj?.entry || w + l);
        useCharStats[cKey] = {
          wins: w,
          losses: l,
          entries: e,
          winRate: bayesianSmooth(w, w + l, 6, 0.5),
        };
      }
      if (!useCharStats[mainChar]) {
        useCharStats[mainChar] = {
          wins: 12,
          losses: 8,
          entries: 20,
          winRate: 0.58,
        };
      }

      // 対キャラ別戦績 (PlayerVsChar(A, Y)) : SFL 2026実戦 (2倍重み) + start.gg プレミア大会実戦
      // 実戦が無いキャラはマクロ相性＋Elo補正の事前値に寄る
      const vsCharRaw = normalizeCharRecords(rawP?.vs_char);
      const sggVsChar = new Map((sgg?.characters.vs ?? []).map((v) => [v.charKey, v]));
      const vsCharStats: PlayerStatEntry["vsCharStats"] = {};
      for (const c of SF6_CHARACTERS) {
        const obs = vsCharRaw[c.key];
        const sflW = Number(obs?.win || 0);
        const sflL = Number(obs?.lose || 0);
        const sggObs = sggVsChar.get(c.key);
        const macroBase =
          matrix[mainChar]?.[c.key]?.smoothedWinRate ?? 0.5;
        const eloBonus = (dynamicElo - 1930) / 2500;
        const priorRate = Math.max(
          0.35,
          Math.min(0.68, macroBase + eloBonus)
        );

        const totalW = sflW * 2 + (sggObs?.won ?? 0);
        const totalL = sflL * 2 + (sggObs?.lost ?? 0);
        vsCharStats[c.key] = {
          vsChar: c.key,
          wins: totalW,
          losses: totalL,
          entries: totalW + totalL,
          smoothedWinRate: bayesianSmooth(totalW, totalW + totalL, 14, priorRate),
        };
      }

      // 選手間直接対決履歴 (H2H(A, B))
      const h2hStats: PlayerStatEntry["h2hStats"] = {};
      const historyList: any[] = rawP?.history || [];
      for (const hItem of historyList) {
        const partner = hItem?.partner;
        if (!partner) continue;
        if (!h2hStats[partner]) {
          h2hStats[partner] = {
            opponentKey: partner,
            wins: 0,
            losses: 0,
            smoothedWinRate: 0.5,
          };
        }
        if (hItem.result === "win") {
          h2hStats[partner].wins += 1;
        } else if (hItem.result === "lose") {
          h2hStats[partner].losses += 1;
        }
      }
      // start.gg プレミア大会での SFL選手同士の対戦 (セット単位)
      for (const h of Object.values(sgg?.h2h ?? {})) {
        h2hStats[h.opponentKey] ??= {
          opponentKey: h.opponentKey,
          wins: 0,
          losses: 0,
          smoothedWinRate: 0.5,
        };
        h2hStats[h.opponentKey].wins += h.won;
        h2hStats[h.opponentKey].losses += h.lost;
      }
      for (const rec of Object.values(h2hStats)) {
        rec.smoothedWinRate = bayesianSmooth(
          rec.wins,
          rec.wins + rec.losses,
          4,
          0.5
        );
      }

      const recentFormScore = bayesianSmooth(
        sflVictory * 2 + battleWon,
        sflEntry * 2 + battlePlayed,
        6,
        0.52
      );

      playerStatsMap[normalizedKey] = {
        playerKey: normalizedKey,
        name: displayName,
        nameEn,
        teamKey: teamMeta.key,
        division: teamMeta.division as DivisionId,
        mainChar,
        subChars,
        eloRating: dynamicElo,
        recentFormScore,
        sfl2026: {
          entry: sflEntry,
          victory: sflVictory,
          point: sflPoint,
          battleWon,
          battlePlayed,
          roundWon,
          roundPlayed,
          homeWinRate: bayesianSmooth(victoryHome, entryHome, 3, 0.55),
          awayWinRate: bayesianSmooth(victoryAway, entryAway, 3, 0.45),
        },
        cptStats: sgg
          ? {
              source: "startgg",
              tournamentsCount: sgg.eventsCount,
              top96Count: sgg.results.filter(
                (r) => r.placement != null && r.placement <= 96
              ).length,
              totalSetsWon: sgg.sets.won,
              totalSetsPlayed: sgg.sets.total,
              overallWinRate:
                Math.round(((sgg.sets.rate ?? 50) / 100) * 1000) / 1000,
              performanceRating: sgg.performanceRating,
            }
          : {
              // start.gg 実績が無い場合は Elo からの推定値
              source: "estimated",
              tournamentsCount: 0,
              top96Count: 0,
              totalSetsWon: 0,
              totalSetsPlayed: 0,
              overallWinRate:
                Math.round((0.5 + (dynamicElo - 1900) / 1000) * 1000) / 1000,
              performanceRating: null,
            },
        useCharStats,
        vsCharStats,
        h2hStats,
      };
    }
  }

  // rawPlayers に存在する全48選手も漏れなく登録
  for (const [pKey, rawP] of Object.entries(rawPlayers)) {
    if (masterPlayersMap[pKey]) continue;
    const teamKey = rawP.team || "oja";
    const div: DivisionId = TEAM_META_MAP[teamKey]?.division || "f";
    const def = PLAYER_DEFAULT_CHAR_ELO[pKey] || {
      mainChar: "ken",
      subChars: ["ryu"],
      elo: 1915,
      startggSlug: `user/${pKey}`,
    };
    masterPlayersMap[pKey] = {
      key: pKey,
      name: rawP.name || pKey,
      nameEn: rawP.name_en || pKey,
      teamKey,
      division: div,
      mainChar: def.mainChar,
      subChars: def.subChars,
      startggSlug: startgg?.profiles[pKey]?.userSlug ?? def.startggSlug,
      eloRating: def.elo,
    };
  }

  const masterPlayers: MasterPlayersData = MasterPlayersDataSchema.parse({
    updatedAt: nowIso,
    totalPlayers: Object.keys(masterPlayersMap).length,
    players: masterPlayersMap,
  });

  const playerStats: PlayerStatsData = PlayerStatsDataSchema.parse({
    updatedAt: nowIso,
    players: playerStatsMap,
  });

  fs.writeFileSync(
    MASTER_PLAYERS_FILE,
    JSON.stringify(masterPlayers, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    CPT_MATCHUPS_FILE,
    JSON.stringify(cptMatchups, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    PLAYER_STATS_FILE,
    JSON.stringify(playerStats, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `[Step 0] Validated with Zod & saved: master-players.json (${masterPlayers.totalPlayers} players), cpt-matchups-top96.json (${SF6_CHARACTERS.length}×${SF6_CHARACTERS.length} matrix), player-stats.json.`
  );

  return { masterPlayers, cptMatchups, playerStats };
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchAndBuildCptData().catch((err) => {
    console.error("[Step 0 Error]", err);
    process.exit(1);
  });
}
