/**
 * Gemini generateContent の薄いラッパー（無料枠前提）。
 * - 429 は本文 (quotaId、または interactions の "requests per day" という文) で判別し、日次上限のモデルだけこの実行中は使わない
 * - 分あたりの上限 (RPM/TPM) は retryDelay だけ待って再試行し、待ちが長すぎれば次のモデルへ
 * - 種類が分からない 429 は本文をログに出し、待たずに次のモデルへ。同じモデルで2回続いたらこの実行中は使わない
 * - 503 (混雑) は短く待って1回だけ再試行し、だめなら次のモデルへ
 */

import { geminiTokenCounts, recordTokenUsage } from "./token-usage";

export interface GeminiVideoInput {
  youtubeUrl: string;
  startSec: number;
  endSec: number;
  fps: number;
  mode?: "static" | "agentic";
}

export interface GeminiCallResult {
  model: string;
  text: string;
  videoSeconds: number;
}

const exhaustedModels = new Set<string>();
// 種類が分からない 429 がこの回数続いたモデルは、この実行中は使わない (3.6-flash の "project has exceeded a quota" など)。
const UNKNOWN_RATE_LIMIT_EXCLUDE_AFTER = 2;
const unknownRateLimitStreaks = new Map<string, number>();

export function parseModelList(value: string | undefined, fallback: string[]): string[] {
  const list = (value || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

export function isModelExhausted(model: string): boolean {
  return exhaustedModels.has(model);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_DEFAULT_WAIT_MS = 30_000;
// これより長い待ちは実行時間の予算を食うので、待たずに次のモデルへ回す。
const RATE_LIMIT_MAX_WAIT_MS = 90_000;

export interface GeminiRateLimit {
  /** どの上限か判別できたか。できなければ本文をログに残して次のモデルへ回す。 */
  known: boolean;
  daily: boolean;
  quotaIds: string[];
  retryDelayMs?: number;
  /** 上限に当たったと本文が名指ししたモデル。要求したモデルと違えば枠を共有している。 */
  limitedModel?: string;
}

/** "41s" / "14h13m59s" / "1m30.5s" をミリ秒にする。 */
function parseDuration(text: string | undefined): number | undefined {
  const match = text?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!match || !(match[1] || match[2] || match[3])) return undefined;
  return Math.ceil(((Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60 + Number(match[3] ?? 0)) * 1000);
}

/**
 * 429 の本文から、どの上限に当たったかを読む。
 * generateContent は google.rpc.QuotaFailure / RetryInfo を返すが、動画用の interactions は
 * "Rate limit exceeded for model X (limit: 20 requests per day ...). Please retry in 14h13m59s" という文章だけを返す。
 */
export function classifyRateLimit(body: string): GeminiRateLimit {
  type Detail = { "@type"?: string; violations?: Array<{ quotaId?: string }>; retryDelay?: string };
  let details: Detail[] = [];
  let message = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; details?: Detail[] } } | Array<{ error?: { message?: string; details?: Detail[] } }>;
    const error = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    details = error?.details ?? [];
    message = error?.message ?? "";
  } catch {
    // 本文が JSON でなければ種類は不明として扱う。
  }
  const quotaIds = details.flatMap((detail) => detail.violations ?? []).map((violation) => violation.quotaId ?? "").filter(Boolean);
  const perDay = /\bper day\b/i.test(message);
  const perMinute = /\bper minute\b/i.test(message);
  const retryDelayMs = parseDuration(details.find((detail) => detail.retryDelay)?.retryDelay) ??
    parseDuration(message.match(/retry in ([\d.hms]+)/i)?.[1]);
  const limitedModel = message.match(/for model ([\w.-]+)/i)?.[1];
  return {
    known: quotaIds.length > 0 || perDay || perMinute,
    daily: quotaIds.some((id) => /PerDay/i.test(id)) || perDay,
    quotaIds,
    ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
    ...(limitedModel ? { limitedModel } : {}),
  };
}

