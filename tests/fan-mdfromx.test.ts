import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { hashAuthorId } from "../scripts/fan/providers/author-key";
import { MdfromxProvider, parseRateLimit, parseRateLimitPolicy } from "../scripts/fan/providers/mdfromx";
import {
  ProviderConfigError,
  ProviderRateLimitError,
  ProviderUnknownError,
  type SearchRequest,
} from "../scripts/fan/providers/types";

const SECRET = "mdfromx-test-secret-".padEnd(40, "z");
const CANARY = "MDCANARY55";

const REQUEST: SearchRequest = {
  query: '"Crazy Raccoon" lang:ja',
  cursor: null,
  sinceId: null,
  startTime: "2026-10-23T05:10:00Z",
  maxResults: 20,
  operationId: "op",
};

function post(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: "status",
    text: `作例 ${CANARY}`,
    created_timestamp: 1_793_000_000,
    author: { id: `9${id}`, screen_name: `${CANARY}_user` },
    likes: 3,
    retweets: 1,
    replies: 0,
    ...extra,
  };
}

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const requested: URL[] = [];
  const fn = (async (url: URL) => {
    requested.push(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "x-source": "xsearch",
        "x-cache": "MISS",
        ratelimit: '"search-ip";r=4;t=45, "account-ip";r=7;t=525',
        "ratelimit-policy": '"search-ip";q=5;w=60, "account-ip";q=10;w=900',
        ...headers,
      },
    });
  }) as unknown as typeof fetch;
  return { fn, requested };
}

test("parseRateLimit / parseRateLimitPolicy: 名前ごとの残り回数と上限", () => {
  assert.deepEqual(parseRateLimit('"api-ip";r=599;t=46, "account-ip";r=9;t=525'), { "api-ip": 599, "account-ip": 9 });
  assert.deepEqual(parseRateLimitPolicy('"account-ip";q=10;w=900'), { "account-ip": 10 });
  assert.deepEqual(parseRateLimit(null), {});
});

test("検索結果を EphemeralPost に変換し、著者IDは HMAC 化、欠けた指標は null", async () => {
  const { fn, requested } = fakeFetch(200, {
    posts: [post("200"), post("199", { quotes: 2, lang: "ja" }), post("198", { reposted_by: { id: "1" } })],
    nextCursor: "next",
    source: "xsearch",
  });
  const provider = new MdfromxProvider(SECRET, { fetch: fn });
  const page = await provider.searchRecent(REQUEST);

  const params = requested[0].searchParams;
  assert.equal(params.get("require_live"), "true");
  assert.equal(params.get("full"), "true");
  assert.equal(params.get("since"), REQUEST.startTime);
  assert.equal(page.posts.length, 2, "リポストは除く");
  assert.equal(page.posts[0].authorKey, hashAuthorId(SECRET, "9200"));
  assert.equal(page.posts[0].createdAt, 1_793_000_000_000);
  assert.deepEqual(page.posts[0].engagement, { likes: 3, reposts: 1, replies: 0, quotes: null });
  assert.equal(page.posts[1].engagement!.quotes, 2);
  assert.equal(page.nextCursor, "next");
  assert.equal(page.quota!.fiveHourUsedPct, 30);
  assert.equal(provider.calls[0].source, "xsearch");
  assert.ok(!inspect(page, { depth: 10 }).includes(CANARY));
});

test("since_id 以下の投稿は除き、既知の範囲に届いたら次ページを打ち切る", async () => {
  const { fn } = fakeFetch(200, { posts: [post("300"), post("250"), post("249")], nextCursor: "next" });
  const page = await new MdfromxProvider(SECRET, { fetch: fn }).searchRecent({ ...REQUEST, sinceId: "250" });
  assert.deepEqual(page.posts.map((p) => p.postId), ["300"]);
  assert.equal(page.nextCursor, null);
});

test("429 は retryAt 付きの RateLimit、5xx は結果不明、400/401 は設定の誤り", async () => {
  await assert.rejects(
    new MdfromxProvider(SECRET, { fetch: fakeFetch(429, {}, { "retry-after": "60" }).fn }).searchRecent(REQUEST),
    (e: ProviderRateLimitError) => e instanceof ProviderRateLimitError && e.retryAt !== null
  );
  await assert.rejects(
    new MdfromxProvider(SECRET, { fetch: fakeFetch(503, { code: "search_unavailable" }).fn }).searchRecent(REQUEST),
    ProviderUnknownError
  );
  await assert.rejects(
    new MdfromxProvider(SECRET, { fetch: fakeFetch(400, { code: "missing_query" }).fn }).searchRecent(REQUEST),
    ProviderConfigError
  );
});

test("劣化した結果は受け付けない", async () => {
  await assert.rejects(
    new MdfromxProvider(SECRET, {
      fetch: fakeFetch(200, { posts: [post("1")], source: "firecrawl", degraded: true }, { "x-source": "firecrawl" }).fn,
    }).searchRecent(REQUEST),
    ProviderUnknownError
  );
});

test("ページ送りが進まない応答 (empty_page) はそこで打ち切り、取りこぼしの可能性として数える", async () => {
  const provider = new MdfromxProvider(SECRET, {
    fetch: fakeFetch(200, { posts: [], nextCursor: "again", warnings: ["empty_page"] }).fn,
  });
  const page = await provider.searchRecent({ ...REQUEST, cursor: "c1" });
  assert.equal(page.posts.length, 0);
  assert.equal(page.nextCursor, null);
  assert.equal(provider.noProgressPages, 1);
});

test("通信エラーは結果不明として扱い、エラーに本文を含めない", async () => {
  const failing = (async () => {
    throw new Error(`socket closed ${CANARY}`);
  }) as unknown as typeof fetch;
  await assert.rejects(new MdfromxProvider(SECRET, { fetch: failing }).searchRecent(REQUEST), (e: Error) => {
    assert.ok(e instanceof ProviderUnknownError);
    assert.ok(!`${e.message}${e.stack}`.includes(CANARY));
    return true;
  });
});
