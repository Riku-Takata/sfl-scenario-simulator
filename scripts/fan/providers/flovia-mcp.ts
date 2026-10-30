/**
 * Flovia の MCP (flovia_x) を XSearchProvider として使う (実装計画 §4)。
 *
 * - 1回の tools/call が X の検索1ページに当たる。無料枠の使用率は応答の for_user で分かる。
 * - request_text / purpose は Flovia が保持・共有し得るので固定の汎用文にする。チーム名は query 以外に入れない。
 * - 失敗は HTTP だけでなく、tools/call の isError や ok: false でも返る。
 *   文面は分類にだけ使い、例外メッセージやログには出さない (本文やクエリが混ざり得るため)。
 */
import { hashAuthorId } from "./author-key";
import {
  ProviderConfigError,
  ProviderCursorError,
  ProviderRateLimitError,
  ProviderUnknownError,
  SecretText,
  type EphemeralPost,
  type QuotaStatus,
  type SearchPage,
  type SearchRequest,
  type XSearchProvider,
} from "./types";

export const FLOVIA_MCP_URL = "https://api.flovia.dev/mcp";
/** Flovia が保持・共有し得るので固定の汎用文にする (実装計画 §4) */
export const FLOVIA_REQUEST_TEXT = "公開投稿の件数集計のための検索";
export const FLOVIA_PURPOSE = "SFLチーム別の公開投稿の集計";

const TIMEOUT_MS = 60_000;
/** flovia_x の search_recent が受け付ける範囲 */
const MIN_RESULTS = 10;
const MAX_RESULTS = 100;

export class FloviaMcpSession {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly key: string,
    private readonly url = process.env.FLOVIA_MCP_URL ?? FLOVIA_MCP_URL,
    private readonly doFetch: typeof fetch = fetch
  ) {}

  private async post(body: unknown): Promise<{ status: number; message: any }> {
    const res = await this.doFetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    this.sessionId = res.headers.get("mcp-session-id") ?? this.sessionId;
    const text = await res.text();
    if (!text) return { status: res.status, message: null };
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      // 最後の data: 行が JSON-RPC の応答
      const data = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      return { status: res.status, message: data.length ? JSON.parse(data.at(-1)!) : null };
    }
    try {
      return { status: res.status, message: JSON.parse(text) };
    } catch {
      return { status: res.status, message: { nonJsonLength: text.length } };
    }
  }

  async initialize() {
    const r = await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sfl-fan-probe", version: "0.1.0" } },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return r;
  }

  request(method: string, params: unknown) {
    return this.post({ jsonrpc: "2.0", id: this.nextId++, method, params });
  }

  callTool(name: string, args: Record<string, unknown>) {
    return this.request("tools/call", { name, arguments: args });
  }
}

/** tools/call の結果から本体を取り出す (structuredContent、なければ text を JSON として読む) */
export function toolPayload(message: any): unknown {
  const result = message?.result;
  if (!result) return message?.error ? { error: { code: message.error.code, messageLength: String(message.error.message ?? "").length } } : null;
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c: any) => c.type === "text")?.text;
  if (typeof text !== "string") return result;
  try {
    return JSON.parse(text);
  } catch {
    return { textLength: text.length, isError: result.isError ?? false };
  }
}

interface FloviaPost {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  lang?: string | null;
  referenced_tweets?: { type?: string }[];
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
}

interface FloviaUsage {
  five_hour?: { used_pct?: number };
  week?: { used_pct?: number };
}

interface FloviaSearchPayload {
  ok?: boolean;
  posts?: FloviaPost[];
  next_cursor?: string | null;
  billed?: { posts?: number; requests?: number };
  for_user?: FloviaUsage;
}

export interface FloviaCallStats {
  operationId: string;
  status: number;
  returned: number;
  billedPosts: number | null;
  fiveHourUsedPct: number | null;
  weekUsedPct: number | null;
}

function parseQuota(usage: FloviaUsage | undefined): QuotaStatus | null {
  const fiveHour = usage?.five_hour?.used_pct;
  const week = usage?.week?.used_pct;
  return typeof fiveHour === "number" && typeof week === "number" ? { fiveHourUsedPct: fiveHour, weekUsedPct: week } : null;
}

