/**
 * 投稿者単位のブートストラップ (設計書 §6.6)
 *
 * 関連投稿・判定不能投稿を1件以上持つ著者全体を復元抽出する (応援者だけを抽出すると
 * 純度の分母が動かないため)。同じ著者が複数回選ばれたら、別の応援者として数える。
 * 正規化基準・winsorize の上限は固定したまま再計算する。
 */
import type { ScoreBaseline } from "./baseline";
import { BOOTSTRAP_ITERATIONS, CI_QUANTILES } from "./config";
import { normalizeComponents, rawComponents, totalScore, type ScoringContext } from "./scoring";
import { createSeededRng, quantileSorted } from "./stats";
import type { AuthorContribution } from "./types";

/** 再標本ごとの S (昇順) */
export function bootstrapScores(
  authors: readonly AuthorContribution[],
  ctx: ScoringContext,
  baseline: ScoreBaseline,
  options: { seed: number; iterations?: number }
): number[] {
  const n = authors.length;
  if (n === 0) return [];
  const iterations = options.iterations ?? BOOTSTRAP_ITERATIONS;
  const rng = createSeededRng(options.seed);
  const sample: AuthorContribution[] = new Array(n);
  const scores: number[] = [];
  for (let b = 0; b < iterations; b++) {
    for (let i = 0; i < n; i++) sample[i] = authors[Math.floor(rng() * n)];
    scores.push(totalScore(normalizeComponents(rawComponents(sample, ctx), baseline)).score);
  }
  return scores.sort((a, b) => a - b);
}

/** 95% 信頼区間。再標本が無ければ null */
export function confidenceInterval(sortedScores: readonly number[]): [number, number] | null {
  const lo = quantileSorted(sortedScores, CI_QUANTILES[0]);
  const hi = quantileSorted(sortedScores, CI_QUANTILES[1]);
  return lo === null || hi === null ? null : [lo, hi];
}
