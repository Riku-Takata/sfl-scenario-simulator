/**
 * mdfromx.com (x.md) の検索 API を XSearchProvider として使う。**性能評価専用**。
 *
 * 公開する指標の取得元には使わない (実装計画 §4.1)。検索はログイン済み X アカウントの
 * セッションで行われ、規約は大量・定期の収集を想定していないため。
 *
 * Flovia との違い:
 * - operation_id による冪等性は無い。GET で課金も無いので、同じリクエストの再送は無害として扱う。
 * - since_id が無い。since (日時) で期間を絞り、since_id 以下の投稿は手元で除き、
 *   既知の範囲に届いたらそこで次ページを打ち切る (結果は新しい順に並ぶ)。
 * - 使用率 (%) の代わりに RateLimit ヘッダーの残り回数がある。15分窓のアカウント枠の使用率を
 *   fiveHourUsedPct として返す (週次の枠は無いので 0)。
 * - quotes と lang は返らないことがある (2026-10-30 の試し呼び出しでは 16件すべて欠落)。
 * - 期間内を取り切っても次ページのカーソルが返り、そのページは empty_page になる。
 */
import { hashAuthorId } from "./author-key";
import {
  ProviderConfigError,
  ProviderRateLimitError,
  ProviderUnknownError,
  SecretText,
  type EphemeralPost,
  type QuotaStatus,
  type SearchPage,
  type SearchRequest,
  type XSearchProvider,
} from "./types";

export const MDFROMX_BASE_URL = "https://mdfromx.com";
const TIMEOUT_MS = 30_000;
/** 劣化した結果 (Web 検索の断片) を出す取得元。件数の指標が歪むので受け付けない */
const DEGRADED_SOURCES = new Set(["contextdev", "firecrawl"]);

interface MdfromxPost {
  id: string;
  type?: string;
  text?: string;
  created_timestamp?: number;
  author?: { id?: string };
  likes?: number;
  retweets?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  lang?: string | null;
  reposted_by?: unknown;
}

interface MdfromxSearchResponse {
  posts?: MdfromxPost[];
  nextCursor?: string;
  source?: string;
  degraded?: boolean;
  warnings?: string[];
}

export interface MdfromxCallStats {
  latencyMs: number;
  source: string | null;
  cache: string | null;
  status: number;
}

/** RateLimit ヘッダー ("account-ip";r=9;t=525) から、名前ごとの残り回数を読む */
export function parseRateLimit(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const name = part.match(/"([^"]+)"/)?.[1];
    const remaining = part.match(/;r=(\d+)/)?.[1];
    if (name && remaining !== undefined) out[name] = Number(remaining);
  }
  return out;
}

/** RateLimit-Policy ヘッダー ("account-ip";q=10;w=900) から、名前ごとの上限を読む */
export function parseRateLimitPolicy(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const name = part.match(/"([^"]+)"/)?.[1];
    const quota = part.match(/;q=(\d+)/)?.[1];
    if (name && quota !== undefined) out[name] = Number(quota);
  }
  return out;
}

function toEpochMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

export class MdfromxProvider implements XSearchProvider {
  /** 呼び出しごとの計測値 (評価用) */
  readonly calls: MdfromxCallStats[] = [];
  /** ページ送りが進まず打ち切ったページ数 (取りこぼしの可能性) */
  noProgressPages = 0;
  private lastQuota: QuotaStatus = { fiveHourUsedPct: 0, weekUsedPct: 0 };

  constructor(
    private readonly secret: string,
    private readonly options: { baseUrl?: string; fetch?: typeof fetch; now?: () => number } = {}
  ) {}

  async quota(): Promise<QuotaStatus> {
    return this.lastQuota;
  }

  async searchRecent(request: SearchRequest): Promise<SearchPage> {
    const url = new URL("/api/v1/search", this.options.baseUrl ?? MDFROMX_BASE_URL);
    url.search = new URLSearchParams({
      q: request.query,
      feed: "latest",
      limit: String(Math.min(Math.max(request.maxResults, 1), 100)),
      format: "json",
      full: "true",
      require_live: "true",
      since: request.startTime,
      ...(request.cursor ? { cursor: request.cursor } : {}),
    }).toString();

    const doFetch = this.options.fetch ?? fetch;
    const now = this.options.now ?? (() => performance.now());
    const started = now();
    let res: Response;
    try {
      res = await doFetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new ProviderUnknownError("mdfromx: network error or timeout");
    }
    const source = res.headers.get("x-source");
    this.calls.push({
      latencyMs: Math.round(now() - started),
      source,
      cache: res.headers.get("x-cache"),
      status: res.status,
    });
    this.updateQuota(res.headers);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const retryAt = Number.isFinite(retryAfter) && retryAfter > 0
        ? new Date(Date.now() + retryAfter * 1000).toISOString()
        : null;
      throw new ProviderRateLimitError("mdfromx: rate limited", retryAt);
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`mdfromx: HTTP ${res.status}`);
    }
    if (!res.ok) throw new ProviderUnknownError(`mdfromx: HTTP ${res.status}`);

    let body: MdfromxSearchResponse;
    try {
      body = (await res.json()) as MdfromxSearchResponse;
    } catch {
      throw new ProviderUnknownError("mdfromx: invalid JSON");
    }
    if (body.degraded || DEGRADED_SOURCES.has(body.source ?? source ?? "")) {
      throw new ProviderUnknownError("mdfromx: degraded result");
    }
    // ページ送りが進まなかった (empty_page / repeated_cursor)。mdfromx は「取りこぼしの可能性」としているが、
    // 期間内の投稿を取り切ったときにも返る (2026-10-30 確認)。再送しても進まないので、ここで打ち切り、
    // 取りこぼしの可能性として数えておく
    const noProgress = body.warnings?.some((w) => w === "empty_page" || w === "repeated_cursor") ?? false;
    if (noProgress) this.noProgressPages++;

    const since = request.sinceId === null ? null : BigInt(request.sinceId);
    let reachedKnown = false;
    const posts: EphemeralPost[] = [];
    for (const p of body.posts ?? []) {
      if (!/^\d+$/.test(p.id) || p.reposted_by) continue;
      if (since !== null && BigInt(p.id) <= since) {
        reachedKnown = true;
        continue;
      }
      if (typeof p.created_timestamp !== "number" || !p.author?.id) continue;
      posts.push({
        postId: p.id,
        createdAt: toEpochMs(p.created_timestamp),
        text: new SecretText(p.text ?? ""),
        authorKey: hashAuthorId(this.secret, p.author.id),
        lang: p.lang ?? null,
        engagement: {
          likes: p.likes ?? null,
          reposts: p.retweets ?? p.reposts ?? null,
          replies: p.replies ?? null,
          quotes: p.quotes ?? null,
        },
      });
    }
    return {
      posts,
      nextCursor: reachedKnown || noProgress ? null : body.nextCursor ?? null,
      quota: this.lastQuota,
    };
  }

  private updateQuota(headers: Headers): void {
    const remaining = parseRateLimit(headers.get("ratelimit"));
    const policy = parseRateLimitPolicy(headers.get("ratelimit-policy"));
    const limit = policy["account-ip"];
    const left = remaining["account-ip"];
    if (limit && left !== undefined) {
      this.lastQuota = { fiveHourUsedPct: ((limit - left) / limit) * 100, weekUsedPct: 0 };
    }
  }
}
