/**
 * テスト・試走用の Provider。呼び出しごとの応答を台本で決める。
 *
 * Flovia と同じく operation_id で冪等にふるまう: 実行済みの operation_id で再送されたら
 * 同じページを返し、課金は operation_id ごとに1回だけ数える。
 */
import { hashAuthorId } from "./author-key";
import {
  ProviderConfigError,
  ProviderCursorError,
  ProviderRateLimitError,
  ProviderUnknownError,
  SecretText,
  type EphemeralPost,
  type QuotaStatus,
  type SearchPage,
  type SearchRequest,
  type XSearchProvider,
} from "./types";
import type { EngagementCounts } from "../../../src/lib/fan/types";

export interface MockPostInput {
  postId: string;
  createdAt: number;
  text: string;
  rawAuthorId: string;
  engagement?: EngagementCounts | null;
}

export type MockStep =
  | { page: MockPostInput[]; nextCursor?: string | null; quota?: QuotaStatus }
  | { error: "rate_limit"; retryAt?: string }
  /** executed: true なら実行・課金された後に結果が分からなくなった */
  | { error: "unknown"; executed?: boolean }
  | { error: "config" }
  | { error: "cursor" };

export class MockXProvider implements XSearchProvider {
  readonly requests: SearchRequest[] = [];
  /** 課金された operation_id */
  readonly charged = new Set<string>();
  private readonly executed = new Map<string, SearchPage>();
  private step = 0;

  constructor(
    private readonly steps: MockStep[],
    private readonly secret: string,
    private readonly status: QuotaStatus = { fiveHourUsedPct: 10, weekUsedPct: 10 }
  ) {}

  async quota(): Promise<QuotaStatus> {
    return this.status;
  }

  async searchRecent(request: SearchRequest): Promise<SearchPage> {
    this.requests.push(request);
    const replay = this.executed.get(request.operationId);
    if (replay) return replay;

    const step = this.steps[this.step++];
    if (!step) return { posts: [], nextCursor: null, quota: null };
    if ("error" in step) {
      switch (step.error) {
        case "rate_limit":
          throw new ProviderRateLimitError("rate limited", step.retryAt ?? null);
        case "config":
          throw new ProviderConfigError("unauthorized");
        case "cursor":
          throw new ProviderCursorError("cursor rejected");
        case "unknown":
          if (step.executed) {
            // 実行はされたので、同じ operation_id の再送には次の台本のページを返す
            const next = this.steps[this.step++];
            if (next && "page" in next) this.executed.set(request.operationId, this.toPage(next));
            this.charged.add(request.operationId);
          }
          throw new ProviderUnknownError("upstream timeout");
      }
    }
    const page = this.toPage(step);
    this.executed.set(request.operationId, page);
    this.charged.add(request.operationId);
    return page;
  }

  private toPage(step: Extract<MockStep, { page: unknown }>): SearchPage {
    return {
      posts: step.page.map((p): EphemeralPost => ({
        postId: p.postId,
        createdAt: p.createdAt,
        text: new SecretText(p.text),
        authorKey: hashAuthorId(this.secret, p.rawAuthorId),
        lang: "ja",
        engagement: p.engagement ?? null,
      })),
      nextCursor: step.nextCursor ?? null,
      quota: step.quota ?? null,
    };
  }
}
