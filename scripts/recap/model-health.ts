/**
 * 実行をまたいだ動画モデルの状態。503 (混雑)・通信エラーが続いたモデルは一定時間、動画の呼び出しを送らない。
 *
 * 2026-11 には gemini-3.6-flash がどの動画にも 503 を返し続けた。503 も無料枠の1日の上限に数えられ、
 * 毎回の実行が同じモデルを叩いてその日の枠を使い切っていた。
 * 止める時間は 2 時間から始め、止めるたびに倍にして最大 24 時間。成功すれば元に戻す。
 * 状態ファイルは worker が有効にしたときだけ読み書きする (テストや手元の試行では使わない)。
 */
import fs from "node:fs";
import { z } from "zod";

export const VIDEO_FAILURES_BEFORE_PAUSE = 3;
export const VIDEO_PAUSE_BASE_MS = 2 * 60 * 60_000;
export const VIDEO_PAUSE_MAX_MS = 24 * 60 * 60_000;

const ModelHealthSchema = z.object({
  videoFailures: z.number().int().nonnegative(),
  pauses: z.number().int().nonnegative().default(0),
  pausedUntil: z.string().optional(),
  lastStatus: z.number().int().optional(),
  updatedAt: z.string(),
});
export const ModelHealthDataSchema = z.object({
  schemaVersion: z.literal(1),
  models: z.record(z.string(), ModelHealthSchema),
});
export type ModelHealthData = z.infer<typeof ModelHealthDataSchema>;

let file: string | undefined;
let data: ModelHealthData = { schemaVersion: 1, models: {} };

/** worker から呼ぶ。以降の動画の結果をこのファイルに記録する。 */
export function useModelHealthFile(path: string | undefined): void {
  file = path;
  data = path && fs.existsSync(path)
    ? ModelHealthDataSchema.parse(JSON.parse(fs.readFileSync(path, "utf8")))
    : { schemaVersion: 1, models: {} };
}

/** テスト用: ファイルを使わずに状態を差し替える。 */
export function setModelHealthState(next: ModelHealthData): void {
  file = undefined;
  data = ModelHealthDataSchema.parse(next);
}

export function modelHealthState(): ModelHealthData {
  return data;
}

export function isVideoModelPaused(model: string, now = Date.now()): boolean {
  const until = data.models[model]?.pausedUntil;
  return Boolean(until && Date.parse(until) > now);
}

/** 動画の呼び出しの結果を記録する。ok は応答が返ったとき、失敗は 503・通信エラーのときだけ渡す。 */
export function recordVideoOutcome(model: string, outcome: { ok: true } | { ok: false; status?: number }, now = Date.now()): void {
  const prior = data.models[model];
  if (outcome.ok) {
    if (!prior) return;
    data.models[model] = { videoFailures: 0, pauses: 0, updatedAt: new Date(now).toISOString() };
  } else {
    const videoFailures = (prior?.videoFailures ?? 0) + 1;
    let pauses = prior?.pauses ?? 0;
    let pausedUntil = prior?.pausedUntil;
    if (videoFailures >= VIDEO_FAILURES_BEFORE_PAUSE) {
      // 止めた後の最初の1回で再び失敗したら、すぐにもっと長く止める。
      const ms = Math.min(VIDEO_PAUSE_MAX_MS, VIDEO_PAUSE_BASE_MS * 2 ** pauses);
      pauses++;
      pausedUntil = new Date(now + ms).toISOString();
      console.warn(`[Gemini ${model}] ${videoFailures} video calls in a row failed (last ${outcome.status ?? "network error"}); pausing video calls to this model until ${pausedUntil}.`);
    }
    data.models[model] = {
      videoFailures, pauses, updatedAt: new Date(now).toISOString(),
      ...(pausedUntil ? { pausedUntil } : {}),
      ...(outcome.status !== undefined ? { lastStatus: outcome.status } : {}),
    };
  }
  if (file) fs.writeFileSync(file, JSON.stringify(ModelHealthDataSchema.parse(data), null, 2) + "\n");
}
