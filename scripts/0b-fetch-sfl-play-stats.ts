/**
 * Step 0b: SFL公式 試合内プレイ統計の取得
 *
 * 公式API `api/sfl20xx/?data=stats` は節ごとに全選手の累積値を CSV 文字列で返す。
 * 列の意味は公式サイト (SvelteKit) の statsTypes 定義から確認したもので、
 * 2025・2026 シーズンで同一の並び。2024 は旧サイトで列定義を確認できないため対象外。
 *
 * - 今シーズン: パイプライン実行ごとに再取得 (出場バトル数は Step 1 の raw-capcom-seed.json)
 * - 過去シーズン: 確定済みのため未取得時のみ取得
 * - 出力: src/data/sfl-play-stats.json (Zod検証)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SflPlayStatsDataSchema } from "../src/lib/schema";
import type {
  SflPlayStatsData,
  SflPlayStatsMetricKey,
  SflPlayStatsSeason,
} from "../src/lib/types";
import {
  SFL_CURRENT_SEASON,
  SFL_PLAY_STATS_COLUMNS,
  SFL_PREVIOUS_SEASON,
} from "../src/lib/sfl/play-style";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const OUTPUT_FILE = path.join(DATA_DIR, "sfl-play-stats.json");
const SEED_FILE = path.join(DATA_DIR, "raw-capcom-seed.json");

const CURRENT_SEASON = SFL_CURRENT_SEASON;
const PAST_SEASONS = [SFL_PREVIOUS_SEASON];

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  Referer: "https://sf.esports.capcom.com/sfl2026/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

interface RawStatsSection {
  title: string;
  slug: string;
  stats: { stats?: string } | null;
}

interface RawBoutPlayer {
  player: string;
  battle: number;
}

interface RawSchedule {
  post_name: string;
  fields?: {
    section?: Record<string, { result?: "" | { "1p"?: RawBoutPlayer[]; "2p"?: RawBoutPlayer[] } }>;
  };
}

interface RawSeasonResponse {
  stats: RawStatsSection[] | Record<string, RawStatsSection>;
  schedules?: RawSchedule[];
}

async function fetchSeason(season: string): Promise<RawSeasonResponse> {
  const res = await fetch(`https://sf.esports.capcom.com/api/sfl${season}/?data=stats`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`SFL ${season} stats: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: RawSeasonResponse } & RawSeasonResponse;
  return json.data ?? json;
}

/** CSV 1行 = 1選手。空行・列不足の行は除外 */
export function parseStatsCsv(
  csv: string
): Record<string, { name: string; metrics: Record<SflPlayStatsMetricKey, number> }> {
  const out: Record<string, { name: string; metrics: Record<SflPlayStatsMetricKey, number> }> = {};
  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 2 + SFL_PLAY_STATS_COLUMNS.length || !cols[0]) continue;
    const metrics = {} as Record<SflPlayStatsMetricKey, number>;
    SFL_PLAY_STATS_COLUMNS.forEach((key, i) => {
      metrics[key] = Number.parseInt(cols[2 + i], 10) || 0;
    });
    out[cols[0]] = { name: cols[1], metrics };
  }
  return out;
}

/**
 * 集計時点の節までに各選手が出場したバトル数を試合結果から数える
 * (stats の更新が試合結果より遅れても、分母と分子の時点を揃えるため)
 */
export function countBattlesUpTo(
  schedules: RawSchedule[],
  includedSlugs: Set<string>
): Record<string, number> {
  const battles: Record<string, number> = {};
  for (const sched of schedules) {
    if (!includedSlugs.has(sched.post_name)) continue;
    for (const slot of Object.values(sched.fields?.section ?? {})) {
      const result = slot && typeof slot === "object" ? slot.result : undefined;
      if (!result || typeof result === "string") continue;
      const p1 = result["1p"] ?? [];
      const p2 = result["2p"] ?? [];
      for (let i = 0; i < Math.min(p1.length, p2.length); i++) {
        const played = Number(p1[i].battle || 0) + Number(p2[i].battle || 0);
        battles[p1[i].player] = (battles[p1[i].player] ?? 0) + played;
        battles[p2[i].player] = (battles[p2[i].player] ?? 0) + played;
      }
    }
  }
  return battles;
}

export function buildSeason(
  raw: RawSeasonResponse,
  schedules: RawSchedule[]
): SflPlayStatsSeason | null {
  const sections = Array.isArray(raw.stats) ? raw.stats : Object.values(raw.stats ?? {});
  // 累積値なので、選手行が入っている最後の節を採用
  let latestIndex = -1;
  sections.forEach((s, i) => {
    if (Object.keys(parseStatsCsv(s.stats?.stats ?? "")).length > 0) latestIndex = i;
  });
  if (latestIndex < 0) return null;
  const latest = sections[latestIndex];
  const battlesByPlayer = countBattlesUpTo(
    schedules,
    new Set(sections.slice(0, latestIndex + 1).map((s) => s.slug))
  );
  const rows = parseStatsCsv(latest.stats?.stats ?? "");
  const players: SflPlayStatsSeason["players"] = {};
  for (const [key, row] of Object.entries(rows)) {
    players[key] = { name: row.name, battles: battlesByPlayer[key] ?? 0, metrics: row.metrics };
  }
  return { asOfSection: latest.slug, asOfTitle: latest.title, players };
}

export async function fetchSflPlayStats(): Promise<SflPlayStatsData> {
  const existing: SflPlayStatsData | null = fs.existsSync(OUTPUT_FILE)
    ? SflPlayStatsDataSchema.parse(JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8")))
    : null;
  const seasons: SflPlayStatsData["seasons"] = { ...(existing?.seasons ?? {}) };

  // 今シーズンの試合結果は Step 1 が保存した公式データを使う (stats 応答には含まれない)
  const seed = fs.existsSync(SEED_FILE)
    ? JSON.parse(fs.readFileSync(SEED_FILE, "utf8"))
    : null;
  const current = buildSeason(
    await fetchSeason(CURRENT_SEASON),
    seed?.data?.schedules ?? []
  );
  if (current) seasons[CURRENT_SEASON] = current;

  for (const season of PAST_SEASONS) {
    if (seasons[season]) continue;
    const raw = await fetchSeason(season);
    const built = buildSeason(raw, raw.schedules ?? []);
    if (built) seasons[season] = built;
  }

  const data = SflPlayStatsDataSchema.parse({
    updatedAt: new Date().toISOString(),
    source: "SFL公式 api/sfl20xx/?data=stats (節ごとの累積値)",
    seasons,
  });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 1) + "\n", "utf8");
  console.log(
    `[Step 0b] Saved sfl-play-stats.json (${Object.entries(seasons)
      .map(([s, v]) => `${s}: ${Object.keys(v.players).length} players @ ${v.asOfSection}`)
      .join(" / ")}).`
  );
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchSflPlayStats().catch((err) => {
    console.error("[Step 0b Error]", err);
    process.exit(1);
  });
}
