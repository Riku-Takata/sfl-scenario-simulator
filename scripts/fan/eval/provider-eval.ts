/**
 * 取得元 (Provider) の性能評価 (自宅サーバーで実行)
 *
 *   npx tsx scripts/fan/eval/provider-eval.ts                      # 使える Provider すべて
 *   npx tsx scripts/fan/eval/provider-eval.ts --providers mdfromx --pages 3
 *
 * 本番と同じ収集処理 (runCollection) を、使い捨てのメモリ上 DB と「本文を読まない分類器」で動かし、
 * 呼び出しの速さ・件数・遡れる範囲・エンゲージメントの有無・Provider 間の重なりを測る。
 * 出力は集計値だけ (投稿ID・本文・著者は出さない)。結果は FAN_DATA_DIR/eval/ に保存する。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BUDGET_LIMITS } from "../budget";
import type { Classifier, PostClassification } from "../classifier/types";
import { runCollection, type CollectTarget } from "../collect";
import { authorHmacSecret } from "../providers/author-key";
import { MdfromxProvider } from "../providers/mdfromx";
import type { EphemeralPost, SearchPage, SearchRequest, XSearchProvider } from "../providers/types";
import { FanStore, fanDataDir } from "../store";
import { quantile } from "../../../src/lib/fan/stats";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

/** 評価用のクエリ (PR 4 で src/data/fan-teams.json に移す) */
export const EVAL_TARGETS: CollectTarget[] = [
  {
    teamKey: "cr",
    query: '("Crazy Raccoon" OR クレイジーラクーン) (ストリートファイターリーグ OR #SFリーグ OR SFL OR スト6) lang:ja -is:retweet',
  },
  {
    teamKey: "zeta",
    query: '("ZETA DIVISION" OR ゼータディビジョン) (ストリートファイターリーグ OR #SFリーグ OR SFL OR スト6) lang:ja -is:retweet',
  },
  {
    teamKey: "ibsg",
    query: '(IBUSHIGIN OR イブシギン OR いぶしぎん) (ストリートファイターリーグ OR #SFリーグ OR SFL OR スト6) lang:ja -is:retweet',
  },
];

/** 本文を読まずに、すべて判定不能として返す (取得の評価だけをしたいので) */
class NullClassifier implements Classifier {
  readonly version = "eval:null";
  async classify(posts: readonly EphemeralPost[], ctx: { queryTeamKey: string }) {
    const out = new Map<string, PostClassification[] | null>();
    for (const p of posts) {
      out.set(p.postId, [
        { teamKey: ctx.queryTeamKey, label: "uncertain", supportStrength: 0, confidence: 0, reasonCode: "not_applicable" },
      ]);
    }
    return out;
  }
}

/** 呼び出しの間隔を空ける (mdfromx は匿名で 1分5回) */
class PacedProvider implements XSearchProvider {
  private last = 0;
  readonly latencies: number[] = [];
  readonly errors: string[] = [];

  constructor(private readonly inner: XSearchProvider, private readonly minIntervalMs: number) {}

  quota() {
    return this.inner.quota();
  }

  async searchRecent(request: SearchRequest): Promise<SearchPage> {
    const wait = this.last + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    const started = performance.now();
    try {
      return await this.inner.searchRecent(request);
    } catch (error) {
      this.errors.push((error as Error).name);
      throw error;
    } finally {
      this.latencies.push(Math.round(performance.now() - started));
    }
  }
}

interface TeamStats {
  status: string;
  pages: number;
  posts: number;
  truncated: boolean;
  uniqueAuthors: number;
  duplicatesMerged: number;
  newestAgeHours: number | null;
  oldestAgeHours: number | null;
  /** like / repost / reply がそろっている割合 */
  coreEngagementRate: number | null;
  /** quote まで4つそろっている割合 (指数の熱量 T に使える割合) */
  fullEngagementRate: number | null;
}

interface ProviderReport {
  provider: string;
  calls: number;
  errors: Record<string, number>;
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  postsPerCall: number | null;
  sources: Record<string, number>;
  /** ページ送りが進まず打ち切ったページ (mdfromx の empty_page / repeated_cursor) */
  noProgressPages: number | null;
  teams: Record<string, TeamStats>;
}

function countBy(values: readonly (string | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v ?? "none"] = (out[v ?? "none"] ?? 0) + 1;
  return out;
}

