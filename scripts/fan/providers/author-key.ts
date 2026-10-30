/**
 * 著者IDの HMAC 化 (設計書 §4.4・§8.3)
 *
 * 秘密鍵はシーズンごとに作り直し、旧鍵は破棄する (シーズンをまたいだ追跡を防ぐ)。
 */
import { createHmac } from "node:crypto";

export function hashAuthorId(secret: string, rawAuthorId: string): string {
  if (!secret) throw new Error("hashAuthorId: secret is empty");
  return createHmac("sha256", secret).update(rawAuthorId).digest("hex").slice(0, 32);
}

export function authorHmacSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTHOR_HMAC_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTHOR_HMAC_SECRET must be at least 32 characters");
  return secret;
}
