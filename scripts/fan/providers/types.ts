/**
 * X 検索 Provider の共通インターフェース (設計書 §4.4)
 *
 * 本文は SecretText に包み、文字列化・JSON化・console 出力では "[REDACTED]" になるようにする。
 * 本文を読めるのは reveal() を明示的に呼んだ箇所 (分類器) だけ。
 * 著者IDは Provider の中で HMAC 化してから渡す (author-key.ts)。生のIDやユーザー名は外に出さない。
 */
import { inspect } from "node:util";
import type { EngagementCounts } from "../../../src/lib/fan/types";

const REDACTED = "[REDACTED]";

export class SecretText {
  #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

/** 本文を含む。永続化禁止。分類後に破棄する */
export interface EphemeralPost {
  postId: string;
  /** epoch ms */
  createdAt: number;
  text: SecretText;
  /** HMAC 化済み */
  authorKey: string;
  lang: string | null;
  engagement: EngagementCounts | null;
}

export interface QuotaStatus {
  fiveHourUsedPct: number;
  weekUsedPct: number;
}

export interface SearchRequest {
  query: string;
  /** 前ページの next_cursor。新しい取得の始まりでは null */
  cursor: string | null;
  /** これより新しい投稿だけ (前回までに取り切った最新の投稿ID) */
  sinceId: string | null;
  /** UTC。Flovia は直近7日以内しか受け付けない */
  startTime: string;
  maxResults: number;
  /** 冪等キー。結果が分からない呼び出しは同じ値で再送する */
  operationId: string;
}

export interface SearchPage {
  posts: EphemeralPost[];
  nextCursor: string | null;
  /** 呼び出し後の使用率 (返ってくる場合) */
  quota: QuotaStatus | null;
}

export interface XSearchProvider {
  searchRecent(request: SearchRequest): Promise<SearchPage>;
  quota(): Promise<QuotaStatus>;
}

/** 429・利用上限。実行されていないので再送しても重複課金にならないが、その実行は止める */
export class ProviderRateLimitError extends Error {
  constructor(message: string, readonly retryAt: string | null) {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

/** 5xx・タイムアウトなど、実行されたか分からない失敗。同じ operation_id でしか再送しない */
export class ProviderUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnknownError";
  }
}

/** 401/403 など設定の誤り。再試行しない */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/** カーソルが受け付けられなかった (期限切れなど)。続きの取得をやめ、新しい取得からやり直す */
export class ProviderCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCursorError";
  }
}
