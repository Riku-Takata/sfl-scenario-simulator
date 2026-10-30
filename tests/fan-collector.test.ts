import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  allowedCalls,
  DEFAULT_BUDGET_LIMITS,
  estimateCostPerCall,
  overBudget,
} from "../scripts/fan/budget";
import { MockClassifier } from "../scripts/fan/classifier/mock";
import { maxPostId, queryHash, runCollection, type CollectOptions } from "../scripts/fan/collect";
import { EphemeralBuffer, normalizedTextHash } from "../scripts/fan/ephemeral-buffer";
import { acquireLock, LOCK_STALE_MS } from "../scripts/fan/lock";
import { MockXProvider, type MockPostInput, type MockStep } from "../scripts/fan/providers/mock";
import { SecretText } from "../scripts/fan/providers/types";
import { FanStore } from "../scripts/fan/store";

const SECRET = "test-secret-".padEnd(40, "x");
const QUERY = '("Crazy Raccoon") ("ストリートファイターリーグ") lang:ja -is:retweet';
const TARGET = { teamKey: "cr", query: QUERY };
const NOW = Date.UTC(2026, 9, 30, 5, 0, 0);
const HOUR = 3_600_000;

let nextId = 1_000_000;
function mp(text: string, overrides: Partial<MockPostInput> = {}): MockPostInput {
  nextId++;
  return {
    postId: String(nextId),
    createdAt: NOW - 24 * HOUR + nextId,
    text: `${text} #${nextId}`,
    rawAuthorId: `author-${nextId}`,
    ...overrides,
  };
}

function setup(steps: MockStep[], extra: Partial<CollectOptions> = {}) {
  const store = FanStore.open(":memory:");
  const provider = new MockXProvider(steps, SECRET);
  const classifier = new MockClassifier();
  const logs: { event: string; fields?: Record<string, unknown> }[] = [];
  const options: CollectOptions = {
    store,
    provider,
    classifier,
    targets: [TARGET],
    limits: DEFAULT_BUDGET_LIMITS,
    now: () => NOW,
    sleep: async () => {},
    log: (event, fields) => logs.push({ event, fields }),
    ...extra,
  };
  return { store, provider, classifier, logs, options };
}

function pageRow(store: FanStore, operationId: string) {
  return store.db.prepare("SELECT * FROM collection_pages WHERE operation_id = ?").get(operationId) as
    | Record<string, unknown>
    | undefined;
}

function teamRun(store: FanStore, runId: string, teamKey = "cr") {
  return store.db
    .prepare("SELECT * FROM collection_team_runs WHERE run_id = ? AND team_key = ?")
    .get(runId, teamKey) as Record<string, number>;
}

test("取り切れたら since_id を最新IDへ進め、分類結果を保存する", async () => {
  const p1 = [mp("今日も頑張れ"), mp("昨日の試合観た")];
  const p2 = [mp("最悪の采配")];
  const { store, options } = setup([
    { page: p1, nextCursor: "c1" },
    { page: p2, nextCursor: null },
  ]);
  const summary = await runCollection(options);
  assert.equal(summary.status, "ok");
  assert.deepEqual(summary.teams.cr, { pages: 2, newPosts: 3, truncated: false });

  const cp = store.getCheckpoint("cr", queryHash(QUERY));
  assert.equal(cp.sinceId, p1.map((p) => p.postId).reduce((a, b) => maxPostId(a, b)!));
  assert.equal(cp.pendingCursor, null);

  const posts = store.classifiedPosts("cr", 0, NOW, "mock:keyword:1");
  assert.deepEqual(posts.map((p) => p.label).sort(), ["criticism", "neutral", "support"]);
  assert.ok(posts.every((p) => /^[0-9a-f]{32}$/.test(p.authorKey)));
});