function teamStats(store: FanStore, runId: string, teamKey: string, now: number): TeamStats {
  const run = store.db
    .prepare("SELECT * FROM collection_team_runs WHERE run_id = ? AND team_key = ?")
    .get(runId, teamKey) as Record<string, number> | undefined;
  const posts = store.classifiedPosts(teamKey, 0, now + 1, "eval:null");
  const ages = posts.map((p) => (now - p.createdAt) / 3_600_000);
  const has = (v: number | null | undefined) => v !== null && v !== undefined;
  const core = posts.filter((p) => p.engagement && has(p.engagement.likes) && has(p.engagement.reposts) && has(p.engagement.replies));
  const full = core.filter((p) => has(p.engagement!.quotes));
  return {
    status: "",
    pages: run?.pages_committed ?? 0,
    posts: posts.length,
    truncated: (run?.truncated ?? 1) === 1,
    uniqueAuthors: new Set(posts.map((p) => p.authorKey)).size,
    duplicatesMerged: run?.duplicates_merged ?? 0,
    newestAgeHours: ages.length ? Math.round(Math.min(...ages) * 10) / 10 : null,
    oldestAgeHours: ages.length ? Math.round(Math.max(...ages) * 10) / 10 : null,
    coreEngagementRate: posts.length ? core.length / posts.length : null,
    fullEngagementRate: posts.length ? full.length / posts.length : null,
  };
}

export async function evaluateProvider(
  name: string,
  provider: XSearchProvider,
  options: { pages: number; minIntervalMs: number; targets?: CollectTarget[] }
): Promise<{ report: ProviderReport; postIds: Map<string, Set<string>> }> {
  const targets = options.targets ?? EVAL_TARGETS;
  const paced = new PacedProvider(provider, options.minIntervalMs);
  const store = FanStore.open(":memory:");
  try {
    const summary = await runCollection({
      store,
      provider: paced,
      classifier: new NullClassifier(),
      targets,
      limits: {
        ...DEFAULT_BUDGET_LIMITS,
        stopFiveHourPct: 101,
        stopWeekPct: 101,
        maxPagesPerTeamPerRun: options.pages,
        maxCallsPerRun: options.pages * targets.length,
      },
      log: () => {},
    });
    const now = Date.now();
    const teams: Record<string, TeamStats> = {};
    const postIds = new Map<string, Set<string>>();
    for (const t of targets) {
      teams[t.teamKey] = { ...teamStats(store, summary.runId, t.teamKey, now), status: summary.status };
      postIds.set(t.teamKey, new Set(store.classifiedPosts(t.teamKey, 0, now + 1, "eval:null").map((p) => p.postId)));
    }
    const sorted = [...paced.latencies].sort((a, b) => a - b);
    const totalPosts = Object.values(teams).reduce((s, t) => s + t.posts, 0);
    const sources = provider instanceof MdfromxProvider ? countBy(provider.calls.map((c) => c.source)) : {};
    return {
      report: {
        provider: name,
        calls: summary.calls,
        errors: countBy(paced.errors),
        latencyMs: { p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted.at(-1) ?? null },
        postsPerCall: summary.calls ? Math.round((totalPosts / summary.calls) * 10) / 10 : null,
        sources,
        noProgressPages: provider instanceof MdfromxProvider ? provider.noProgressPages : null,
        teams,
      },
      postIds,
    };
  } finally {
    store.close();
  }
}

/** Provider 間の重なり (チームごとの Jaccard 係数と、片方だけが取れた件数) */
export function overlapReport(a: Map<string, Set<string>>, b: Map<string, Set<string>>) {
  const out: Record<string, { both: number; onlyA: number; onlyB: number; jaccard: number | null }> = {};
  for (const [team, idsA] of a) {
    const idsB = b.get(team) ?? new Set<string>();
    let both = 0;
    for (const id of idsA) if (idsB.has(id)) both++;
    const union = idsA.size + idsB.size - both;
    out[team] = { both, onlyA: idsA.size - both, onlyB: idsB.size - both, jaccard: union ? both / union : null };
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const pages = Number(arg("pages") ?? 3);
  const wanted = (arg("providers") ?? "mdfromx,flovia").split(",");
  const secret = authorHmacSecret();

  const results: { report: ProviderReport; postIds: Map<string, Set<string>> }[] = [];
  if (wanted.includes("mdfromx")) {
    // 匿名の検索枠は 1分5回・アカウント枠は 15分10回。間隔 13秒で 1回の評価 (最大9回) に収める
    results.push(await evaluateProvider("mdfromx", new MdfromxProvider(secret), { pages, minIntervalMs: 13_000 }));
  }
  if (wanted.includes("flovia")) {
    if (!process.env.FLOVIA_KEY) console.error("FLOVIA_KEY が未設定のため Flovia は評価しません");
    else console.error("Flovia Provider は Phase 0 の確認後に追加します");
  }

  const output = {
    evaluatedAt: new Date().toISOString(),
    pagesPerTeam: pages,
    reports: results.map((r) => r.report),
    overlap: results.length >= 2 ? overlapReport(results[0].postIds, results[1].postIds) : null,
  };
  const dir = path.join(fanDataDir(), "eval");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `provider-eval-${output.evaluatedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  console.error(`saved: ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).name, (error as Error).message);
    process.exit(1);
  });
}
