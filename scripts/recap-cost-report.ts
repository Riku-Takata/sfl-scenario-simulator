/**
 * 節ごとの Gemini の使用量から費用を見積もる。
 *   npx tsx scripts/recap-cost-report.ts [section...] [--yen=150]
 * 単価は 2026-11-09 に公式の料金ページで確認した有料枠の値 (USD / 100万トークン)。
 * 3.8-flash / 3.6-flash は 2027-01-01 から倍になる。出力には思考トークンを含める。
 * 請求額との突き合わせ用で、応答が返らなかった要求 (failures) の費用は含めない。
 */
import fs from "node:fs";
import path from "node:path";

const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, cachedInput: 0.075, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, cachedInput: 0.075, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, cachedInput: 0.03, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, cachedInput: 0.025, output: 1.5 },
};

const args = process.argv.slice(2);
const yen = Number(args.find((arg) => arg.startsWith("--yen="))?.slice(6) ?? "0");
const only = args.filter((arg) => !arg.startsWith("--"));
const file = process.env.RECAP_TOKEN_USAGE_FILE ?? path.resolve("src/data/recap-token-usage.json");
const sections: Record<string, Record<string, { responses: number; tokens: Record<string, number>; failures?: Record<string, number> }>> =
  JSON.parse(fs.readFileSync(file, "utf8")).sections ?? {};

let grand = 0;
for (const [section, groups] of Object.entries(sections)) {
  if (only.length && !only.includes(section)) continue;
  let sectionCost = 0;
  console.log(`== ${section}`);
  for (const [key, totals] of Object.entries(groups)) {
    const [provider, purpose, model] = key.split(":");
    if (provider !== "gemini") continue;
    const price = PRICES[model];
    const input = totals.tokens.inputTokens ?? 0;
    const cached = totals.tokens.cachedInputTokens ?? 0;
    const output = (totals.tokens.outputTokens ?? 0) + (totals.tokens.thoughtTokens ?? 0);
    const cost = price ? ((input - cached) * price.input + cached * price.cachedInput + output * price.output) / 1_000_000 : NaN;
    if (Number.isFinite(cost)) sectionCost += cost;
    const failures = Object.entries(totals.failures ?? {}).map(([status, count]) => `${status}×${count}`).join(" ");
    console.log(`  ${purpose.padEnd(10)} ${model.padEnd(22)} responses ${String(totals.responses).padStart(3)}  in ${input}  out+thought ${output}  $${cost.toFixed(4)}${failures ? `  failed: ${failures}` : ""}`);
  }
  grand += sectionCost;
  console.log(`  total $${sectionCost.toFixed(4)}${yen ? ` (¥${Math.round(sectionCost * yen)})` : ""}`);
}
console.log(`== all $${grand.toFixed(4)}${yen ? ` (¥${Math.round(grand * yen)})` : ""}`);
