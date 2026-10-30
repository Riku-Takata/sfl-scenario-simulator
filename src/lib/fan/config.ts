/**
 * スコア v2.0 の定数 (設計書 §6・§7)。値を変えたら SCORE_VERSION も上げる。
 */

export const SCORE_VERSION = "v2.0";

/** S = 0.40·V + 0.35·T + 0.25·P (仮説。Spearman 相関で検証して調整する) */
export const SCORE_WEIGHTS = { volume: 0.4, intensity: 0.35, purity: 0.25 } as const;

/** T_raw = 0.6·mean(h) + 0.4·mean(e*) / E_ref */
export const INTENSITY_WEIGHTS = { strength: 0.6, engagement: 0.4 } as const;

/** 投稿者1人あたり、時間窓内で数える投稿の上限 K (強度の高い順) */
export const MAX_POSTS_PER_AUTHOR = 3;

/** 純度の縮小推定に使うベータ事前分布の強さ κ */
export const PURITY_PRIOR_STRENGTH = 20;
/** 基準期間に関連投稿が無いときの p̄ */
export const DEFAULT_PURITY_PRIOR_MEAN = 0.5;

/** e を winsorize する分位点 (集計窓内の全チーム) */
export const ENGAGEMENT_WINSOR_QUANTILE = 0.95;
/** 投稿から観測までがこれより短い投稿は、エンゲージメントが伸びきっていないので T に使わない */
export const MIN_ENGAGEMENT_AGE_HOURS = 12;

/** 正規化基準に必要な日数。これ未満は暫定 */
export const BASELINE_FULL_DAYS = 28;

export const BOOTSTRAP_ITERATIONS = 1000;
export const CI_QUANTILES = [0.025, 0.975] as const;

export const QUALITY_THRESHOLDS = {
  /** これ以上で sufficient */
  sufficientRelevant: 50,
  /** これ未満はスコアを出さない */
  minRelevant: 10,
  /** (判定不能 + 分類失敗) の割合がこれを超えたら limited */
  maxUncertainRatio: 0.3,
  /** 最終更新からこれ以上経ったら stale */
  staleHours: 36,
} as const;

/** 公開する集計セルの最小値 (これ未満は抑制する) */
export const DISCLOSURE_MIN_CELL = 10;