/** ツールが返した失敗を分類する。分からなければ「結果不明」(同じ operation_id で再送できる) */
function toolFailure(detail: string): Error {
  if (/cursor/i.test(detail)) return new ProviderCursorError("flovia: cursor rejected");
  if (/allowance|quota|rate.?limit|too many|exhausted/i.test(detail)) return new ProviderRateLimitError("flovia: usage limit", null);
  if (/unauthori[sz]ed|forbidden|invalid.{0,12}key|consent/i.test(detail)) return new ProviderConfigError("flovia: rejected request");
  return new ProviderUnknownError("flovia: tool error");
}

function httpFailure(status: number): Error | null {
  if (status === 429) return new ProviderRateLimitError("flovia: HTTP 429", null);
  if (status === 400 || status === 401 || status === 403) return new ProviderConfigError(`flovia: HTTP ${status}`);
  if (status < 200 || status >= 300) return new ProviderUnknownError(`flovia: HTTP ${status}`);
  return null;
}

export class FloviaProvider implements XSearchProvider {
  /** 呼び出しごとの計測値 (評価用)。投稿の内容は含めない */
  readonly calls: FloviaCallStats[] = [];
  private readonly session: FloviaMcpSession;
  private initialized = false;

  constructor(
    key: string,
    private readonly secret: string,
    options: { url?: string; fetch?: typeof fetch } = {}
  ) {
    this.session = new FloviaMcpSession(key, options.url, options.fetch);
  }

  private async ensureSession(): Promise<void> {
    if (this.initialized) return;
    let r: Awaited<ReturnType<FloviaMcpSession["initialize"]>>;
    try {
      r = await this.session.initialize();
    } catch {
      throw new ProviderUnknownError("flovia: network error or timeout");
    }
    const failure = httpFailure(r.status);
    if (failure) throw failure;
    this.initialized = true;
  }

  private async call(name: string, args: Record<string, unknown>) {
    await this.ensureSession();
    let r: Awaited<ReturnType<FloviaMcpSession["callTool"]>>;
    try {
      r = await this.session.callTool(name, args);
    } catch {
      throw new ProviderUnknownError("flovia: network error or timeout");
    }
    const failure = httpFailure(r.status);
    if (failure) throw failure;
    if (r.message?.error) throw toolFailure(String(r.message.error.message ?? ""));
    if (r.message?.result?.isError) throw toolFailure(JSON.stringify(r.message.result.content ?? ""));
    return { status: r.status, payload: toolPayload(r.message) };
  }

  async quota(): Promise<QuotaStatus> {
    const { payload } = await this.call("flovia_status", {});
    const quota = parseQuota(payload as FloviaUsage);
    if (!quota) throw new ProviderUnknownError("flovia: status has no usage");
    return quota;
  }

  async searchRecent(request: SearchRequest): Promise<SearchPage> {
    const { status, payload } = await this.call("flovia_x", {
      action: "search_recent",
      query: request.query,
      max_results: Math.min(Math.max(request.maxResults, MIN_RESULTS), MAX_RESULTS),
      sort_order: "recency",
      start_time: request.startTime,
      request_text: FLOVIA_REQUEST_TEXT,
      purpose: FLOVIA_PURPOSE,
      operation_id: request.operationId,
      ...(request.cursor ? { cursor: request.cursor } : {}),
      ...(request.sinceId ? { since_id: request.sinceId } : {}),
    });
    const body = payload as FloviaSearchPayload | null;
    if (!body || body.ok !== true) throw toolFailure(JSON.stringify(body ?? ""));

    const posts: EphemeralPost[] = [];
    for (const p of body.posts ?? []) {
      const createdAt = Date.parse(p.created_at ?? "");
      if (!p.id || !/^\d+$/.test(p.id) || !p.author_id || !Number.isFinite(createdAt)) continue;
      if (p.referenced_tweets?.some((r) => r.type === "retweeted")) continue;
      const m = p.public_metrics;
      posts.push({
        postId: p.id,
        createdAt,
        text: new SecretText(p.text ?? ""),
        authorKey: hashAuthorId(this.secret, p.author_id),
        lang: p.lang ?? null,
        engagement: m
          ? {
              likes: m.like_count ?? null,
              reposts: m.retweet_count ?? null,
              replies: m.reply_count ?? null,
              quotes: m.quote_count ?? null,
            }
          : null,
      });
    }

    const quota = parseQuota(body.for_user);
    this.calls.push({
      operationId: request.operationId,
      status,
      returned: posts.length,
      billedPosts: body.billed?.posts ?? null,
      fiveHourUsedPct: quota?.fiveHourUsedPct ?? null,
      weekUsedPct: quota?.weekUsedPct ?? null,
    });
    return { posts, nextCursor: body.next_cursor ?? null, quota };
  }
}
