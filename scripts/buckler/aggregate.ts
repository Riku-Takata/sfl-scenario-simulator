/**
 * ローカルの Buckler データ → 公開用集計 JSON
 *
 *   npx tsx scripts/buckler/aggregate.ts [--out <dir>]   (既定: src/data)
 *
 * 出力: buckler-profiles.json (選手別のランクマ集計), buckler-dia.json (最新月の公式ダイアグラム)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BucklerStore } from "./store";
import { buildBucklerProfile, pickDiaBlock } from "../../src/lib/buckler/aggregate";
import { BucklerDiaDataSchema, BucklerProfilesDataSchema } from "../../src/lib/schema";
import type { BucklerProfilesData } from "../../src/lib/types";

const DIA_VARIANT = "dia_master";

export function runAggregate(argv = process.argv.slice(2)): void {
  const i = argv.indexOf("--out");
  const outDir = path.resolve(i >= 0 ? argv[i + 1] : path.resolve(process.cwd(), "src/data"));
  const store = new BucklerStore();
  const now = new Date().toISOString();

  const players: BucklerProfilesData["players"] = {};
  for (const sflKey of Object.keys(store.cfnIds().players).sort()) {
    const profile = buildBucklerProfile(sflKey, store.matches(sflKey), store.snapshots(sflKey));
    if (profile) players[sflKey] = profile;
  }
  const profiles = BucklerProfilesDataSchema.parse({
    updatedAt: now,
    source: "Buckler's Boot Camp (CAPCOM) のプロフィール・対戦ログを自宅サーバーで日次集計",
    players,
  });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "buckler-profiles.json"),
    JSON.stringify(profiles, null, 1) + "\n",
    "utf8"
  );
  console.log(`[buckler] buckler-profiles.json: ${Object.keys(players).length} players -> ${outDir}`);

  const month = store.diaMonths(DIA_VARIANT).at(-1);
  const dia = month ? store.dia(DIA_VARIANT, month) : null;
  const block = dia ? pickDiaBlock(dia) : null;
  if (dia && block) {
    const data = BucklerDiaDataSchema.parse({
      updatedAt: now,
      source: "Buckler's Boot Camp (CAPCOM) 公式ダイアグラム",
      month: dia.month,
      variant: dia.variant,
      block: block.key,
      chars: block.chars,
      matrix: block.matrix,
    });
    fs.writeFileSync(path.join(outDir, "buckler-dia.json"), JSON.stringify(data) + "\n", "utf8");
    console.log(`[buckler] buckler-dia.json: ${dia.month} (${block.chars.length} chars, block ${block.key})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAggregate();
}
