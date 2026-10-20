/**
 * SFL選手 ⇔ start.gg player id の対応付け候補を生成する
 *
 * 国内の大型大会 (EVO Japan / World Warrior Japan) と海外メジャーの standings から
 * gamerTag・プレフィックスを集め、SFL公式の選手名 (日本語/英語) と照合する。
 * 結果は候補一覧として出力するだけで、確定値は src/data/startgg-identities.json を人が編集する。
 *
 *   npx tsx scripts/startgg/resolve-identities.ts > candidates.txt
 */
import fs from "node:fs";
import path from "node:path";
import { startggQuery } from "./client";
import { TEAM_META_MAP } from "../../src/lib/simulator";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const SEED_FILE = path.join(DATA_DIR, "raw-capcom-seed.json");
const IDENTITIES_FILE = path.join(DATA_DIR, "startgg-identities.json");

const SOURCE_EVENTS: Array<{ slug: string; maxPlacement: number }> = [
  { slug: "tournament/evo-japan-2026-presented-by-levtech/event/evo-japan-2026-street-fighter-6", maxPlacement: 1024 },
  { slug: "tournament/world-warrior-2026-japan-1/event/street-fighter-6", maxPlacement: 512 },
  { slug: "tournament/world-warrior-2026-japan-2/event/street-fighter-6", maxPlacement: 512 },
  { slug: "tournament/world-warrior-2026-japan-3/event/street-fighter-6", maxPlacement: 512 },
  { slug: "tournament/world-warrior-2026-japan-4/event/street-fighter-6", maxPlacement: 512 },
  { slug: "tournament/evo-2026/event/street-fighter-6", maxPlacement: 256 },
];

// SFL公式名と start.gg 上の表記が大きく異なる選手の別名
export const EXTRA_ALIASES: Record<string, string[]> = {
  itazan: ["板ザン", "itabashizangief", "itazan"],
  takeuchi: ["takeuchijohn", "johntakeuchi", "竹内ジョン"],
  daigo: ["daigo", "daigothebeast", "umehara", "梅原大吾"],
  mena: ["menard"],
  jr: ["jr", "jr."],
  keib: ["keib", "kei.b"],
  fuudo: ["fuudo", "ふーど"],
  hinao: ["hinao"],
  "2bassa": ["2bassa"],
  adelie: ["adelie", "あでりー", "あでりい"],
};

// start.gg プレフィックスに現れやすいチーム表記
const TEAM_PREFIX_HINTS: Record<string, RegExp> = {
  fav: /fav/i,
  cr: /(^|[\s/|])cr($|[\s/|])|crazy/i,
  sol: /sol|ss熊本|saishunkan/i,
  zeta: /zeta/i,
  ixa: /ixa/i,
  ibsg: /ibsg|ibushigin/i,
  varrel: /varrel/i,
  good8: /g8s|good\s*8/i,
  dng: /dfm|detonation/i,
  oja: /oja/i,
  rc: /reject|^rc$/i,
  rid: /riddle|^rid$/i,
};

export function normalizeTag(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s._\-・〜~～ー'’|]/g, "");
}

interface Seen {
  playerId: number;
  gamerTag: string;
  prefixes: Set<string>;
  userSlug: string | null;
  appearances: number;
  bestPlacement: number;
}

async function collectEntrants(): Promise<Map<number, Seen>> {
  const seen = new Map<number, Seen>();
  const perPage = 64;
  for (const ev of SOURCE_EVENTS) {
    const pages = Math.ceil(ev.maxPlacement / perPage);
    for (let page = 1; page <= pages; page++) {
      const data = await startggQuery<{
        event: {
          standings: {
            nodes: Array<{
              placement: number;
              entrant: {
                participants: Array<{
                  prefix: string | null;
                  player: { id: number; gamerTag: string } | null;
                  user: { slug: string } | null;
                }>;
              } | null;
            }>;
          };
        } | null;
      }>(
        `query($slug:String!,$page:Int!,$perPage:Int!){event(slug:$slug){standings(query:{page:$page,perPage:$perPage}){nodes{placement entrant{participants{prefix player{id gamerTag} user{slug}}}}}}}`,
        { slug: ev.slug, page, perPage }
      );
      const nodes = data.event?.standings.nodes ?? [];
      if (nodes.length === 0) break;
      for (const n of nodes) {
        for (const p of n.entrant?.participants ?? []) {
          if (!p.player) continue;
          const cur = seen.get(p.player.id) ?? {
            playerId: p.player.id,
            gamerTag: p.player.gamerTag,
            prefixes: new Set<string>(),
            userSlug: p.user?.slug ?? null,
            appearances: 0,
            bestPlacement: Number.POSITIVE_INFINITY,
          };
          cur.appearances++;
          cur.bestPlacement = Math.min(cur.bestPlacement, n.placement);
          if (p.prefix) cur.prefixes.add(p.prefix);
          seen.set(p.player.id, cur);
        }
      }
      console.error(`[resolve] ${ev.slug} page ${page}: ${nodes.length} standings`);
    }
  }
  return seen;
}

