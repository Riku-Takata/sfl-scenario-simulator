/**
 * Buckler's Boot Camp 読み取りクライアント (非公開の Next.js page-data ルート)
 *
 * - 認証はご自身でログインしたブラウザの Cookie を BUCKLER_AUTH_COOKIE で渡す。値はログに出さない
 * - サーバー負荷を避けるため、常に1並列・リクエスト間に一定間隔＋ランダムな揺らぎを入れる
 * - 1回の実行あたりのリクエスト上限を超えたら打ち切る
 * - 429 / 5xx は長めに待って数回だけ再試行し、続く場合はその日の取得を中止する
 * - 認証切れ (401/403・ログイン画面・未ログイン応答) は再試行せず即中止する
 */

const ORIGIN = "https://www.streetfighter.com";
const BASE = `${ORIGIN}/6/buckler`;
const LOCALE = "ja-jp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class BucklerAuthError extends Error {}
export class BucklerBlockedError extends Error {}
export class BucklerBudgetError extends Error {}

export interface PacingOptions {
  /** リクエスト間の最小間隔 */
  minDelayMs: number;
  /** 最小間隔に加えるランダム幅 */
  jitterMs: number;
  /** 1回の実行で送る最大リクエスト数 */
  maxRequests: number;
}

export const DAILY_PACING: PacingOptions = { minDelayMs: 4000, jitterMs: 3000, maxRequests: 400 };
export const BACKFILL_PACING: PacingOptions = { minDelayMs: 6000, jitterMs: 4000, maxRequests: 1200 };

const RETRY_WAITS_MS = [60_000, 180_000, 600_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BucklerClient {
  private buildId: string | null = null;
  private lastRequestAt = 0;
  requestCount = 0;

  constructor(
    private readonly cookie: string,
    private readonly pacing: PacingOptions
  ) {
    if (!cookie.trim()) throw new BucklerAuthError("BUCKLER_AUTH_COOKIE is not set");
  }

  private async pace(): Promise<void> {
    if (this.requestCount >= this.pacing.maxRequests) {
      throw new BucklerBudgetError(`request budget (${this.pacing.maxRequests}) reached`);
    }
    const delay = this.pacing.minDelayMs + Math.random() * this.pacing.jitterMs;
    const wait = this.lastRequestAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
    this.requestCount++;
  }

  private async request(
    url: string,
    accept: "json" | "html",
    opts: { allow403?: boolean } = {}
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await this.pace();
      const res = await fetch(url, {
        headers: {
          Accept: accept === "json" ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          Referer: `${BASE}/${LOCALE}/`,
          "User-Agent": USER_AGENT,
          Cookie: this.cookie,
          ...(accept === "json" ? { "x-nextjs-data": "1" } : {}),
        },
        redirect: "manual",
      });
      if (res.status === 403 && opts.allow403) return res;
      if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
        throw new BucklerAuthError(`HTTP ${res.status} (session expired or access denied)`);
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = RETRY_WAITS_MS[attempt];
        if (wait == null) throw new BucklerBlockedError(`HTTP ${res.status} persisted; stopping`);
        console.warn(`[buckler] HTTP ${res.status}. Backing off ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      return res;
    }
  }

  /** トップページの HTML から Next.js の buildId を取得 (デプロイごとに変わる) */
  private async refreshBuildId(): Promise<string> {
    const res = await this.request(`${BASE}/${LOCALE}`, "html");
    const html = await res.text();
    const m = html.match(/"buildId":"([^"]+)"/);
    if (!m) throw new BucklerBlockedError("buildId not found in Buckler HTML");
    this.buildId = m[1];
    return this.buildId;
  }

  /** `_next/data/{buildId}/ja-jp/{path}.json` の pageProps を返す */
  async pageProps<T = Record<string, unknown>>(
    relativePath: string,
    query: Record<string, string | number> = {}
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const buildId = this.buildId ?? (await this.refreshBuildId());
      const qs = new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, String(v)])
      ).toString();
      const url = `${BASE}/_next/data/${buildId}/${LOCALE}/${relativePath}.json${qs ? `?${qs}` : ""}`;
      const res = await this.request(url, "json");
      if (res.status === 404 && attempt === 0) {
        // Capcom 側のデプロイで buildId が変わった
        this.buildId = null;
        continue;
      }
      if (!res.ok) throw new BucklerBlockedError(`HTTP ${res.status} for ${relativePath}`);
      if (!(res.headers.get("content-type") ?? "").includes("json")) {
        throw new BucklerAuthError(`non-JSON response for ${relativePath} (login page?)`);
      }
      const json = (await res.json()) as { pageProps?: Record<string, unknown> };
      const pp = json.pageProps ?? {};
      const common = pp.common as { statusCode?: number; loginUser?: unknown } | undefined;
      if (
        pp.__N_REDIRECT ||
        common?.statusCode === 401 ||
        common?.statusCode === 403 ||
        (common && !common.loginUser)
      ) {
        throw new BucklerAuthError(`not logged in (statusCode ${common?.statusCode ?? "redirect"})`);
      }
      if (common?.statusCode && common.statusCode >= 400) {
        throw new BucklerBlockedError(`embedded status ${common.statusCode} for ${relativePath}`);
      }
      return pp as T;
    }
    throw new BucklerBlockedError(`page-data route not found: ${relativePath}`);
  }

  /** `api/en/stats/{variant}/{YYYYMM}`。未公開の月 (403) ・存在しない月 (404) は null */
  async stats<T = unknown>(variant: string, yyyymm: string): Promise<T | null> {
    const res = await this.request(`${BASE}/api/en/stats/${variant}/${yyyymm}`, "json", {
      allow403: true,
    });
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) throw new BucklerBlockedError(`HTTP ${res.status} for stats ${variant}/${yyyymm}`);
    return (await res.json()) as T;
  }
}
