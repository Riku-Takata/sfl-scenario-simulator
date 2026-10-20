/**
 * Step 0a: start.gg から SFL全選手の直近プレミア大会の実戦データを取得する
 *
 * - 対応表 src/data/startgg-identities.json の player id ごとに player.sets を新しい順に走査
 * - SF6 かつ premier.ts の判定でプレミア大会と判定されたイベントのセットのみ保持
 * - 取得済みセットに到達したら打ち切る差分取得 (完了済みセットは不変のため)
 * - 出力: src/data/startgg-premier-results.json (Zod検証)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hasStartggToken, startggQuery } from "./startgg/client";
import {
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../src/lib/schema";
import type {
  StartggEvent,
  StartggGame,
  StartggPlacement,
  StartggPremierResultsData,
  StartggSet,
} from "../src/lib/types";
import {
  PREMIER_WINDOW_DAYS,
  SF6_VIDEOGAME_ID,
  classifyPremierEvent,
} from "../src/lib/startgg/premier";
import { normalizeStartggCharName } from "../src/lib/startgg/characters";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const IDENTITIES_FILE = path.join(DATA_DIR, "startgg-identities.json");
export const STARTGG_RESULTS_FILE = path.join(DATA_DIR, "startgg-premier-results.json");

const SETS_PER_PAGE = 20; // 複雑度上限 (1000 objects) 対策
const EVENTS_PER_QUERY = 15;
const MAX_PAGES_PER_PLAYER = 30;
const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000;
// 差分取得時、前回取得より少し前まで遡ってスコア訂正等を拾う
const INCREMENTAL_OVERLAP_SEC = 3 * 24 * 60 * 60;

interface RawSlot {
  entrant: {
    id: number;
    initialSeedNum: number | null;
    standing: { placement: number | null } | null;
    participants: Array<{ player: { id: number; gamerTag: string } | null }>;
  } | null;
  standing: { stats: { score: { value: number | null } | null } | null } | null;
}

interface RawSet {
  id: number | string;
  completedAt: number | null;
  fullRoundText: string | null;
  round: number | null;
  winnerId: number | null;
  phaseGroup: { phase: { name: string | null } | null } | null;
  event: { id: number; videogame: { id: number } | null } | null;
  slots: RawSlot[];
  games: Array<{
    orderNum: number | null;
    winnerId: number | null;
    selections: Array<{
      entrant: { id: number } | null;
      character: { name: string | null } | null;
    }> | null;
  }> | null;
}

const PLAYER_SETS_QUERY = `query($id:ID!,$page:Int!,$perPage:Int!){player(id:$id){gamerTag sets(page:$page,perPage:$perPage){nodes{
  id completedAt fullRoundText round winnerId
  phaseGroup{phase{name}}
  event{id videogame{id}}
  slots{entrant{id initialSeedNum standing{placement} participants{player{id gamerTag}}} standing{stats{score{value}}}}
  games{orderNum winnerId selections{entrant{id} character{name}}}
}}}}`;

function isoDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function loadExisting(): StartggPremierResultsData | null {
  if (!fs.existsSync(STARTGG_RESULTS_FILE)) return null;
  try {
    return StartggPremierResultsDataSchema.parse(
      JSON.parse(fs.readFileSync(STARTGG_RESULTS_FILE, "utf8"))
    );
  } catch (err) {
    console.warn("[Step 0a] Existing start.gg cache is invalid, refetching all:", err);
    return null;
  }
}

async function fetchEventMeta(eventIds: string[]): Promise<Record<string, StartggEvent>> {
  const out: Record<string, StartggEvent> = {};
  for (let i = 0; i < eventIds.length; i += EVENTS_PER_QUERY) {
    const chunk = eventIds.slice(i, i + EVENTS_PER_QUERY);
    const fields = chunk
      .map(
        (id, j) =>
          `e${j}:event(id:${Number(id)}){id slug name numEntrants isOnline startAt videogame{id} tournament{name countryCode}}`
      )
      .join("\n");
    const data = await startggQuery<
      Record<
        string,
        {
          id: number;
          slug: string;
          name: string;
          numEntrants: number | null;
          isOnline: boolean | null;
          startAt: number | null;
          videogame: { id: number } | null;
          tournament: { name: string; countryCode: string | null } | null;
        } | null
      >
    >(`query{${fields}}`);
    for (const ev of Object.values(data)) {
      if (!ev) continue;
      const tournamentName = ev.tournament?.name ?? "";
      out[String(ev.id)] = {
        id: String(ev.id),
        slug: ev.slug,
        tournamentName,
        eventName: ev.name,
        startDate: ev.startAt ? isoDate(ev.startAt) : "",
        numEntrants: ev.numEntrants,
        isOnline: ev.isOnline,
        countryCode: ev.tournament?.countryCode ?? null,
        category: classifyPremierEvent({
          tournamentName,
          eventName: ev.name,
          numEntrants: ev.numEntrants,
          isOnline: ev.isOnline,
          videogameId: ev.videogame?.id ?? null,
        }),
      };
    }
  }
  return out;
}

/** 生のセットを選手視点に正規化。DQ・BYE・未完了は null */
export function normalizeSet(
  raw: RawSet,
  playerId: number
): { set: StartggSet; placement: StartggPlacement | null } | null {
  if (!raw.completedAt || !raw.event) return null;
  const mine = raw.slots.find((s) =>
    s.entrant?.participants.some((p) => p.player?.id === playerId)
  );
  const opp = raw.slots.find((s) => s !== mine);
  if (!mine?.entrant || !opp?.entrant) return null;

  const myEntrantId = mine.entrant.id;
  const oppEntrantId = opp.entrant.id;
  const games: StartggGame[] = [...(raw.games ?? [])]
    .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0))
    .filter((g) => g.winnerId != null)
    .map((g) => {
      const charOf = (entrantId: number) =>
        normalizeStartggCharName(
          g.selections?.find((sel) => sel.entrant?.id === entrantId)?.character?.name
        );
      return {
        won: g.winnerId === myEntrantId,
        myChar: charOf(myEntrantId),
        oppChar: charOf(oppEntrantId),
      };
    });

  const myScoreRaw = mine.standing?.stats?.score?.value;
  const oppScoreRaw = opp.standing?.stats?.score?.value;
  // -1 は DQ
  if (myScoreRaw === -1 || oppScoreRaw === -1) return null;
  const myScore = myScoreRaw ?? games.filter((g) => g.won).length;
  const oppScore = oppScoreRaw ?? games.filter((g) => !g.won).length;
  if (myScore + oppScore === 0) return null;

  const oppPlayer = opp.entrant.participants[0]?.player ?? null;
  const eventId = String(raw.event.id);
  return {
    set: {
      id: String(raw.id),
      eventId,
      completedAt: raw.completedAt,
      round: raw.round,
      roundText: raw.fullRoundText ?? "",
      phaseName: raw.phaseGroup?.phase?.name ?? null,
      mySeed: mine.entrant.initialSeedNum,
      oppSeed: opp.entrant.initialSeedNum,
      oppPlayerId: oppPlayer?.id ?? null,
      oppTag: oppPlayer?.gamerTag ?? "",
      myScore,
      oppScore,
      won: raw.winnerId != null ? raw.winnerId === myEntrantId : myScore > oppScore,
      games,
    },
    placement:
      mine.entrant.standing?.placement != null
        ? {
            eventId,
            placement: mine.entrant.standing.placement,
            seed: mine.entrant.initialSeedNum,
          }
        : null,
  };
}

