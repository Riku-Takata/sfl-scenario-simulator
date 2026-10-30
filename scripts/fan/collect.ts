/**
 * 収集 → メモリ上での分類 → 保存 (設計書 §4.3・§11)
 *
 * - 呼び出しの前に operation_id を pending で保存する。結果が分からない呼び出しは、同じ実行内では
 *   同じ operation_id で最大3回まで、次の実行でも同じリクエストなら同じ operation_id で再送する。
 *   新しい operation_id で再送することはない (二重課金の防止)。
 * - 本文は EphemeralBuffer の中だけで扱い、分類が済んだら捨てる。ログに出すのは件数・状態だけ。
 * - 分類器が使えなくなったら、そのページは保存せずチェックポイントも進めない (次回取り直す)。
 */
import { createHash, randomBytes } from "node:crypto";
import { REASON_CODES, SUPPORT_LABELS } from "../../src/lib/fan/types";
import {
  allowedCalls,
  estimateCostPerCall,
  overBudget,
  type BudgetLimits,
} from "./budget";
import {
  ClassifierUnavailableError,
  type Classifier,
  type PostClassification,
} from "./classifier/types";
import { EphemeralBuffer, normalizedTextHash } from "./ephemeral-buffer";
import {
  ProviderConfigError,
  ProviderCursorError,
  ProviderRateLimitError,
  ProviderUnknownError,
  type EphemeralPost,
  type QuotaStatus,
  type SearchPage,
  type XSearchProvider,
} from "./providers/types";
import type { Checkpoint, FanStore, PageCommit } from "./store";

export interface CollectTarget {
  teamKey: string;
  query: string;
}

/** ログに渡せるのは件数・状態などの値だけ (投稿やエラーオブジェクトは渡さない) */
export type CollectLog = (event: string, fields?: Record<string, string | number | boolean | null>) => void;

export type RunStatus =
  | "ok"
  | "skipped_budget"
  | "budget_reached"
  | "rate_limited"
  | "unknown_outcome"
  | "config_error"
  | "classifier_unavailable";

export interface CollectOptions {
  store: FanStore;
  provider: XSearchProvider;
  classifier: Classifier;
  targets: readonly CollectTarget[];
  limits: BudgetLimits;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: CollectLog;
  runId?: string;
  maxResults?: number;
}

export interface CollectSummary {
  runId: string;
  status: RunStatus;
  calls: number;
  teams: Record<string, { pages: number; newPosts: number; truncated: boolean }>;
  retryAt: string | null;
}

export const MAX_ATTEMPTS_PER_PAGE = 3;
const RETRY_BASE_MS = 2_000;
const SEARCH_WINDOW_MS = 7 * 86_400_000;
/** 7日の境界ちょうどだと拒否されることがあるので少し内側から取る */
const SEARCH_WINDOW_MARGIN_MS = 10 * 60_000;

export function queryHash(query: string): string {
  return createHash("sha256").update(query).digest("hex").slice(0, 16);
}

