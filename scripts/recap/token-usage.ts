import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { usageDay } from "./usage";

export const TokenCountsSchema = z.object({
  inputTokens: z.number().nonnegative().optional(), cachedInputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(), thoughtTokens: z.number().nonnegative().optional(), totalTokens: z.number().nonnegative().optional(),
});
export type TokenCounts = z.infer<typeof TokenCountsSchema>;
const TotalsSchema = z.object({ responses: z.number(), tokens: z.record(z.string(), z.number()), observations: z.record(z.string(), z.number()) });
// 節ごとの集計。費用の計測 (2026-11、有料クレジットで1週間分を解析) のため、日付ではなく節で足し上げる。
// failures は応答が返らなかった要求の HTTP ステータスごとの回数 (失敗した要求にも料金がかかるかを請求額と突き合わせる)。
const SectionTotalsSchema = TotalsSchema.extend({ failures: z.record(z.string(), z.number()).default({}) });
const LogSchema = z.object({
  schemaVersion: z.literal(1), days: z.record(z.string(), z.record(z.string(), TotalsSchema)),
  sections: z.record(z.string(), z.record(z.string(), SectionTotalsSchema)).default({}),
  seenIds: z.array(z.string()),
});
type Log = z.infer<typeof LogSchema>;

let currentSection: string | undefined;
/** 以降の Gemini/Codex の使用量を、この節の分として記録する。 */
export function setTokenUsageSection(section: string | undefined): void {
  currentSection = section;
}

const usageFile = () => process.env.RECAP_TOKEN_USAGE_FILE ?? path.resolve("src/data/recap-token-usage.json");
function loadLog(file: string): Log {
  return fs.existsSync(file) ? LogSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) : { schemaVersion: 1, days: {}, sections: {}, seenIds: [] };
}
function sectionTotals(data: Log, key: string) {
  if (!currentSection) return undefined;
  const groups = data.sections[currentSection] ??= {};
  return groups[key] ??= { responses: 0, tokens: {}, observations: {}, failures: {} };
}

/** 応答が返らなかった要求を節ごとに数える。日付の集計は変えない。 */
export function recordFailedRequest(event: { provider: "gemini"; model: string; purpose: string; status?: number }): void {
  if (!currentSection) return;
  const file = usageFile();
  const data = loadLog(file);
  const totals = sectionTotals(data, `${event.provider}:${event.purpose}:${event.model}`)!;
  const status = String(event.status ?? "network");
  totals.failures[status] = (totals.failures[status] ?? 0) + 1;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
export function geminiTokenCounts(data: any): TokenCounts | undefined {
  const usage = data.usage ?? data.usageMetadata;
  if (!usage) return undefined;
  const fields: Record<keyof TokenCounts, unknown> = {
    inputTokens: usage.total_input_tokens ?? usage.promptTokenCount,
    cachedInputTokens: usage.total_cached_tokens ?? usage.cachedContentTokenCount,
    outputTokens: usage.total_output_tokens ?? usage.candidatesTokenCount,
    thoughtTokens: usage.total_thought_tokens ?? usage.thoughtsTokenCount,
    totalTokens: usage.total_tokens ?? usage.totalTokenCount,
  };
  const counts = Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0));
  return Object.keys(counts).length ? TokenCountsSchema.parse(counts) : undefined;
}
/** Store observed provider counts; missing fields stay distinguishable from zero. */
export function recordTokenUsage(event: { provider: "gemini" | "codex"; model: string; purpose: string; usage?: TokenCounts; id?: string }): void {
  if (!event.usage) return;
  const file = usageFile();
  const data = loadLog(file);
  if (event.id && data.seenIds.includes(event.id)) return;
  const day = usageDay();
  const key = `${event.provider}:${event.purpose}:${event.model}`;
  const groups = data.days[day] ??= {};
  const totals = groups[key] ??= { responses: 0, tokens: {}, observations: {} };
  const bySection = sectionTotals(data, key);
  for (const target of bySection ? [totals, bySection] : [totals]) {
    target.responses++;
    for (const [field, value] of Object.entries(TokenCountsSchema.parse(event.usage))) {
      if (value === undefined) continue;
      target.tokens[field] = (target.tokens[field] ?? 0) + value;
      target.observations[field] = (target.observations[field] ?? 0) + 1;
    }
  }
  if (event.id) data.seenIds = [...data.seenIds, event.id].slice(-2000);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
