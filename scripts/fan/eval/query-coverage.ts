/**
 * 検索語の違いで件数がどう変わるかを count_recent で比べる (自宅サーバーで実行)
 *
 *   npx tsx scripts/fan/eval/query-coverage.ts --limit 1          # 先頭の1件だけ (消費の確認)
 *   npx tsx scripts/fan/eval/query-coverage.ts --teams cr,zeta    # 指定チームの全パターン
 *   npx tsx scripts/fan/eval/query-coverage.ts --variants candidate --sample-only --sample
 *
 * --sample は mdfromx で1ページ取り、本文を手元で機械的に判定して割合だけを出す (本文は表示しない)。
 *
 * 件数だけを受け取るので、投稿本文・ID・ユーザー名は取得しない。
 * 無料枠が停止ラインに近づいたら途中で止める。結果は FAN_DATA_DIR/eval/ に保存する。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { authorHmacSecret } from "../providers/author-key";
import { MdfromxProvider } from "../providers/mdfromx";
import { FLOVIA_PURPOSE, FLOVIA_REQUEST_TEXT, FloviaMcpSession, toolPayload } from "../providers/flovia-mcp";
import { fanDataDir } from "../store";
import { shapeOf } from "./flovia-probe";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

const STOP_FIVE_HOUR_PCT = 69;
const STOP_WEEK_PCT = 45;

/** 現行の評価クエリのリーグ語 */
const LEAGUE = "(ストリートファイターリーグ OR #SFリーグ OR SFL OR スト6)";
/** 大会タグと通称を足したリーグ語 */
const LEAGUE_WIDE = "(ストリートファイターリーグ OR ストリーグ OR #SFリーグ OR SFL OR #SFL OR #SFL2026 OR SFL2026 OR スト6 OR #スト6 OR SF6)";
/** 一般のスト6の話題を除くため、リーグを指す語だけにしたもの */
const LEAGUE_STRICT = "(ストリートファイターリーグ OR ストリーグ OR #SFリーグ OR SFL)";
const TAIL = "lang:ja -is:retweet";
/** 本文の判定用。リーグを指す語 */
const LEAGUE_PATTERN = /SFL|SFリーグ|ストリートファイターリーグ|ストリーグ/i;
const SAMPLE_INTERVAL_MS = 13_000;

interface TeamTerms {
  names: string;
  shortNames: string;
  players: string;
  winTag: string;
  identity: RegExp;
}

const TEAMS: Record<string, TeamTerms> = {
  cr: {
    names: '("Crazy Raccoon" OR クレイジーラクーン)',
    shortNames: '("Crazy Raccoon" OR クレイジーラクーン OR クレラク OR CR)',
    players: "(どぐら OR Shuto OR ボンちゃん OR かずのこ)",
    winTag: "#CRWIN",
    identity: /Crazy ?Raccoon|クレイジーラクーン|クレラク|どぐら|Shuto|ボンちゃん|かずのこ/i,
  },
  zeta: {
    names: '("ZETA DIVISION" OR ゼータディビジョン)',
    shortNames: '("ZETA DIVISION" OR ゼータディビジョン OR ZETA OR ゼータ)',
    players: "(ももち OR ひぐち OR ヤマグチ OR MenaRD)",
    winTag: "#ZETAWIN",
    identity: /ZETA|ゼータ|ももち|ひぐち|ヤマグチ|MenaRD/i,
  },
  ibsg: {
    names: "(IBUSHIGIN OR イブシギン OR いぶしぎん)",
    shortNames: "(IBUSHIGIN OR イブシギン OR いぶしぎん OR IBSG)",
    players: "(ヤナイ OR ジョニィ OR 鶏めし OR 2BASSA)",
    winTag: "#IBSGWIN",
    identity: /IBUSHIGIN|イブシギン|いぶしぎん|IBSG|ヤナイ|ジョニィ|鶏めし|2BASSA/i,
  },
};

/** 仮説ごとのパターン。current が現行の形 */
const VARIANTS: Record<string, (t: TeamTerms) => string> = {
  current: (t) => `${t.names} ${LEAGUE} ${TAIL}`,
  name_only: (t) => `${t.names} ${TAIL}`,
  wide_league: (t) => `${t.names} ${LEAGUE_WIDE} ${TAIL}`,
  short_names: (t) => `${t.shortNames} ${LEAGUE_WIDE} ${TAIL}`,
  players: (t) => `${t.players} ${LEAGUE_WIDE} ${TAIL}`,
  win_tag: (t) => `${t.winTag} ${TAIL}`,
  // 短い略称は誤検出が多いので外し、チーム名と選手名を束ねてリーグ語で絞る
  candidate: (t) => `(${t.names.slice(1, -1)} OR ${t.players.slice(1, -1)}) ${LEAGUE_STRICT} ${TAIL}`,
};

