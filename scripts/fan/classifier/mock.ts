/** テスト用の分類器。作例テキストのキーワードで決める */
import {
  ClassifierUnavailableError,
  type Classifier,
  type ClassifyContext,
  type PostClassification,
} from "./types";
import type { EphemeralPost } from "../providers/types";

export class MockClassifier implements Classifier {
  readonly version = "mock:keyword:1";
  /** classify に渡された本文 (テストで reveal できたことを確かめる) */
  readonly seenTexts: string[] = [];
  calls = 0;

  constructor(
    private readonly options: {
      /** この投稿IDは分類に失敗する */
      failPostIds?: ReadonlySet<string>;
      /** この回数目以降の呼び出しは分類器が使えない (1始まり) */
      unavailableFromCall?: number;
    } = {}
  ) {}

  async classify(
    posts: readonly EphemeralPost[],
    ctx: ClassifyContext
  ): Promise<Map<string, PostClassification[] | null>> {
    this.calls++;
    if (this.options.unavailableFromCall !== undefined && this.calls >= this.options.unavailableFromCall) {
      throw new ClassifierUnavailableError("usage limit reached");
    }
    const out = new Map<string, PostClassification[] | null>();
    for (const post of posts) {
      if (this.options.failPostIds?.has(post.postId)) {
        out.set(post.postId, null);
        continue;
      }
      const text = post.text.reveal();
      this.seenTexts.push(text);
      out.set(post.postId, [{ teamKey: ctx.queryTeamKey, ...judge(text), confidence: 0.9 }]);
    }
    return out;
  }
}

function judge(text: string): Omit<PostClassification, "teamKey" | "confidence"> {
  if (text.includes("負け") && text.includes("次")) {
    return { label: "support", supportStrength: 0.7, reasonCode: "post_loss_encouragement" };
  }
  if (text.includes("頑張れ") || text.includes("応援")) {
    return { label: "support", supportStrength: 0.9, reasonCode: "explicit_cheering" };
  }
  if (text.includes("最悪")) return { label: "criticism", supportStrength: 0, reasonCode: "not_applicable" };
  if (text.includes("観た")) return { label: "neutral", supportStrength: 0, reasonCode: "not_applicable" };
  if (text.includes("関係ない")) return { label: "unrelated", supportStrength: 0, reasonCode: "not_applicable" };
  return { label: "uncertain", supportStrength: 0, reasonCode: "not_applicable" };
}