async function searchParticipants(
  names: string[]
): Promise<Array<{ playerId: number; gamerTag: string; userSlug: string | null }>> {
  const out = new Map<number, { playerId: number; gamerTag: string; userSlug: string | null }>();
  const tournamentSlugs = [...new Set(SOURCE_EVENTS.map((e) => e.slug.split("/event/")[0]))];
  for (const tSlug of tournamentSlugs) {
    for (const name of new Set(names)) {
      const data = await startggQuery<{
        tournament: {
          participants: {
            nodes: Array<{ gamerTag: string; player: { id: number } | null; user: { slug: string } | null }>;
          };
        } | null;
      }>(
        `query($s:String!,$q:String!){tournament(slug:$s){participants(query:{perPage:10,filter:{search:{fieldsToSearch:["gamerTag"],searchString:$q}}}){nodes{gamerTag player{id} user{slug}}}}}`,
        { s: tSlug.replace(/^tournament\//, ""), q: name }
      );
      for (const n of data.tournament?.participants.nodes ?? []) {
        if (n.player) out.set(n.player.id, { playerId: n.player.id, gamerTag: n.gamerTag, userSlug: n.user?.slug ?? null });
      }
    }
  }
  return [...out.values()];
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  const roster: Record<string, { name: string; name_en: string; team: string }> =
    seed.data.players;
  const confirmed: Record<string, unknown> = fs.existsSync(IDENTITIES_FILE)
    ? JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8")).players ?? {}
    : {};

  const seen = await collectEntrants();
  const byTag = new Map<string, Seen[]>();
  for (const s of seen.values()) {
    const k = normalizeTag(s.gamerTag);
    byTag.set(k, [...(byTag.get(k) ?? []), s]);
  }

  for (const [key, p] of Object.entries(roster)) {
    const aliases = new Set(
      [p.name, p.name_en, key, ...(EXTRA_ALIASES[key] ?? [])].map(normalizeTag)
    );
    const teamHint = TEAM_PREFIX_HINTS[p.team];
    const cands = [...aliases]
      .flatMap((a) => byTag.get(a) ?? [])
      .filter((c, i, arr) => arr.findIndex((x) => x.playerId === c.playerId) === i)
      .map((c) => ({
        ...c,
        teamMatch: [...c.prefixes].some((pre) => teamHint?.test(pre)),
      }))
      .sort(
        (a, b) =>
          Number(b.teamMatch) - Number(a.teamMatch) ||
          b.appearances - a.appearances ||
          a.bestPlacement - b.bestPlacement
      );

    const teamShort = TEAM_META_MAP[p.team]?.shortName ?? p.team;
    const mark = confirmed[key] ? "✓" : " ";
    console.log(`${mark} ${key} (${p.name} / ${p.name_en}, ${teamShort})`);
    if (cands.length === 0) {
      // 大会ごとに表記が変わる選手 (例: "REJECT ひなお") は参加者検索で部分一致を探す
      const found = await searchParticipants([p.name, p.name_en]);
      if (found.length === 0) console.log("    (no candidate)");
      for (const f of found) {
        console.log(`    id=${f.playerId} tag=${f.gamerTag} user=${f.userSlug ?? "-"} (participant search)`);
      }
    }
    for (const c of cands.slice(0, 5)) {
      console.log(
        `    id=${c.playerId} tag=${c.gamerTag} prefix=[${[...c.prefixes].join(",")}] ` +
          `user=${c.userSlug ?? "-"} seen=${c.appearances} best=${c.bestPlacement}${c.teamMatch ? " TEAM✓" : ""}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