function findTotal(payload: any): number | null {
  for (const key of ["total_count", "total", "total_tweet_count", "count"]) {
    if (typeof payload?.[key] === "number") return payload[key];
  }
  if (Array.isArray(payload?.counts)) {
    return payload.counts.reduce((sum: number, c: any) => sum + (c.tweet_count ?? c.count ?? 0), 0);
  }
  return null;
}

async function main() {
  const key = process.env.FLOVIA_KEY;
  if (!key) throw new Error("FLOVIA_KEY が .env にありません");
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = Number(arg("limit") ?? Number.POSITIVE_INFINITY);
  const teams = (arg("teams") ?? "cr,zeta,ibsg").split(",");
  const variants = Object.entries(VARIANTS).filter(([name]) => !arg("variants") || arg("variants")!.split(",").includes(name));

  const session = new FloviaMcpSession(key);
  await session.initialize();
  const usage = async () => {
    const s = toolPayload((await session.callTool("flovia_status", {})).message) as any;
    return { fiveHour: s.five_hour.used_pct as number, week: s.week.used_pct as number };
  };

  const startTime = new Date(Date.now() - 7 * 86_400_000 + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const rows: Record<string, unknown>[] = [];
  let before = await usage();
  console.error(`usage before: 5h ${before.fiveHour}% / week ${before.week}%`);
  let done = 0;

  outer: for (const team of teams) {
    for (const [variant, build] of args.includes("--sample-only") ? [] : variants) {
      if (done >= limit) break outer;
      if (before.fiveHour >= STOP_FIVE_HOUR_PCT || before.week >= STOP_WEEK_PCT) {
        console.error(`stopped at the usage limit (${before.fiveHour}% / ${before.week}%)`);
        break outer;
      }
      const r = await session.callTool("flovia_x", {
        action: "count_recent",
        query: build(TEAMS[team]),
        granularity: "day",
        start_time: startTime,
        request_text: FLOVIA_REQUEST_TEXT,
        purpose: FLOVIA_PURPOSE,
        operation_id: `count-${Date.now()}-${team}-${variant}`,
      });
      const payload = toolPayload(r.message) as any;
      const after = await usage();
      const total = findTotal(payload);
      if (done === 0) console.error("shape", JSON.stringify(shapeOf(payload)));
      rows.push({ team, variant, total, ok: payload?.ok ?? null, fiveHourDelta: after.fiveHour - before.fiveHour, weekDelta: after.week - before.week });
      console.log(`${team}\t${variant}\t${total}\tok=${payload?.ok}\t5h+${after.fiveHour - before.fiveHour}\tweek+${after.week - before.week}`);
      before = after;
      done++;
    }
  }

  const samples: Record<string, unknown>[] = [];
  if (args.includes("--sample")) {
    const mdfromx = new MdfromxProvider(authorHmacSecret());
    for (const team of teams) {
      for (const [variant, build] of variants) {
        if (samples.length > 0) await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
        const page = await mdfromx.searchRecent({
          query: build(TEAMS[team]), cursor: null, sinceId: null, startTime, maxResults: 20, operationId: `sample-${team}-${variant}`,
        });
        const texts = page.posts.map((p) => p.text.reveal());
        const row = {
          team, variant,
          posts: texts.length,
          uniqueAuthors: new Set(page.posts.map((p) => p.authorKey)).size,
          mentionsLeague: texts.filter((t) => LEAGUE_PATTERN.test(t)).length,
          mentionsTeamOrPlayer: texts.filter((t) => TEAMS[team].identity.test(t)).length,
          mentionsBoth: texts.filter((t) => LEAGUE_PATTERN.test(t) && TEAMS[team].identity.test(t)).length,
          nextCursor: page.nextCursor !== null,
        };
        samples.push(row);
        console.log(JSON.stringify(row));
      }
    }
  }

  const dir = path.join(fanDataDir(), "eval");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `query-coverage-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ evaluatedAt: new Date().toISOString(), startTime, rows, samples }, null, 2));
  console.error(`saved: ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).name, (error as Error).message);
    process.exit(1);
  });
}
