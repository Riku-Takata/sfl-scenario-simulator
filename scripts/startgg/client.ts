/**
 * start.gg GraphQL クライアント
 * - レート制限 (80 req / 60s) を守るため最小リクエスト間隔を空ける
 * - 429 / 5xx / ネットワークエラーは指数バックオフで再試行
 * - 1リクエストあたり 1000 オブジェクトの複雑度上限があるため、呼び出し側で perPage を抑えること
 */

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

const API_URL = process.env.STARTGG_API_URL || "https://api.start.gg/gql/alpha";
const MIN_INTERVAL_MS = 850; // 約70 req/min
const MAX_RETRIES = 5;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasStartggToken(): boolean {
  return Boolean(process.env.STARTGG_API_TOKEN);
}

export class StartggError extends Error {}

export async function startggQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = process.env.STARTGG_API_TOKEN;
  if (!token) throw new StartggError("STARTGG_API_TOKEN is not set");

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let retryable = false;
    let message = "";
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        retryable = true;
        message = `HTTP ${res.status}`;
      } else {
        const json = (await res.json()) as {
          data?: T;
          errors?: Array<{ message: string }>;
          success?: boolean;
          message?: string;
        };
        if (json.errors?.length) {
          message = json.errors.map((e) => e.message).join("; ");
          // レート制限はエラー本文で返ることがある
          retryable = /rate limit/i.test(message);
          if (!retryable) throw new StartggError(message);
        } else if (json.success === false) {
          message = json.message || "start.gg request failed";
          retryable = /rate limit/i.test(message);
          if (!retryable) throw new StartggError(message);
        } else if (json.data) {
          return json.data;
        } else {
          throw new StartggError("start.gg returned no data");
        }
      }
    } catch (err) {
      if (err instanceof StartggError) throw err;
      retryable = true;
      message = err instanceof Error ? err.message : String(err);
    }

    if (!retryable || attempt >= MAX_RETRIES) {
      throw new StartggError(`start.gg request failed: ${message}`);
    }
    await sleep(Math.min(60_000, 2000 * 2 ** attempt));
  }
}
