import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { hashAuthorId } from "../scripts/fan/providers/author-key";
import { FLOVIA_PURPOSE, FLOVIA_REQUEST_TEXT, FloviaProvider } from "../scripts/fan/providers/flovia-mcp";
import {
  ProviderConfigError,
  ProviderCursorError,
  ProviderRateLimitError,
  ProviderUnknownError,
  type SearchRequest,
} from "../scripts/fan/providers/types";

const SECRET = "flovia-test-secret-".padEnd(40, "z");
const CANARY = "FLCANARY77";

const REQUEST: SearchRequest = {
  query: '"Crazy Raccoon" lang:ja',
  cursor: null,
  sinceId: null,
  startTime: "2026-10-23T05:10:00Z",
  maxResults: 20,
  operationId: "op-1",
};

function post(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    text: `作例 ${CANARY}`,
    author_id: `9${id}`,
    created_at: "2026-10-29T01:02:03.000Z",
    lang: "ja",
    referenced_tweets: [],
    public_metrics: { like_count: 30, retweet_count: 2, reply_count: 0, quote_count: 1, bookmark_count: 1, impression_count: 5209 },
    ...extra,
  };
}

function page(posts: unknown[], extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    posts,
    next_cursor: null,
    billed: { posts: posts.length, users: 0, requests: 1 },
    for_user: { five_hour: { used_pct: 6 }, week: { used_pct: 2 } },
    ...extra,
  };
}

type ToolReply = { status?: number; result?: unknown; error?: { code: number; message: string } } | (() => never);

/** initialize は常に成功させ、tools/call だけ指定の応答を返す */
function fakeMcp(reply: ToolReply) {
  const toolCalls: { name: string; arguments: Record<string, any> }[] = [];
  const sessionHeaders: (string | null)[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sessionHeaders.push(new Headers(init.headers).get("mcp-session-id"));
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Mcp-Session-Id": "s1" } });
    if (body.method === "initialize") return json(200, { jsonrpc: "2.0", id: body.id, result: {} });
    if (body.method !== "tools/call") return new Response(null, { status: 202 });
    toolCalls.push(body.params);
    if (typeof reply === "function") reply();
    const r = reply as Exclude<ToolReply, () => never>;
    return json(r.status ?? 200, { jsonrpc: "2.0", id: body.id, ...(r.error ? { error: r.error } : { result: r.result }) });
  }) as unknown as typeof fetch;
  return { fn, toolCalls, sessionHeaders };
}

function ok(payload: unknown) {
  return { result: { structuredContent: payload } };
}

function provider(fn: typeof fetch) {
  return new FloviaProvider("test-key", SECRET, { url: "https://flovia.test/mcp", fetch: fn });
}

test("flovia: the search sends the fixed generic texts, and the team appears only in the query", async () => {
  const fake = fakeMcp(ok(page([])));
  await provider(fake.fn).searchRecent({ ...REQUEST, cursor: "c1", sinceId: "100" });
  const args = fake.toolCalls[0].arguments;
  assert.equal(fake.toolCalls[0].name, "flovia_x");
  assert.equal(args.action, "search_recent");
  assert.equal(args.request_text, FLOVIA_REQUEST_TEXT);
  assert.equal(args.purpose, FLOVIA_PURPOSE);
  assert.equal(args.operation_id, "op-1");
  assert.equal(args.cursor, "c1");
  assert.equal(args.since_id, "100");
  assert.equal(args.start_time, REQUEST.startTime);
  assert.equal(args.sort_order, "recency");
  assert.ok(!JSON.stringify([args.request_text, args.purpose]).includes("Raccoon"));
});

test("flovia: max_results stays within what search_recent accepts", async () => {
  for (const [wanted, sent] of [[5, 10], [20, 20], [500, 100]]) {
    const fake = fakeMcp(ok(page([])));
    await provider(fake.fn).searchRecent({ ...REQUEST, maxResults: wanted });
    assert.equal(fake.toolCalls[0].arguments.max_results, sent);
  }
});

test("flovia: posts are normalized with a hashed author and redacted text", async () => {
  const fake = fakeMcp(ok(page([post("111")], { next_cursor: "next" })));
  const result = await provider(fake.fn).searchRecent(REQUEST);
  const [p] = result.posts;
  assert.equal(p.postId, "111");
  assert.equal(p.createdAt, Date.parse("2026-10-29T01:02:03.000Z"));
  assert.equal(p.authorKey, hashAuthorId(SECRET, "9111"));
  assert.equal(p.lang, "ja");
  assert.deepEqual(p.engagement, { likes: 30, reposts: 2, replies: 0, quotes: 1 });
  assert.equal(p.text.reveal(), `作例 ${CANARY}`);
  assert.equal(result.nextCursor, "next");
  assert.deepEqual(result.quota, { fiveHourUsedPct: 6, weekUsedPct: 2 });
  assert.ok(!JSON.stringify(result).includes(CANARY));
  assert.ok(!inspect(result, { depth: 10 }).includes(CANARY));
  assert.ok(!JSON.stringify(result).includes("9111"));
});