function requestKey(teamKey: string, qHash: string, cursor: string | null, sinceId: string | null): string {
  return createHash("sha256")
    .update([teamKey, qHash, cursor ?? "", sinceId ?? ""].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
}

function newOperationId(runId: string, teamKey: string, pageNo: number): string {
  return createHash("sha256").update(`${runId}:${teamKey}:${pageNo}`).digest("hex").slice(0, 32);
}

/** X の投稿IDは数値の文字列なので BigInt で比べる */
export function maxPostId(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return BigInt(a) >= BigInt(b) ? a : b;
}

function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function validClassification(c: PostClassification): boolean {
  return (
    (SUPPORT_LABELS as readonly string[]).includes(c.label) &&
    (REASON_CODES as readonly string[]).includes(c.reasonCode) &&
    c.supportStrength >= 0 &&
    c.supportStrength <= 1 &&
    c.confidence >= 0 &&
    c.confidence <= 1
  );
}

class StopRun extends Error {
  constructor(readonly status: RunStatus, readonly retryAt: string | null = null) {
    super(status);
  }
}

export async function runCollection(options: CollectOptions): Promise<CollectSummary> {
  const { store, provider, classifier, limits } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log: CollectLog = options.log ?? ((event, fields) => console.log(JSON.stringify({ event, ...fields })));
  const maxResults = options.maxResults ?? 100;
  const runId = options.runId ?? `${formatUtc(now())}-${randomBytes(3).toString("hex")}`;

  const recovered = store.recoverInterruptedPages(now());
  if (recovered > 0) log("pages_recovered_as_unknown", { count: recovered });

  const quotaBefore = await provider.quota();
  let lastQuota: QuotaStatus = quotaBefore;
  store.startRun(runId, now(), quotaBefore);

  const summary: CollectSummary = { runId, status: "ok", calls: 0, teams: {}, retryAt: null };
  const finish = (status: RunStatus, errorCode: string | null = null) => {
    summary.status = status;
    store.finishRun(runId, {
      finishedAt: now(),
      status,
      callCount: summary.calls,
      quotaAfter: lastQuota,
      errorCode,
      retryAt: summary.retryAt,
    });
    log("run_finished", { runId, status, calls: summary.calls });
    return summary;
  };

  const over = overBudget(quotaBefore, limits);
  if (over) {
    log("budget_skip", { window: over, fiveHourPct: quotaBefore.fiveHourUsedPct, weekPct: quotaBefore.weekUsedPct });
    return finish("skipped_budget", `budget_${over}`);
  }
  const callBudget = allowedCalls(quotaBefore, limits, estimateCostPerCall(store.quotaHistory(20)));
  log("run_started", { runId, callBudget });

  // 同じ文面の連投を実行全体で1件にまとめる (ハッシュはメモリ上だけ)
  const seenTexts = new Set<string>();
  const finishedTeams = new Set<string>();

  /** 1ページ分の呼び出し。結果不明は同じ operation_id で再送する */
  const callWithRetry = async (target: CollectTarget, cp: Checkpoint, operationId: string): Promise<SearchPage> => {
    for (let attempt = 1; ; attempt++) {
      summary.calls++;
      store.countAttempt(operationId);
      try {
        return await provider.searchRecent({
          query: target.query,
          cursor: cp.pendingCursor,
          sinceId: cp.sinceId,
          startTime: formatUtc(now() - SEARCH_WINDOW_MS + SEARCH_WINDOW_MARGIN_MS),
          maxResults,
          operationId,
        });
      } catch (error) {
        if (error instanceof ProviderUnknownError) {
          if (attempt < MAX_ATTEMPTS_PER_PAGE && summary.calls < callBudget) {
            log("retry_same_operation", { teamKey: target.teamKey, attempt });
            await sleep(RETRY_BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random()));
            continue;
          }
          store.markPage(operationId, "unknown", "unknown_outcome", now());
          throw new StopRun("unknown_outcome");
        }
        if (error instanceof ProviderRateLimitError) {
          store.markPage(operationId, "failed", "rate_limited", now());
          throw new StopRun("rate_limited", error.retryAt);
        }
        if (error instanceof ProviderConfigError) {
          store.markPage(operationId, "failed", "config", now());
          throw new StopRun("config_error");
        }
        if (error instanceof ProviderCursorError) {
          store.markPage(operationId, "failed", "cursor_rejected", now());
          throw error;
        }
        store.markPage(operationId, "unknown", "unexpected_error", now());
        throw error;
      }
    }
  };

  /** 重複を除いて分類し、保存する内容を作る (本文は返り値に含めない) */
  const classifyPage = async (
    target: CollectTarget,
    buffer: EphemeralBuffer,
    before: Checkpoint,
    page: SearchPage,
    operationId: string
  ): Promise<PageCommit> => {
    const posts = buffer.posts;
    const known = store.knownPostIds(posts.map((p) => p.postId));
    const fresh: EphemeralPost[] = [];
    let duplicatesMerged = 0;
    for (const post of posts) {
      if (known.has(post.postId)) continue;
      const hash = normalizedTextHash(post.text.reveal());
      if (seenTexts.has(hash)) {
        duplicatesMerged++;
        continue;
      }
      seenTexts.add(hash);
      fresh.push(post);
    }

    const results =
      fresh.length > 0
        ? await classifier.classify(fresh, { queryTeamKey: target.teamKey })
        : new Map<string, PostClassification[] | null>();
    const newPosts: PageCommit["newPosts"] = [];
    let classificationFailures = 0;
    for (const post of fresh) {
      const classifications = results.get(post.postId);
      if (!classifications || !classifications.every(validClassification)) {
        classificationFailures++;
        continue;
      }
      newPosts.push({
        postId: post.postId,
        createdAt: post.createdAt,
        authorKey: post.authorKey,
        engagement: post.engagement,
        classifications,
      });
    }

    // 新しい取得の始まりなら、このページの最新IDが取り切ったときの since_id になる
    let pageNewest: string | null = null;
    for (const post of posts) pageNewest = maxPostId(pageNewest, post.postId);
    const upper = before.pendingCursor !== null ? before.pendingUpper : pageNewest;
    const checkpoint: Checkpoint =
      page.nextCursor !== null
        ? { ...before, pendingCursor: page.nextCursor, pendingUpper: upper }
        : { ...before, sinceId: maxPostId(before.sinceId, upper), pendingCursor: null, pendingUpper: null };

    return {
      operationId,
      runId,
      teamKey: target.teamKey,
      now: now(),
      classifierVersion: classifier.version,
      cursorOut: page.nextCursor,
      itemCount: posts.length,
      checkpoint,
      newPosts,
      knownMetrics: posts.flatMap((p) =>
        known.has(p.postId) && p.engagement ? [{ postId: p.postId, engagement: p.engagement }] : []
      ),
      duplicatesMerged,
      classificationFailures,
    };
  };

  try {
    for (const target of options.targets) {
      const team = { pages: 0, newPosts: 0, truncated: false };
      summary.teams[target.teamKey] = team;
      const qHash = queryHash(target.query);
      let cp = store.getCheckpoint(target.teamKey, qHash);
      let cursorReset = false;
      /** 次のページが無いところまで取り切れた */
      let exhausted = false;

      for (let pageNo = 1; pageNo <= limits.maxPagesPerTeamPerRun; pageNo++) {
        if (summary.calls >= callBudget) {
          log("call_budget_reached", { teamKey: target.teamKey, calls: summary.calls });
          break;
        }

        const rKey = requestKey(target.teamKey, qHash, cp.pendingCursor, cp.sinceId);
        const reused = store.findUnknownOperation(rKey);
        const operationId = reused ?? newOperationId(runId, target.teamKey, pageNo);
        if (reused) log("resend_unknown_operation", { teamKey: target.teamKey, pageNo });
        store.beginPage({
          operationId,
          runId,
          teamKey: target.teamKey,
          pageNo,
          requestKey: rKey,
          cursorIn: cp.pendingCursor,
          sinceIdIn: cp.sinceId,
          now: now(),
        });

        let page: SearchPage;
        try {
          page = await callWithRetry(target, cp, operationId);
        } catch (error) {
          if (error instanceof ProviderCursorError && !cursorReset) {
            // 続きのカーソルが使えない: 取得途中をあきらめ、since_id から新しく取り直す
            cursorReset = true;
            cp = { ...cp, pendingCursor: null, pendingUpper: null };
            store.saveCheckpoint(cp, now());
            log("cursor_reset", { teamKey: target.teamKey });
            pageNo--;
            continue;
          }
          throw error;
        }

        if (page.quota) lastQuota = page.quota;
        const buffer = new EphemeralBuffer(page.posts);
        let commit: PageCommit;
        try {
          commit = await classifyPage(target, buffer, cp, page, operationId);
        } catch (error) {
          if (error instanceof ClassifierUnavailableError) {
            store.markPage(operationId, "failed", "classifier_unavailable", now());
            throw new StopRun("classifier_unavailable");
          }
          store.markPage(operationId, "failed", "classifier_error", now());
          throw error;
        } finally {
          buffer.discard();
        }
        store.commitPage(commit);
        cp = commit.checkpoint;
        team.pages++;
        team.newPosts += commit.newPosts.length;
        log("page_committed", {
          teamKey: target.teamKey,
          pageNo,
          items: commit.itemCount,
          newPosts: commit.newPosts.length,
          duplicates: commit.duplicatesMerged,
          failures: commit.classificationFailures,
        });

        if (cp.pendingCursor === null) {
          exhausted = true;
          break;
        }
        const overAfter = overBudget(lastQuota, limits);
        if (overAfter) {
          log("budget_reached", { window: overAfter });
          throw new StopRun("budget_reached");
        }
      }

      team.truncated = !exhausted;
      store.markTeamTruncated(runId, target.teamKey, team.truncated);
      finishedTeams.add(target.teamKey);
    }
  } catch (error) {
    // 途中で止まったチームと、まだ手を付けていないチームは取得が打ち切られている
    for (const target of options.targets) {
      if (finishedTeams.has(target.teamKey)) continue;
      const team = (summary.teams[target.teamKey] ??= { pages: 0, newPosts: 0, truncated: true });
      team.truncated = true;
      store.markTeamTruncated(runId, target.teamKey, true);
    }
    if (error instanceof StopRun) {
      summary.retryAt = error.retryAt;
      return finish(error.status, error.status);
    }
    finish("unknown_outcome", "unexpected_error");
    throw error;
  } finally {
    seenTexts.clear();
  }
  return finish("ok");
}