test("ページ上限で打ち切ったら続きのカーソルを残し、次の実行で続きから取る", async () => {
  const pages = [0, 1, 2].map(() => [mp("頑張れ")]);
  const { store, provider, options } = setup([
    { page: pages[0], nextCursor: "c1" },
    { page: pages[1], nextCursor: "c2" },
    { page: pages[2], nextCursor: "c3" },
    { page: [mp("応援してる")], nextCursor: null },
  ]);
  const first = await runCollection({ ...options, runId: "run-1" });
  assert.equal(first.teams.cr.truncated, true);
  assert.equal(teamRun(store, "run-1").truncated, 1);
  let cp = store.getCheckpoint("cr", queryHash(QUERY));
  assert.equal(cp.sinceId, null);
  assert.equal(cp.pendingCursor, "c3");
  assert.equal(cp.pendingUpper, pages[0][0].postId);

  const second = await runCollection({ ...options, runId: "run-2" });
  assert.equal(second.teams.cr.truncated, false);
  assert.equal(provider.requests.at(-1)!.cursor, "c3");
  cp = store.getCheckpoint("cr", queryHash(QUERY));
  assert.equal(cp.sinceId, pages[0][0].postId);
  assert.equal(cp.pendingCursor, null);
});

test("結果不明の呼び出しは同じ operation_id で再送し、課金は1回", async () => {
  const { store, provider, options } = setup([
    { error: "unknown", executed: true },
    { page: [mp("頑張れ")], nextCursor: null },
  ]);
  const summary = await runCollection(options);
  assert.equal(summary.status, "ok");
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0].operationId, provider.requests[1].operationId);
  assert.equal(provider.charged.size, 1);
  assert.equal(pageRow(store, provider.requests[0].operationId)!.status, "committed");
  assert.equal(pageRow(store, provider.requests[0].operationId)!.attempts, 2);
});

test("3回とも結果不明なら unknown で止め、次の実行でも同じ operation_id を使う", async () => {
  const { store, provider, options } = setup([
    { error: "unknown" },
    { error: "unknown" },
    { error: "unknown" },
    { page: [mp("頑張れ")], nextCursor: null },
  ]);
  const first = await runCollection({ ...options, runId: "run-1" });
  assert.equal(first.status, "unknown_outcome");
  assert.equal(first.teams.cr.truncated, true);
  const opId = provider.requests[0].operationId;
  assert.ok(provider.requests.slice(0, 3).every((r) => r.operationId === opId));
  assert.equal(pageRow(store, opId)!.status, "unknown");

  const second = await runCollection({ ...options, runId: "run-2" });
  assert.equal(second.status, "ok");
  assert.equal(provider.requests[3].operationId, opId);
  assert.equal(pageRow(store, opId)!.status, "committed");
});