test("flovia: the payload is also read from a text content block", async () => {
  const fake = fakeMcp({ result: { content: [{ type: "text", text: JSON.stringify(page([post("222")])) }] } });
  const result = await provider(fake.fn).searchRecent(REQUEST);
  assert.equal(result.posts.length, 1);
});

test("flovia: retweets and malformed posts are dropped, and missing metrics are not treated as zero", async () => {
  const fake = fakeMcp(ok(page([
    post("1", { referenced_tweets: [{ type: "retweeted" }] }),
    post("not-a-number"),
    post("3", { author_id: undefined }),
    post("4", { created_at: "broken" }),
    post("5", { public_metrics: undefined }),
    post("6", { public_metrics: { like_count: 1, retweet_count: 0, reply_count: 0 } }),
  ])));
  const result = await provider(fake.fn).searchRecent(REQUEST);
  assert.deepEqual(result.posts.map((p) => p.postId), ["5", "6"]);
  assert.equal(result.posts[0].engagement, null);
  assert.equal(result.posts[1].engagement?.quotes, null);
});

test("flovia: usage per call is recorded without post contents", async () => {
  const fake = fakeMcp(ok(page([post("111")])));
  const p = provider(fake.fn);
  await p.searchRecent(REQUEST);
  assert.deepEqual(p.calls, [{ operationId: "op-1", status: 200, returned: 1, billedPosts: 1, fiveHourUsedPct: 6, weekUsedPct: 2 }]);
});

test("flovia: quota reads flovia_status and the session is initialized once", async () => {
  const fake = fakeMcp(ok({ five_hour: { used_pct: 12 }, week: { used_pct: 4 } }));
  const p = provider(fake.fn);
  assert.deepEqual(await p.quota(), { fiveHourUsedPct: 12, weekUsedPct: 4 });
  await p.quota();
  assert.equal(fake.toolCalls.length, 2);
  assert.deepEqual(fake.toolCalls.map((c) => c.name), ["flovia_status", "flovia_status"]);
  assert.equal(fake.sessionHeaders.at(-1), "s1");
});

test("flovia: HTTP failures map to the collector's error classes", async () => {
  const cases: [number, unknown][] = [
    [429, ProviderRateLimitError],
    [400, ProviderConfigError],
    [401, ProviderConfigError],
    [403, ProviderConfigError],
    [500, ProviderUnknownError],
    [503, ProviderUnknownError],
  ];
  for (const [status, expected] of cases) {
    const fake = fakeMcp({ status, result: {} });
    await assert.rejects(provider(fake.fn).searchRecent(REQUEST), expected as never);
  }
});

test("flovia: tool-level failures are classified, and their wording does not reach the error", async () => {
  const failure = (text: string) => ({ result: { isError: true, content: [{ type: "text", text: `${text} ${CANARY}` }] } });
  const cases: [string, unknown][] = [
    ["cursor expired", ProviderCursorError],
    ["free allowance exhausted", ProviderRateLimitError],
    ["rate limit reached", ProviderRateLimitError],
    ["invalid API key", ProviderConfigError],
    ["something unexpected", ProviderUnknownError],
  ];
  for (const [text, expected] of cases) {
    const fake = fakeMcp(failure(text));
    await assert.rejects(provider(fake.fn).searchRecent(REQUEST), (error: Error) => {
      assert.ok(error instanceof (expected as new () => Error));
      assert.ok(!error.message.includes(CANARY));
      return true;
    });
  }
});

test("flovia: an ok: false payload and a JSON-RPC error are failures, not empty pages", async () => {
  await assert.rejects(provider(fakeMcp(ok({ ok: false, error: "upstream" })).fn).searchRecent(REQUEST), ProviderUnknownError);
  await assert.rejects(provider(fakeMcp({ error: { code: -32000, message: "boom" } }).fn).searchRecent(REQUEST), ProviderUnknownError);
});

test("flovia: a network failure has an unknown outcome so the same operation can be resent", async () => {
  const fake = fakeMcp((() => {
    throw new TypeError("fetch failed");
  }) as () => never);
  await assert.rejects(provider(fake.fn).searchRecent(REQUEST), ProviderUnknownError);
});

test("flovia: the search result is not mistaken for a status response", async () => {
  await assert.rejects(provider(fakeMcp(ok({})).fn).quota(), ProviderUnknownError);
});
