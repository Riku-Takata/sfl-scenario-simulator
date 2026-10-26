/**
 * Gemini generateContent の薄いラッパー（無料枠前提）。
 * - 429 は本文の quotaId で判別する。日次上限 (PerDay) のモデルだけこの実行中は使わない
 * - 分あたりの上限 (RPM/TPM) は retryDelay だけ待って再試行し、待ちが長すぎれば次のモデルへ
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
  daily: boolean;
  quotaIds: string[];
  retryDelayMs?: number;
}

/** 429 の本文 (google.rpc.QuotaFailure / RetryInfo) から、どの上限に当たったかを読む。 */
export function classifyRateLimit(body: string): GeminiRateLimit {
  let details: Array<{ "@type"?: string; violations?: Array<{ quotaId?: string }>; retryDelay?: string }> = [];
  try {
    const parsed = JSON.parse(body) as { error?: { details?: typeof details } } | Array<{ error?: { details?: typeof details } }>;
    details = (Array.isArray(parsed) ? parsed[0] : parsed)?.error?.details ?? [];
  } catch {
    // 本文が JSON でなければ種類は不明として扱う。
  }
  const quotaIds = details.flatMap((detail) => detail.violations ?? []).map((violation) => violation.quotaId ?? "").filter(Boolean);
  const delay = details.find((detail) => detail.retryDelay)?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
  return {
    daily: quotaIds.some((id) => /PerDay/i.test(id)),
    quotaIds,
    ...(delay ? { retryDelayMs: Math.ceil(Number(delay[1]) * 1000) } : {}),
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
          const limit = classifyRateLimit(await res.text().catch(() => ""));
          const quota = limit.quotaIds.join(",") || "unknown quota";
          if (limit.daily) {
            console.warn(`[Gemini ${model}] daily quota exhausted (${quota}); skipping this model for the rest of the run.`);
            exhaustedModels.add(model);
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
