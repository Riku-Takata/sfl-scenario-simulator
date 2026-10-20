/**
 * SFL選手の CFN short ID を start.gg から解決し、ローカル (BUCKLER_DATA_DIR/cfn-ids.json) に保存
 *
 * オンライン大会 (World Warrior Japan) の参加登録に Capcom ID が紐付いているため、
 * 対応表 (startgg-identities.json) の player id と一致する参加者の connectedAccounts.capcom を採用する。
 * 公開リポジトリには保存しない。
 *
 *   npx tsx scripts/buckler/resolve-cfn-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { startggQuery } from "../startgg/client";
import { StartggIdentitiesDataSchema } from "../../src/lib/schema";
import { BucklerStore } from "./store";

const TOURNAMENTS = [
  "world-warrior-2026-japan-4",
  "world-warrior-2026-japan-3",
  "world-warrior-2026-japan-2",
  "world-warrior-2026-japan-1",
  "world-warrior-2025-japan-5",
  "world-warrior-2025-japan-4-1",
  "world-warrior-2025-japan-3-1",
];

async function main() {
  const identities = StartggIdentitiesDataSchema.parse(
    JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "src/data/startgg-identities.json"), "utf8")
    )
  );
  const store = new BucklerStore();
  const current = store.cfnIds();
  const players = { ...current.players };

  for (const [key, ident] of Object.entries(identities.players)) {
    if (players[key]) continue;
    const tag = ident.gamerTag.split("/")[0];
    for (const slug of TOURNAMENTS) {
      const data = await startggQuery<{
        tournament: {
          participants: {
            nodes: Array<{
              player: { id: number } | null;
              connectedAccounts: { capcom?: { value?: string } } | null;
            }>;
          };
        } | null;
      }>(
        `query($s:String!,$q:String!){tournament(slug:$s){participants(query:{perPage:10,filter:{search:{fieldsToSearch:["gamerTag"],searchString:$q}}}){nodes{player{id} connectedAccounts}}}}`,
        { s: slug, q: tag }
      );
      const hit = data.tournament?.participants.nodes.find(
        (n) => n.player?.id === ident.startggPlayerId && n.connectedAccounts?.capcom?.value
      );
      if (hit) {
        players[key] = {
          cfnId: String(hit.connectedAccounts!.capcom!.value),
          source: `start.gg ${slug}`,
        };
        break;
      }
    }
    console.log(`[cfn] ${key}: ${players[key] ? "resolved" : "not found"}`);
  }

  store.saveCfnIds({ updatedAt: new Date().toISOString(), players });
  const missing = Object.keys(identities.players).filter((k) => !players[k]);
  console.log(
    `[cfn] ${Object.keys(players).length} resolved. Missing: ${missing.join(", ") || "none"} ` +
      `(手動で ${path.join(store.dir, "cfn-ids.json")} に追記できます)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
