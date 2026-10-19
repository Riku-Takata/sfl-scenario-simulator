/**
 * Gemini generateContent の薄いラッパー（無料枠前提）。
 * - 429 (日次上限) を返したモデルはこの実行中は使わない
 * - 503 (混雑) は短く待って1回だけ再試行し、だめなら次のモデルへ
 */

export interface GeminiVideoInput {
  youtubeUrl: string;
  startSec: number;
  endSec: number;
  fps: number;
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

export async function callGemini(options: {
  apiKey: string;
  models: string[];
  prompt: string;
  video?: GeminiVideoInput;
  temperature?: number;
}): Promise<GeminiCallResult | null> {
  const { apiKey, models, prompt, video, temperature = 0.3 } = options;

  const parts: unknown[] = [];
  if (video) {
    parts.push({
      fileData: { fileUri: video.youtubeUrl },
      videoMetadata: {
        startOffset: `${video.startSec}s`,
        endOffset: `${video.endSec}s`,
        fps: video.fps,
      },
    });
  }
  parts.push({ text: prompt });

  for (const model of models) {
    if (exhaustedModels.has(model)) continue;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseMimeType: "application/json", temperature },
            }),
          }
        );

        if (res.status === 429) {
          console.warn(`[Gemini ${model}] daily quota exhausted; skipping this model for the rest of the run.`);
          exhaustedModels.add(model);
          break;
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
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
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
