/**
 * 本文をメモリ上だけで保持するバッファ (設計書 §3.1)
 *
 * 分類が終わったら discard() で参照を捨てる。呼び忘れても一定時間で自動的に捨てる。
 * 同じ文面の連投は、正規化した本文のハッシュで検出して1件にまとめる (ハッシュも保存しない)。
 */
import { createHash } from "node:crypto";
import type { EphemeralPost } from "./providers/types";

export const EPHEMERAL_TTL_MS = 10 * 60_000;

export class EphemeralBuffer {
  #posts: EphemeralPost[] | null;
  #timer: NodeJS.Timeout;

  constructor(posts: EphemeralPost[], ttlMs: number = EPHEMERAL_TTL_MS) {
    this.#posts = posts;
    this.#timer = setTimeout(() => this.discard(), ttlMs);
    this.#timer.unref();
  }

  get posts(): readonly EphemeralPost[] {
    if (!this.#posts) throw new Error("EphemeralBuffer: already discarded");
    return this.#posts;
  }

  get discarded(): boolean {
    return this.#posts === null;
  }

  discard(): void {
    clearTimeout(this.#timer);
    this.#posts = null;
  }
}

/** URL・空白・大文字小文字・全角半角の違いを無視した本文のハッシュ (メモリ上でだけ使う) */
export function normalizedTextHash(text: string): string {
  const normalized = text
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}
