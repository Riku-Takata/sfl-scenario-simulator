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
const LogSchema = z.object({ schemaVersion: z.literal(1), days: z.record(z.string(), z.record(z.string(), TotalsSchema)), seenIds: z.array(z.string()) });
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
  const file = process.env.RECAP_TOKEN_USAGE_FILE ?? path.resolve("src/data/recap-token-usage.json");
  const data = fs.existsSync(file) ? LogSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) : { schemaVersion: 1 as const, days: {}, seenIds: [] };
  if (event.id && data.seenIds.includes(event.id)) return;
  const day = usageDay();
  const key = `${event.provider}:${event.purpose}:${event.model}`;
  const groups = data.days[day] ??= {};
  const totals = groups[key] ??= { responses: 0, tokens: {}, observations: {} };
  totals.responses++;
  for (const [field, value] of Object.entries(TokenCountsSchema.parse(event.usage))) {
    if (value === undefined) continue;
    totals.tokens[field] = (totals.tokens[field] ?? 0) + value;
    totals.observations[field] = (totals.observations[field] ?? 0) + 1;
  }
  if (event.id) data.seenIds = [...data.seenIds, event.id].slice(-2000);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
