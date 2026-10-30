/**
 * ファン応援指数 (Fan Engagement) の型
 *
 * ここで扱うのは分類済みのラベル・数値だけで、投稿本文は含まない。
 * 投稿ID・著者キーは自宅サーバーのローカル DB 内でだけ使い、公開データには出さない。
 */

export const SUPPORT_LABELS = ["support", "neutral", "criticism", "unrelated", "uncertain"] as const;
export type SupportLabel = (typeof SUPPORT_LABELS)[number];

/** 応援種別 (設計書 §5.3)。応援以外のラベルは not_applicable */
export const REASON_CODES = [
  "explicit_cheering",
  "post_loss_encouragement",
  "post_win_celebration",
  "player_focused",
  "viewing_declaration",
  "team_identity",
  "other_support",
  "not_applicable",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** 観測時点のエンゲージメント数。取得できなかった項目は null */
export interface EngagementCounts {
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
}

/** 1投稿 × 1チームの分類結果 (複数チームに言及した投稿はチームごとに1件) */
export interface ClassifiedPost {
  postId: string;
  teamKey: string;
  /** HMAC 化済みの著者キー */
  authorKey: string;
  /** 投稿日時 (epoch ms) */
  createdAt: number;
  label: SupportLabel;
  /** 支持表現の強さ 0〜1 */
  supportStrength: number;
  reasonCode: ReasonCode;
  engagement: EngagementCounts | null;
  /** 投稿からエンゲージメントを観測するまでの経過時間 (時間)。未観測なら null */
  engagementAgeHours: number | null;
}

/** 寄与上限を適用した後の、著者ごとの寄与 */
export interface AuthorContribution {
  authorKey: string;
  /** 関連投稿数 (support + neutral + criticism) */
  relevant: number;
  support: number;
  neutral: number;
  criticism: number;
  uncertain: number;
  /** 応援投稿の support_strength */
  strengths: number[];
  /** 応援投稿のうち、エンゲージメントを使える投稿の e = log(1 + …) (winsorize 前) */
  engagements: number[];
}

export interface TeamCounts {
  relevant: number;
  support: number;
  neutral: number;
  criticism: number;
  uncertain: number;
  uniqueSupporters: number;
}

export type QualityStatus = "sufficient" | "reference" | "limited" | "insufficient";