/** 1イベント・1セット = 1行で書き出し、差分を読みやすくしつつサイズを抑える */
function serializeResults(data: StartggPremierResultsData): string {
  const { events, players, ...meta } = data;
  const metaJson = JSON.stringify(meta, null, 2).slice(0, -2);
  const eventLines = Object.entries(events).map(
    ([id, ev]) => `    ${JSON.stringify(id)}: ${JSON.stringify(ev)}`
  );
  const playerBlocks = Object.entries(players).map(([key, p]) => {
    const { placements, sets, ...head } = p;
    const headJson = JSON.stringify(head).slice(0, -1);
    const setLines = sets.map((s) => `        ${JSON.stringify(s)}`);
    return (
      `    ${JSON.stringify(key)}: ${headJson},\n` +
      `      "placements": ${JSON.stringify(placements)},\n` +
      `      "sets": [\n${setLines.join(",\n")}\n      ]}`
    );
  });
  return (
    `${metaJson},\n  "events": {\n${eventLines.join(",\n")}\n  },\n` +
    `  "players": {\n${playerBlocks.join(",\n")}\n  }\n}\n`
  );
}

export async function fetchStartggPremierResults(
  options: { force?: boolean } = {}
): Promise<{ updated: boolean; data: StartggPremierResultsData | null }> {
  const existing = loadExisting();
  if (!hasStartggToken()) {
    console.log("[Step 0a] STARTGG_API_TOKEN not set. Keeping existing start.gg cache.");
    return { updated: false, data: existing };
  }
  if (
    !options.force &&
    existing &&
    Date.now() - Date.parse(existing.updatedAt) < REFRESH_INTERVAL_MS
  ) {
    console.log(`[Step 0a] start.gg cache is fresh (${existing.updatedAt}). Skipping fetch.`);
    return { updated: false, data: existing };
  }

  const identities = StartggIdentitiesDataSchema.parse(
    JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8"))
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - PREMIER_WINDOW_DAYS * 24 * 60 * 60;
  const events: Record<string, StartggEvent> = {};
  for (const ev of Object.values(existing?.events ?? {})) {
    // 期間外のイベントは捨てる (期間内に戻ることはない)
    if (ev.startDate && Date.parse(ev.startDate) / 1000 >= windowStartSec - 7 * 86400) {
      events[ev.id] = ev;
    }
  }

  const players: StartggPremierResultsData["players"] = {};
  const entries = Object.entries(identities.players);
  console.log(
    `[Step 0a] Fetching start.gg premier results for ${entries.length} players (window ${PREMIER_WINDOW_DAYS} days)...`
  );

  for (const [sflKey, ident] of entries) {
    const prev = existing?.players[sflKey];
    const samePlayer = prev?.startggPlayerId === ident.startggPlayerId;
    const stopBeforeSec =
      samePlayer && prev
        ? Math.floor(Date.parse(prev.fetchedAt) / 1000) - INCREMENTAL_OVERLAP_SEC
        : windowStartSec;

    const fetched: Array<{ set: StartggSet; placement: StartggPlacement | null }> = [];
    let gamerTag = ident.gamerTag;
    for (let page = 1; page <= MAX_PAGES_PER_PLAYER; page++) {
      const data = await startggQuery<{
        player: { gamerTag: string; sets: { nodes: RawSet[] } } | null;
      }>(PLAYER_SETS_QUERY, { id: ident.startggPlayerId, page, perPage: SETS_PER_PAGE });
      if (!data.player) break;
      gamerTag = data.player.gamerTag || gamerTag;
      const nodes = data.player.sets.nodes ?? [];
      if (nodes.length === 0) break;

      for (const raw of nodes) {
        if (raw.event?.videogame?.id !== SF6_VIDEOGAME_ID) continue;
        const norm = normalizeSet(raw, ident.startggPlayerId);
        if (norm && norm.set.completedAt >= windowStartSec) fetched.push(norm);
      }
      const oldest = Math.min(...nodes.map((n) => n.completedAt ?? nowSec));
      // 前回取得時点より前まで遡ったら打ち切り (それ以前の完了済みセットは取得済み)
      if (oldest < Math.max(windowStartSec, stopBeforeSec)) break;
    }

    // 新出イベントのメタ情報を取得してプレミア判定
    const unknownEventIds = [
      ...new Set(fetched.map((f) => f.set.eventId).filter((id) => !events[id])),
    ];
    Object.assign(events, await fetchEventMeta(unknownEventIds));

    const isPremier = (eventId: string) => events[eventId]?.category != null;
    const setsById = new Map<string, StartggSet>();
    for (const s of samePlayer ? prev.sets : []) setsById.set(s.id, s);
    for (const f of fetched) setsById.set(f.set.id, f.set);
    const sets = [...setsById.values()]
      .filter((s) => s.completedAt >= windowStartSec && isPremier(s.eventId))
      .sort((a, b) => b.completedAt - a.completedAt);

    const placementByEvent = new Map<string, StartggPlacement>();
    for (const p of samePlayer ? prev.placements : []) placementByEvent.set(p.eventId, p);
    for (const f of fetched) if (f.placement) placementByEvent.set(f.placement.eventId, f.placement);
    const premierEventIds = new Set(sets.map((s) => s.eventId));
    const placements = [...placementByEvent.values()].filter((p) =>
      premierEventIds.has(p.eventId)
    );

    players[sflKey] = {
      startggPlayerId: ident.startggPlayerId,
      gamerTag,
      fetchedAt: new Date().toISOString(),
      placements,
      sets,
    };
    console.log(
      `[Step 0a]   ${sflKey} (${gamerTag}): ${sets.length} premier sets / ${placements.length} events (+${fetched.length} scanned)`
    );
  }

  const data = StartggPremierResultsDataSchema.parse({
    updatedAt: new Date().toISOString(),
    source: "start.gg GraphQL API (player.sets / SF6 premier events)",
    windowDays: PREMIER_WINDOW_DAYS,
    windowStart: isoDate(windowStartSec),
    events,
    players,
  });
  fs.writeFileSync(STARTGG_RESULTS_FILE, serializeResults(data), "utf8");
  const premierCount = Object.values(events).filter((e) => e.category).length;
  console.log(
    `[Step 0a] Saved startgg-premier-results.json (${premierCount} premier events / ${Object.keys(events).length} scanned events).`
  );
  return { updated: true, data };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchStartggPremierResults({ force: process.argv.includes("--force") }).catch((err) => {
    console.error("[Step 0a Error]", err);
    process.exit(1);
  });
}
