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

/** CFN short ID は10桁の数字。登録欄にファイター名などが入っている場合は採用しない */
const CFN_ID_PATTERN = /^\d{10}$/;
const SF6_VIDEOGAME_ID = 43868;
const MAX_SET_PAGES = 40;
const MAX_ONLINE_TOURNAMENTS = 10;

async function capcomIdIn(tournamentSlug: string, tag: string, playerId: number): Promise<string | null> {
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
    { s: tournamentSlug, q: tag }
  );
  const value = data.tournament?.participants.nodes.find((n) => n.player?.id === playerId)
    ?.connectedAccounts?.capcom?.value;
  return value && CFN_ID_PATTERN.test(String(value).trim()) ? String(value).trim() : null;
}

/** 本人の SF6 オンライン大会 (新しい順) の登録から、最も多く使われている CFN ID を採用 */
async function capcomIdFromOwnOnlineEvents(
  tag: string,
  playerId: number
): Promise<{ cfnId: string; source: string } | null> {
  const slugs: string[] = [];
  for (let page = 1; page <= MAX_SET_PAGES && slugs.length < MAX_ONLINE_TOURNAMENTS; page++) {
    const data = await startggQuery<{
      player: {
        sets: {
          nodes: Array<{
            event: { isOnline: boolean | null; videogame: { id: number } | null; tournament: { slug: string } | null } | null;
          }>;
        };
      } | null;
    }>(
      `query($id:ID!,$p:Int!){player(id:$id){sets(page:$p,perPage:40){nodes{event{isOnline videogame{id} tournament{slug}}}}}}`,
      { id: playerId, p: page }
    );
    const nodes = data.player?.sets.nodes ?? [];
    if (nodes.length === 0) break;
    for (const n of nodes) {
      const slug = n.event?.tournament?.slug?.replace(/^tournament\//, "");
      if (n.event?.isOnline && n.event.videogame?.id === SF6_VIDEOGAME_ID && slug && !slugs.includes(slug)) {
        slugs.push(slug);
      }
    }
  }
  const counts = new Map<string, { n: number; slugs: string[] }>();
  for (const slug of slugs.slice(0, MAX_ONLINE_TOURNAMENTS)) {
    const id = await capcomIdIn(slug, tag, playerId);
    if (!id) continue;
    const c = counts.get(id) ?? { n: 0, slugs: [] };
    c.n++;
    c.slugs.push(slug);
    counts.set(id, c);
  }
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  return best ? { cfnId: best[0], source: `start.gg ${best[1].slugs.join(" / ")}` } : null;
}

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
      const cfnId = await capcomIdIn(slug, tag, ident.startggPlayerId);
      if (cfnId) {
        players[key] = { cfnId, source: `start.gg ${slug}` };
        break;
      }
    }
    // World Warrior Japan に出ていない選手 (海外在住など) は、本人が出た SF6 オンライン大会を遡って探す
    if (!players[key]) {
      const found = await capcomIdFromOwnOnlineEvents(tag, ident.startggPlayerId);
      if (found) players[key] = found;
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
