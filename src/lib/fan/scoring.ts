/**
 * V / T / P と総合スコア S (設計書 §6.3〜§6.5)
 *
 * rawComponents は著者の寄与の並びから計算するので、点推定とブートストラップの
 * 再標本 (同じ著者が重複して並ぶ) の両方に同じ関数を使える。
 */
import type { ScoreBaseline } from "./baseline";
import {
  ENGAGEMENT_WINSOR_QUANTILE,
  INTENSITY_WEIGHTS,
  PURITY_PRIOR_STRENGTH,
  SCORE_WEIGHTS,
} from "./config";
import { percentileRank, quantile } from "./stats";
import type { AuthorContribution } from "./types";

/** 集計窓で共通の値。ブートストラップ中も固定する */
export interface ScoringContext {
  purityPriorMean: number;
  /** null ならエンゲージメントを使わず T_raw = mean(h) */
  engagementRef: number | null;
  /** 集計窓内の全チームの e の 95 パーセンタイル */
  engagementCap: number | null;
}

export interface RawComponents {
  volumeRaw: number;
  intensityRaw: number;
  /** 縮小推定後の純度 P̃ (0〜1) */
  purity: number;
  /** 生の比率 N_sup / N_rel。関連投稿が無ければ null */
  purityRaw: number | null;
  /** このチームの T にエンゲージメントを使えたか */
  engagementAvailable: boolean;
}

export interface NormalizedComponents {
  volume: number;
  intensity: number;
  purity: number;
}

export interface ScoreBreakdown {
  score: number;
  contribution: NormalizedComponents;
}

/** 全チームの e をまとめて winsorize の上限を決める */
export function engagementCap(authorsByTeam: readonly (readonly AuthorContribution[])[]): number | null {
  const all: number[] = [];
  for (const authors of authorsByTeam) for (const a of authors) all.push(...a.engagements);
  return quantile(all, ENGAGEMENT_WINSOR_QUANTILE);
}

/** P̃ = (N_sup + α) / (N_rel + α + β)、α = κ·p̄、β = κ·(1 − p̄) */
export function shrunkPurity(
  support: number,
  relevant: number,
  priorMean: number,
  priorStrength: number = PURITY_PRIOR_STRENGTH
): number {
  const alpha = priorStrength * priorMean;
  const beta = priorStrength * (1 - priorMean);
  return (support + alpha) / (relevant + alpha + beta);
}

export function rawComponents(authors: readonly AuthorContribution[], ctx: ScoringContext): RawComponents {
  let relevant = 0;
  let support = 0;
  let supporters = 0;
  let strengthSum = 0;
  let strengthCount = 0;
  let engagementSum = 0;
  let engagementCount = 0;
  for (const a of authors) {
    relevant += a.relevant;
    support += a.support;
    if (a.support > 0) supporters++;
    for (const h of a.strengths) {
      strengthSum += h;
      strengthCount++;
    }
    for (const e of a.engagements) {
      engagementSum += ctx.engagementCap === null ? e : Math.min(e, ctx.engagementCap);
      engagementCount++;
    }
  }

  const meanStrength = strengthCount > 0 ? strengthSum / strengthCount : 0;
  let intensityRaw = meanStrength;
  let engagementAvailable = false;
  if (ctx.engagementRef !== null) {
    // このチームに使えるエンゲージメントが無いときは、e の項を基準の中央値 (= 1) として扱い、
    // 他チームと同じ尺度を保つ
    const engagementTerm = engagementCount > 0 ? engagementSum / engagementCount / ctx.engagementRef : 1;
    engagementAvailable = engagementCount > 0;
    intensityRaw = INTENSITY_WEIGHTS.strength * meanStrength + INTENSITY_WEIGHTS.engagement * engagementTerm;
  }

  return {
    volumeRaw: Math.log(1 + supporters),
    intensityRaw,
    purity: shrunkPurity(support, relevant, ctx.purityPriorMean),
    purityRaw: relevant > 0 ? support / relevant : null,
    engagementAvailable,
  };
}

/** V・T は基準分布のパーセンタイル順位、P は P̃ × 100 */
export function normalizeComponents(raw: RawComponents, baseline: ScoreBaseline): NormalizedComponents {
  return {
    volume: percentileRank(raw.volumeRaw, baseline.volumeRaw),
    intensity: percentileRank(raw.intensityRaw, baseline.intensityRaw),
    purity: raw.purity * 100,
  };
}

export function totalScore(components: NormalizedComponents): ScoreBreakdown {
  const contribution: NormalizedComponents = {
    volume: SCORE_WEIGHTS.volume * components.volume,
    intensity: SCORE_WEIGHTS.intensity * components.intensity,
    purity: SCORE_WEIGHTS.purity * components.purity,
  };
  return { score: contribution.volume + contribution.intensity + contribution.purity, contribution };
}
