/**
 * Gemini generateContent の薄いラッパー（無料枠前提）。
 * - 429 は本文 (quotaId、または interactions の "requests per day" という文) で判別し、日次上限のモデルだけこの実行中は使わない
 * - 分あたりの上限 (RPM/TPM) は retryDelay だけ待って再試行し、待ちが長すぎれば次のモデルへ
 * - 種類が分からない 429 は本文をログに出し、待たずに次のモデルへ。同じモデルで2回続いたらこの実行中は使わない
 * - 動画の呼び出しで "Your project has exceeded a quota" が返ったら、プロジェクト全体の動画の枠 (日次でリセット) が尽きているので、
 *   この実行中は動画の呼び出しをすべて止める。テキストの呼び出しはこの枠に掛からないので続ける
 * - 503 (混雑)・通信エラーは同じモデルで再試行せず次のモデルへ。全モデル混雑の呼び出しが2回続いたら、この実行では以降の呼び出しを送らない
 * - 動画の呼び出しの 403 は再試行しても変わらず、失敗も日次上限を消費するので、この実行中はその動画を呼び出さない
 */

import { geminiTokenCounts, recordTokenUsage } from "./token-usage";

export interface GeminiVideoInput {
  youtubeUrl: string;
  startSec: number;
  endSec: number;
  fps: number;
  mode?: "static" | "agentic";
  /** 複数の区間を1リクエストで送る (検証のまとめ送り)。指定時は startSec/endSec の代わりに使う。 */
  clips?: Array<{ startSec: number; endSec: number }>;
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
// 全モデルが 503/通信エラーだった呼び出しがこの回数続いたら、混雑が引くまで (この実行の残り) 送らない。
const OVERLOADED_CALLS_BEFORE_PAUSE = 2;
let overloadedCallStreak = 0;
let lastFailureStatus: number | undefined;
let videoQuotaExhausted = false;
const deniedVideos = new Set<string>();

/**
 * 廃止されて別モデルへ転送されるモデル。呼び出しても転送先の日次上限を消費するだけで、独立した検証にもならない。
 * gemini-3.7-flash は 2026-10-08 に廃止され gemini-3.8-flash へ転送される。
 */
const RETIRED_MODELS = new Set(["gemini-3.7-flash"]);

export function activeModels(models: string[]): string[] {
  return models.filter((model) => !RETIRED_MODELS.has(model));
}

/** 直前の callGemini が null を返したときの最後の HTTP ステータス (通信エラーなら undefined)。 */
export function lastGeminiFailureStatus(): number | undefined {
  return lastFailureStatus;
}

/** プロジェクト全体の動画の枠が尽きたか。尽きていれば、この実行中は動画の呼び出しを送らない。 */
export function isVideoQuotaExhausted(): boolean {
  return videoQuotaExhausted;
}

/** この実行中に 403 が返った動画か。 */
export function isVideoDenied(youtubeUrl: string): boolean {
  return deniedVideos.has(youtubeUrl);
}

/** テスト用: 実行単位で持っている状態を初期化する。 */
export function resetGeminiRunState(): void {
  deniedVideos.clear();
  exhaustedModels.clear();
  unknownRateLimitStreaks.clear();
  overloadedCallStreak = 0;
  lastFailureStatus = undefined;
  videoQuotaExhausted = false;
}

export function videoClips(video: GeminiVideoInput): Array<{ startSec: number; endSec: number }> {
  return video.clips?.length ? video.clips : [{ startSec: video.startSec, endSec: video.endSec }];
}

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
  /** "Your project has exceeded a quota"。モデルを名指ししない、プロジェクト全体の上限。 */
  projectQuota?: boolean;
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
  const projectQuota = /project has exceeded a quota/i.test(message);
  return {
    known: quotaIds.length > 0 || perDay || perMinute,
    daily: quotaIds.some((id) => /PerDay/i.test(id)) || perDay,
    quotaIds,
    ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
    ...(limitedModel ? { limitedModel } : {}),
    ...(projectQuota ? { projectQuota } : {}),
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
  lastFailureStatus = undefined;
  if (video && videoQuotaExhausted) {
    lastFailureStatus = 429;
    return null;
  }
  if (video && deniedVideos.has(video.youtubeUrl)) {
    lastFailureStatus = 403;
    return null;
  }
  if (overloadedCallStreak >= OVERLOADED_CALLS_BEFORE_PAUSE) {
    console.warn(`[Gemini] every model was overloaded on ${overloadedCallStreak} calls in a row; skipping further calls this run.`);
    return null;
  }
  // 全モデルが混雑 (503/通信エラー) で終わったかどうか。上限や不正なリクエストは混雑に数えない。
  let attempted = 0;
  let onlyOverloaded = true;

  for (const model of models) {
    if (exhaustedModels.has(model)) continue;
    attempted++;

    let rateLimitRetries = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const request = video
          ? {
              endpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
              body: {
                model,
                input: [
                  ...(video.mode === "agentic"
                    ? [{ type: "video", uri: video.youtubeUrl, processing: "agentic" }]
                    : videoClips(video).map((clip) => ({
                        type: "video",
                        uri: video.youtubeUrl,
                        processing: {
                          type: "static",
                          start_offset: `${clip.startSec}s`,
                          end_offset: `${clip.endSec}s`,
                          fps: video.fps,
                        },
                      }))),
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

        if (res.status !== 503 && !res.ok) {
          onlyOverloaded = false;
          lastFailureStatus = res.status;
        }
        if (res.status === 429) {
          const body = await res.text().catch(() => "");
          const limit = classifyRateLimit(body);
          if (video && limit.projectQuota) {
            // 2026-10-28 の検証では、この 429 はどの動画・どのモデルでも返り、太平洋時間 0 時に解けた。
            // 他のモデルを試しても同じ枠で弾かれるだけなので、この実行の動画の呼び出しはここで打ち切る。
            videoQuotaExhausted = true;
            console.warn(`[Gemini ${model}] project video quota exhausted; skipping every video call for the rest of the run. Body: ${body.replace(/\s+/g, " ").slice(0, 300)}`);
            return null;
          }
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
        if (video && res.status === 403) {
          const body = await res.text().catch(() => "");
          deniedVideos.add(video.youtubeUrl);
          console.warn(`[Gemini ${model}] HTTP 403 on ${video.youtubeUrl}; skipping this video for the rest of the run. Body: ${body.slice(0, 200)}`);
          return null;
        }
        if (res.status === 503) {
          // 待って同じモデルを叩き直しても混雑が引くことは少ないので、すぐ次のモデルへ。
          console.warn(`[Gemini ${model}] HTTP 503; trying the next model.`);
          lastFailureStatus = 503;
          break;
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
          onlyOverloaded = false;
          break;
        }
        unknownRateLimitStreaks.delete(model);
        overloadedCallStreak = 0;
        return {
          model,
          text,
          videoSeconds: video ? videoClips(video).reduce((sum, clip) => sum + clip.endSec - clip.startSec, 0) : 0,
        };
      } catch (err) {
        console.warn(`[Gemini ${model}] ${(err as Error).message}; trying the next model.`);
        lastFailureStatus = undefined;
        break;
      }
    }
  }
  if (attempted > 0 && onlyOverloaded) overloadedCallStreak++;
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
