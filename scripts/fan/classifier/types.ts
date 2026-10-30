/**
 * 分類器のインターフェース。実装は PR 4 の Claude CLI 分類器と、テスト用の mock.ts。
 *
 * 返すのはラベルと数値・コードだけ (設計書 §5.2)。理由の自由記述は受け取らない。
 */
import type { ReasonCode, SupportLabel } from "../../../src/lib/fan/types";
import type { EphemeralPost } from "../providers/types";

export interface PostClassification {
  teamKey: string;
  label: SupportLabel;
  supportStrength: number;
  confidence: number;
  reasonCode: ReasonCode;
}

export interface ClassifyContext {
  /** この投稿を取得した検索クエリのチーム */
  queryTeamKey: string;
}

export interface Classifier {
  /** classifier_version として保存する */
  readonly version: string;
  /**
   * 投稿IDごとの分類結果。その投稿だけ分類に失敗したら null、結果に無い投稿も失敗として扱う。
   * 分類器そのものが使えない (利用上限など) ときは ClassifierUnavailableError を投げる。
   */
  classify(posts: readonly EphemeralPost[], ctx: ClassifyContext): Promise<Map<string, PostClassification[] | null>>;
}

export class ClassifierUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassifierUnavailableError";
  }
}
