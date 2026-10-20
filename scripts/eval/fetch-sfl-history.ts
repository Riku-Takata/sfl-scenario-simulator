/**
 * SFL 公式戦のボウト履歴を src/data/sfl-bout-history.json に保存 (予測モデルの学習・検証用)
 *
 * - 2026: Step 1 が保存した raw-capcom-seed.json から毎回作り直す
 * - 2025: 確定済みなので未保存のときだけ公式 API から取得
 *
 *   npx tsx scripts/eval/fetch-sfl-history.ts
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractBouts, type RawSchedule, type SflBout } from "../../src/lib/model/history";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const OUTPUT = path.join(DATA_DIR, "sfl-bout-history.json");
const SEED = path.join(DATA_DIR, "raw-capcom-seed.json");

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ja,en-US;q=0.9",
  Referer: "https://sf.esports.capcom.com/sfl2025/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export interface SflBoutHistory {
  updatedAt: string;
  bouts: SflBout[];
}

export async function fetchSflHistory(): Promise<SflBoutHistory> {
  const existing: SflBoutHistory | null = fs.existsSync(OUTPUT)
    ? JSON.parse(fs.readFileSync(OUTPUT, "utf8"))
    : null;

  let past = existing?.bouts.filter((b) => b.season === "2025") ?? [];
  if (past.length === 0) {
    const res = await fetch("https://sf.esports.capcom.com/api/sfl2025/?data=results", { headers: HEADERS });
    if (!res.ok) throw new Error(`SFL 2025 results: HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { schedules: RawSchedule[] }; schedules?: RawSchedule[] };
    past = extractBouts("2025", (json.data ?? json).schedules ?? []);
  }

  const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
  const current = extractBouts("2026", seed?.data?.schedules ?? []);

  const history: SflBoutHistory = { updatedAt: new Date().toISOString(), bouts: [...past, ...current] };
  fs.writeFileSync(
    OUTPUT,
    `{\n "updatedAt": ${JSON.stringify(history.updatedAt)},\n "bouts": [\n${history.bouts
      .map((b) => `  ${JSON.stringify(b)}`)
      .join(",\n")}\n ]\n}\n`,
    "utf8"
  );
  console.log(
    `[history] 2025: ${past.length} bouts / 2026: ${current.length} bouts -> sfl-bout-history.json`
  );
  return history;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchSflHistory().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