test("前回 pending のまま止まったページは結果不明として同じ operation_id で再送する", async () => {
  const { store, provider, options } = setup([{ page: [mp("頑張れ")], nextCursor: null }]);
  await runCollection({ ...options, runId: "crashed", targets: [] });
  // 呼び出し中にプロセスが落ちた状態を作る
  const { createHash } = await import("node:crypto");
  const rKey = createHash("sha256")
    .update(["cr", queryHash(QUERY), "", ""].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
  store.beginPage({
    operationId: "op-crashed",
    runId: "crashed",
    teamKey: "cr",
    pageNo: 1,
    requestKey: rKey,
    cursorIn: null,
    sinceIdIn: null,
    now: NOW,
  });
  const summary = await runCollection({ ...options, runId: "run-2" });
  assert.equal(summary.status, "ok");
  assert.equal(provider.requests[0].operationId, "op-crashed");
});

test("429 は再送せずに実行を止め、残りのチームは取得制限扱い", async () => {
  const { store, provider, options } = setup([{ error: "rate_limit", retryAt: "2026-10-30T10:00:00Z" }], {
    targets: [TARGET, { teamKey: "zeta", query: "zeta" }],
  });
  const summary = await runCollection({ ...options, runId: "run-1" });
  assert.equal(summary.status, "rate_limited");
  assert.equal(summary.retryAt, "2026-10-30T10:00:00Z");
  assert.equal(provider.requests.length, 1);
  assert.equal(summary.teams.zeta.truncated, true);
  assert.equal(teamRun(store, "run-1", "zeta").truncated, 1);
  assert.equal(store.getCheckpoint("cr", queryHash(QUERY)).sinceId, null);
});

test("401/403 は再試行せずに config_error で止める", async () => {
  const { provider, options } = setup([{ error: "config" }]);
  const summary = await runCollection(options);
  assert.equal(summary.status, "config_error");
  assert.equal(provider.requests.length, 1);
});

test("カーソルが拒否されたら取得途中を捨て、since_id から取り直す", async () => {
  const { store, provider, options } = setup([
    { page: [mp("頑張れ")], nextCursor: "c1" },
    { page: [mp("頑張れ")], nextCursor: "c2" },
    { page: [mp("頑張れ")], nextCursor: "c3" },
    { error: "cursor" },
    { page: [mp("応援")], nextCursor: null },
  ]);
  await runCollection({ ...options, runId: "run-1" });
  const summary = await runCollection({ ...options, runId: "run-2" });
  assert.equal(summary.status, "ok");
  assert.equal(provider.requests[3].cursor, "c3");
  assert.equal(provider.requests[4].cursor, null);
  assert.equal(store.getCheckpoint("cr", queryHash(QUERY)).pendingCursor, null);
});

test("分類器が使えなくなったら、そのページは保存せずチェックポイントも進めない", async () => {
  const page = [mp("頑張れ")];
  const { store, provider, options } = setup([{ page, nextCursor: null }], {
    classifier: new MockClassifier({ unavailableFromCall: 1 }),
  });
  const summary = await runCollection({ ...options, runId: "run-1" });
  assert.equal(summary.status, "classifier_unavailable");
  assert.equal(pageRow(store, provider.requests[0].operationId)!.status, "failed");
  assert.equal(store.knownPostIds([page[0].postId]).size, 0);
  assert.equal(store.getCheckpoint("cr", queryHash(QUERY)).sinceId, null);
});

test("分類に失敗した投稿は保存せず件数だけ数える", async () => {
  const page = [mp("頑張れ"), mp("頑張れ2"), mp("観た")];
  const { store, options } = setup([{ page, nextCursor: null }], {
    classifier: new MockClassifier({ failPostIds: new Set([page[1].postId]) }),
  });
  await runCollection({ ...options, runId: "run-1" });
  assert.equal(teamRun(store, "run-1").classification_failures, 1);
  assert.equal(teamRun(store, "run-1").posts_new, 2);
  assert.equal(store.knownPostIds(page.map((p) => p.postId)).size, 2);
});

test("保存済みの投稿は分類し直さずメトリクスだけ追加し、同じ文面の連投は1件にまとめる", async () => {
  const original = mp("頑張れ", { engagement: { likes: 1, reposts: 0, replies: 0, quotes: 0 } });
  const copyA = mp("x", { text: "同じ文面です 頑張れ https://t.co/aaa" });
  const copyB = mp("x", { text: "同じ文面です　頑張れ https://t.co/bbb" });
  const { store, classifier, options } = setup([
    { page: [original], nextCursor: null },
    { page: [{ ...original, engagement: { likes: 50, reposts: 3, replies: 1, quotes: 0 } }, copyA, copyB], nextCursor: null },
  ]);
  let t = NOW;
  await runCollection({ ...options, runId: "run-1", now: () => t });
  t += 12 * HOUR;
  await runCollection({ ...options, runId: "run-2", now: () => t });

  assert.equal(classifier.seenTexts.filter((s) => s.startsWith("頑張れ")).length, 1);
  assert.equal(teamRun(store, "run-2").duplicates_merged, 1);
  const [stored] = store.classifiedPosts("cr", 0, NOW, "mock:keyword:1").filter((p) => p.postId === original.postId);
  assert.equal(stored.engagement!.likes, 50);
  assert.ok(stored.engagementAgeHours! > 24);
});

test("空のページでも committed になり since_id は変わらない", async () => {
  const { store, options } = setup([{ page: [], nextCursor: null }]);
  const summary = await runCollection(options);
  assert.equal(summary.status, "ok");
  assert.equal(summary.teams.cr.truncated, false);
  assert.equal(store.getCheckpoint("cr", queryHash(QUERY)).sinceId, null);
});

test("予算: 開始時に停止ラインを超えていたら呼ばない、途中で超えたら止める", async () => {
  const over = setup([]);
  const overProvider = new MockXProvider([], SECRET, { fiveHourUsedPct: 70, weekUsedPct: 0 });
  const skipped = await runCollection({ ...over.options, provider: overProvider });
  assert.equal(skipped.status, "skipped_budget");
  assert.equal(overProvider.requests.length, 0);

  const mid = setup([
    { page: [mp("頑張れ")], nextCursor: "c1", quota: { fiveHourUsedPct: 10, weekUsedPct: 61 } },
    { page: [mp("頑張れ")], nextCursor: null },
  ]);
  const reached = await runCollection(mid.options);
  assert.equal(reached.status, "budget_reached");
  assert.equal(mid.provider.requests.length, 1);
  assert.equal(reached.teams.cr.truncated, true);
});

test("予算: 1呼び出しあたりの消費を実績から見積もり、使える回数を絞る", () => {
  const cost = estimateCostPerCall([
    { calls: 10, fiveHourDelta: 20, weekDelta: 5 },
    { calls: 5, fiveHourDelta: -40, weekDelta: 1 }, // 窓のリセットをまたいだ実行は除く
  ]);
  assert.deepEqual(cost, { fiveHourPct: 2, weekPct: 0.5 });
  assert.equal(estimateCostPerCall([]), null);
  assert.equal(allowedCalls({ fiveHourUsedPct: 60, weekUsedPct: 10 }, DEFAULT_BUDGET_LIMITS, cost), 5);
  assert.equal(allowedCalls({ fiveHourUsedPct: 0, weekUsedPct: 0 }, DEFAULT_BUDGET_LIMITS, null), 12);
  assert.equal(overBudget({ fiveHourUsedPct: 10, weekUsedPct: 60 }, DEFAULT_BUDGET_LIMITS), "week");
});

test("呼び出し回数の上限に達したら、残りのチームは取得制限扱い", async () => {
  const { options } = setup(
    [
      { page: [mp("頑張れ")], nextCursor: "c1" },
      { page: [mp("頑張れ")], nextCursor: null },
    ],
    {
      targets: [TARGET, { teamKey: "zeta", query: "zeta" }],
      limits: { ...DEFAULT_BUDGET_LIMITS, maxCallsPerRun: 2 },
    }
  );
  const summary = await runCollection(options);
  assert.equal(summary.status, "ok");
  assert.equal(summary.teams.cr.truncated, false);
  assert.equal(summary.teams.zeta.truncated, true);
});

test("保持期限を過ぎた投稿は分類・メトリクスごと削除する", async () => {
  const old = mp("頑張れ", {
    createdAt: NOW - 40 * 86_400_000,
    engagement: { likes: 1, reposts: 0, replies: 0, quotes: 0 },
  });
  const { store, options } = setup([{ page: [old, mp("頑張れ新")], nextCursor: null }]);
  await runCollection(options);
  const deleted = store.deleteExpired(NOW);
  assert.equal(deleted.posts, 1);
  const count = (table: string) =>
    (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE post_id = ?`).get(old.postId) as { n: number }).n;
  assert.equal(count("post_team_classifications"), 0);
  assert.equal(count("post_metrics_snapshots"), 0);
});

test("ロック: 取得中は2つ目を取れず、古いロックは取り直す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fan-lock-"));
  try {
    const release = acquireLock(dir, NOW);
    assert.ok(release);
    assert.equal(acquireLock(dir, NOW), null);
    release!();
    assert.ok(acquireLock(dir, NOW));
    const stale = new Date(NOW - LOCK_STALE_MS - 1000);
    fs.utimesSync(path.join(dir, "collect.lock"), stale, stale);
    assert.ok(acquireLock(dir, NOW));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("EphemeralBuffer: discard 後は読めない、本文ハッシュは URL・空白・全角の違いを無視する", () => {
  const buffer = new EphemeralBuffer([
    { postId: "1", createdAt: 0, text: new SecretText("x"), authorKey: "a", lang: null, engagement: null },
  ]);
  assert.equal(buffer.posts.length, 1);
  buffer.discard();
  assert.equal(buffer.discarded, true);
  assert.throws(() => buffer.posts);
  assert.equal(
    normalizedTextHash("頑張れ ＣＲ https://t.co/a"),
    normalizedTextHash("頑張れ　cr   https://t.co/b")
  );
});
