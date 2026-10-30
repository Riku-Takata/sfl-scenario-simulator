/**
 * 正規化の固定基準 (設計書 §6.4・ADR-006)
 *
 * ランキングは7日窓なので、基準も「毎日計算した直近7日窓の V_raw / T_raw」を
 * 全対象チームぶん集めたものにする (窓の長さをそろえないとパーセンタイルが偏る)。
 */
import { BASELINE_FULL_DAYS, DEFAULT_PURITY_PRIOR_MEAN } from "./config";
import { quantile } from "./stats";

export interface ScoreBaseline {
  version: string;
  periodStart: string;
  periodEnd: string;
  /** 昇順 */
  volumeRaw: number[];
  /** 昇順 */
  intensityRaw: number[];
  /** 全チームの応援比率 p̄ (純度の事前分布の平均) */
  purityPriorMean: number;
  /** e* の中央値。エンゲージメントを使わないときは null */
  engagementRef: number | null;
  /** 基準期間の日数が BASELINE_FULL_DAYS 未満 */
  provisional: boolean;
}

/** 基準期間の1日・1チームぶん (その日を終点とする7日窓の値) */
export interface BaselineEntry {
  volumeRaw: number;
  intensityRaw: number;
  relevant: number;
  support: number;
}

/** p̄ = Σ応援 / Σ関連。関連投稿が無ければ 0.5 */
export function purityPriorMean(entries: readonly Pick<BaselineEntry, "relevant" | "support">[]): number {
  let relevant = 0;
  let support = 0;
  for (const e of entries) {
    relevant += e.relevant;
    support += e.support;
  }
  return relevant > 0 ? support / relevant : DEFAULT_PURITY_PRIOR_MEAN;
}

/**
 * E_ref = 基準期間の e* (winsorize 後) の中央値。
 * T_raw の計算に E_ref が要るので、基準の T_raw を出す前にこれを先に決める。
 */
export function engagementRef(cappedEngagements: readonly number[]): number | null {
  const median = quantile(cappedEngagements, 0.5);
  return median !== null && median > 0 ? median : null;
}

export function buildBaseline(input: {
  version: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  entries: readonly BaselineEntry[];
  engagementRef: number | null;
}): ScoreBaseline {
  if (input.entries.length === 0) throw new Error("buildBaseline: no entries");
  return {
    version: input.version,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    volumeRaw: input.entries.map((e) => e.volumeRaw).sort((a, b) => a - b),
    intensityRaw: input.entries.map((e) => e.intensityRaw).sort((a, b) => a - b),
    purityPriorMean: purityPriorMean(input.entries),
    engagementRef: input.engagementRef,
    provisional: input.days < BASELINE_FULL_DAYS,
  };
}
