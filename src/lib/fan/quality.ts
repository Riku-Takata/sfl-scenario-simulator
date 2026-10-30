/**
 * データ品質の判定 (設計書 §6.8)
 *
 * 優先順は insufficient > limited > reference > sufficient。
 * stale は閲覧時点で決まるため、スナップショットには入れず、表示側で isStale を使う。
 */
import { QUALITY_THRESHOLDS } from "./config";
import type { QualityStatus } from "./types";

export interface QualityInput {
  relevant: number;
  uncertain: number;
  /** 分類に失敗した投稿数 (本文を取り直せないので件数だけ持つ) */
  classificationFailures: number;
  /** 取得上限・予算不足でページ取得を打ち切った */
  truncated: boolean;
  baselineProvisional: boolean;
}

export function assessQuality(input: QualityInput): QualityStatus {
  if (input.relevant < QUALITY_THRESHOLDS.minRelevant) return "insufficient";

  const unclear = input.uncertain + input.classificationFailures;
  const unclearRatio = unclear / (input.relevant + unclear);
  if (input.truncated || unclearRatio > QUALITY_THRESHOLDS.maxUncertainRatio) return "limited";

  if (input.relevant < QUALITY_THRESHOLDS.sufficientRelevant || input.baselineProvisional) return "reference";
  return "sufficient";
}

export function isStale(updatedAt: string | Date, now: Date = new Date()): boolean {
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  return now.getTime() - updated.getTime() >= QUALITY_THRESHOLDS.staleHours * 3600_000;
}
