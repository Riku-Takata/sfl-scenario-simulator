/**
 * 本文・生の著者IDが漏れないことの検査 (設計書 §12.1)
 *
 * 目印の文字列を入れた作例テキストと著者IDを、失敗を含むいくつかの経路で流し、
 * SQLite ファイル・ログ・例外・文字列化した投稿のどこにも目印が残らないことを確かめる。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { DEFAULT_BUDGET_LIMITS } from "../scripts/fan/budget";
import { MockClassifier } from "../scripts/fan/classifier/mock";
import { runCollection } from "../scripts/fan/collect";
import { MockXProvider, type MockPostInput } from "../scripts/fan/providers/mock";
import { SecretText } from "../scripts/fan/providers/types";
import { FanStore } from "../scripts/fan/store";

const TEXT_CANARY = "CANARYTEXT91c4";
const AUTHOR_CANARY = "CANARYAUTHOR77";
const SECRET = "leak-test-secret-".padEnd(40, "y");
const NOW = Date.UTC(2026, 9, 30, 5, 0, 0);

let id = 5_000_000;
function canaryPost(body: string): MockPostInput {
  id++;
  return {
    postId: String(id),
    createdAt: NOW - 3_600_000,
    text: `${body} ${TEXT_CANARY}-${id}`,
    rawAuthorId: `${AUTHOR_CANARY}-${id}`,
    engagement: { likes: 3, reposts: 1, replies: 0, quotes: 0 },
  };
}

function assertNoCanary(label: string, content: string) {
  assert.ok(!content.includes(TEXT_CANARY), `${label} に本文の目印が含まれる`);
  assert.ok(!content.includes(AUTHOR_CANARY), `${label} に生の著者IDの目印が含まれる`);
}

test("SecretText と投稿は文字列化・JSON化・inspect で本文を出さない", async () => {
  const provider = new MockXProvider([{ page: [canaryPost("頑張れ")], nextCursor: null }], SECRET);
  const page = await provider.searchRecent({
    query: "q",
    cursor: null,
    sinceId: null,
    startTime: "2026-10-24T00:00:00Z",
    maxResults: 10,
    operationId: "op",
  });
  const post = page.posts[0];
  assert.ok(post.text.reveal().includes(TEXT_CANARY), "目印が実際に流れていること");
  assertNoCanary("String()", `${post.text}`);
  assertNoCanary("JSON.stringify", JSON.stringify(page));
  assertNoCanary("inspect", inspect(page, { depth: 10 }));
  assertNoCanary("console 書式", inspect(new SecretText(TEXT_CANARY)));
});

test("収集の全経路で、DBファイル・ログ・例外に本文と生の著者IDが残らない", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fan-leak-"));
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map((a) => inspect(a)).join(" "));
  console.error = console.log;
  const classifier = new MockClassifier({ failPostIds: new Set([String(id + 3)]) });
  try {
    const store = FanStore.open(path.join(dir, "fan.sqlite"));
    const provider = new MockXProvider(
      [
        { page: [canaryPost("今日も頑張れ"), canaryPost("観た"), canaryPost("最悪")], nextCursor: "c1" },
        { error: "unknown", executed: true },
        { page: [canaryPost("応援"), canaryPost("関係ない話")], nextCursor: "c2" },
        { page: [canaryPost("負けたけど次がある")], nextCursor: null },
        { error: "rate_limit" },
      ],
      SECRET
    );
    const base = {
      store,
      provider,
      classifier,
      limits: DEFAULT_BUDGET_LIMITS,
      now: () => NOW,
      sleep: async () => {},
      log: (event: string, fields?: Record<string, string | number | boolean | null>) =>
        logs.push(JSON.stringify({ event, ...fields })),
    };
    await runCollection({ ...base, targets: [{ teamKey: "cr", query: "q" }] });
    await runCollection({ ...base, targets: [{ teamKey: "zeta", query: "z" }] });
    // 分類器が例外を投げる経路
    const failing = await runCollection({
      ...base,
      provider: new MockXProvider([{ page: [canaryPost("頑張れ")], nextCursor: null }], SECRET),
      classifier: new MockClassifier({ unavailableFromCall: 1 }),
      targets: [{ teamKey: "ibsg", query: "i" }],
    });
    assert.equal(failing.status, "classifier_unavailable");
    store.close();

    assert.ok(classifier.seenTexts.some((t) => t.includes(TEXT_CANARY)), "分類器には本文が届いている");
    for (const file of fs.readdirSync(dir)) {
      assertNoCanary(file, fs.readFileSync(path.join(dir, file)).toString("latin1"));
      assertNoCanary(file, fs.readFileSync(path.join(dir, file)).toString("utf8"));
    }
    assertNoCanary("logs", logs.join("\n"));
  } finally {
    console.log = originalLog;
    console.error = originalError;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("例外メッセージ・スタックに本文が入らない", async () => {
  const store = FanStore.open(":memory:");
  const explode = {
    version: "explode:1",
    async classify(): Promise<never> {
      throw new Error("classifier crashed");
    },
  };
  const provider = new MockXProvider([{ page: [canaryPost("頑張れ")], nextCursor: null }], SECRET);
  await assert.rejects(
    runCollection({
      store,
      provider,
      classifier: explode,
      targets: [{ teamKey: "cr", query: "q" }],
      limits: DEFAULT_BUDGET_LIMITS,
      now: () => NOW,
      log: () => {},
    }),
    (error: Error) => {
      assertNoCanary("error", `${error.message}\n${error.stack}\n${inspect(error)}`);
      return true;
    }
  );
});