export async function callGemini(options: {
  apiKey: string;
  models: string[];
  prompt: string;
  video?: GeminiVideoInput;
  temperature?: number;
  purpose?: "extract" | "verify" | "visual" | "narration";
}): Promise<GeminiCallResult | null> {
  const { apiKey, models, prompt, video, temperature = 0.3 } = options;

  for (const model of models) {
    if (exhaustedModels.has(model)) continue;

    let rateLimitRetries = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const request = video
          ? {
              endpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
              body: {
                model,
                input: [
                  {
                    type: "video",
                    uri: video.youtubeUrl,
                    ...(video.mode === "agentic"
                      ? { processing: "agentic" }
                      : { processing: {
                          type: "static",
                          start_offset: `${video.startSec}s`,
                          end_offset: `${video.endSec}s`,
                          fps: video.fps,
                        } }),
                  },
                  { type: "text", text: video.mode === "agentic"
                    ? `${prompt}\n\n対象は配信全体の${video.startSec}秒から${video.endSec}秒です。この区間だけを確認し、時刻は配信全体の先頭からの秒数で返してください。`
                    : prompt },
                ],
              },
            }
          : {
              endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              body: {
                contents: [{ parts: [{ text: prompt }] }],
                // Gemini 3.6+ ignores temperature; omit it rather than implying determinism.
              },
            };
        const res = await fetch(request.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(request.body),
        });

        if (res.status === 429) {
          const body = await res.text().catch(() => "");
          const limit = classifyRateLimit(body);
          if (!limit.known) {
            // 種類が分からない上限は待っても通る保証がないので、本文を残して次のモデルへ回す。
            const streak = (unknownRateLimitStreaks.get(model) ?? 0) + 1;
            unknownRateLimitStreaks.set(model, streak);
            const excluded = streak >= UNKNOWN_RATE_LIMIT_EXCLUDE_AFTER;
            if (excluded) exhaustedModels.add(model);
            console.warn(`[Gemini ${model}] rate limited (unknown quota, ${streak} in a row); ${excluded ? "skipping this model for the rest of the run" : "trying the next model"}. Body: ${body.replace(/\s+/g, " ").slice(0, 500)}`);
            break;
          }
          unknownRateLimitStreaks.delete(model);
          const quota = limit.quotaIds.join(",") || (limit.daily ? "requests per day" : "per minute");
          if (limit.daily) {
            const resetsIn = limit.retryDelayMs !== undefined ? `, resets in ${Math.round(limit.retryDelayMs / 60_000)}m` : "";
            console.warn(`[Gemini ${model}] daily quota exhausted (${quota}${resetsIn}); skipping this model for the rest of the run.`);
            exhaustedModels.add(model);
            // 3.7-flash への要求が 3.8-flash の上限を返すように、枠を共有するモデルも使い切っている。
            if (limit.limitedModel && limit.limitedModel !== model) {
              console.warn(`[Gemini ${model}] the limit belongs to ${limit.limitedModel}; skipping it too.`);
              exhaustedModels.add(limit.limitedModel);
            }
            break;
          }
          const waitMs = limit.retryDelayMs ?? RATE_LIMIT_DEFAULT_WAIT_MS;
          if (rateLimitRetries >= RATE_LIMIT_RETRIES || waitMs > RATE_LIMIT_MAX_WAIT_MS) {
            console.warn(`[Gemini ${model}] rate limited (${quota}, retry in ${waitMs / 1000}s); trying the next model.`);
            break;
          }
          rateLimitRetries++;
          console.warn(`[Gemini ${model}] rate limited (${quota}); waiting ${waitMs / 1000}s (retry ${rateLimitRetries}/${RATE_LIMIT_RETRIES}).`);
          await sleep(waitMs);
          attempt--; // 分あたりの上限待ちは 503/通信エラーの再試行回数に数えない
          continue;
        }
        if (res.status === 503) {
          console.warn(`[Gemini ${model}] HTTP 503 (attempt ${attempt}/2)`);
          if (attempt < 2) await sleep(15000);
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(`[Gemini ${model}] HTTP ${res.status}: ${body.slice(0, 200)}`);
          break;
        }

        const data = (await res.json()) as {
          usage?: unknown;
          usageMetadata?: unknown;
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          output_text?: string;
          steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
        };
        recordTokenUsage({ provider: "gemini", model, purpose: options.purpose ?? (video ? "extract" : "narration"), usage: geminiTokenCounts(data) });
        const interactionText = data.steps?.filter((step) => step.type === "model_output")
          .flatMap((step) => step.content ?? []).filter((part) => part.type === "text")
          .map((part) => part.text ?? "").join("");
        const text = video
          ? data.output_text || interactionText
          : data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (!text) {
          console.warn(`[Gemini ${model}] empty response`);
          break;
        }
        unknownRateLimitStreaks.delete(model);
        return {
          model,
          text,
          videoSeconds: video ? video.endSec - video.startSec : 0,
        };
      } catch (err) {
        console.warn(`[Gemini ${model}] ${(err as Error).message} (attempt ${attempt}/2)`);
        if (attempt < 2) await sleep(5000);
      }
    }
  }
  return null;
}

/**
 * ```json フェンス等が混ざっても JSON 部分だけを取り出して parse する。
 * 一部モデル (3.1-flash-lite) はオブジェクトを1要素の配列で包んで返すので剥がす。
 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("No JSON object in model output");
  }
}
