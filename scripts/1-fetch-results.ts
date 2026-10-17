import fs from "node:fs";
import path from "node:path";
import {
  MatchesDataSchema,
  StandingsDataSchema,
} from "../src/lib/schema";
import type {
  DivisionId,
  MatchesData,
  MatchBoutSummary,
  MatchRecord,
  StandingsData,
} from "../src/lib/types";
import { calculateStandings } from "../src/lib/simulator";

const DEFAULT_API_URL =
  process.env.SFL_API_RESULTS_URL ||
  "https://sf.esports.capcom.com/api/sfl2026/?data=results";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");
const STANDINGS_FILE = path.join(DATA_DIR, "standings.json");

interface CapcomBoutPlayer {
  player: string;
  point: number;
  battle: number;
  round: number;
  status: number;
  status_name: string;
  use_chara?: Record<string, { entry: number; win: number; lose: number }>;
}

interface CapcomMatchSlot {
  home: string;
  away: string;
  use: string;
  result:
    | ""
    | {
        "1p"?: CapcomBoutPlayer[];
        "2p"?: CapcomBoutPlayer[];
        total: {
          point: { home: number; away: number };
          battle: { home: number; away: number };
          round: { home: number; away: number };
        };
        winner: "home" | "away";
      };
}

interface CapcomScheduleEntry {
  ID: number;
  post_title: string;
  post_name: string;
  fields: {
    section: {
      time: string;
      links?: {
        live?: { url?: string };
      };
      match1: CapcomMatchSlot;
      match2: CapcomMatchSlot;
      match3: CapcomMatchSlot;
      match4?: CapcomMatchSlot;
    };
  };
}

function extractBouts(slot: CapcomMatchSlot): MatchBoutSummary[] | undefined {
  if (!slot.result || typeof slot.result === "string") return undefined;
  const p1 = slot.result["1p"] || [];
  const p2 = slot.result["2p"] || [];
  const count = Math.min(p1.length, p2.length);
  if (count === 0) return undefined;

  const bouts: MatchBoutSummary[] = [];
  for (let i = 0; i < count; i++) {
    const homeP = p1[i]; // Capcom API: 1P側がHOMEチーム
    const awayP = p2[i]; // Capcom API: 2P側がAWAYチーム
    const homeChara = Object.keys(homeP.use_chara || {})[0] || "";
    const awayChara = Object.keys(awayP.use_chara || {})[0] || "";
    bouts.push({
      status: homeP.status,
      statusName: homeP.status_name,
      homePlayer: homeP.player,
      awayPlayer: awayP.player,
      homeChara,
      awayChara,
      homePoint: homeP.point,
      awayPoint: awayP.point,
      homeBattle: homeP.battle,
      awayBattle: awayP.battle,
    });
  }
  return bouts;
}

export async function fetchAndSaveResults(options: { force?: boolean } = {}): Promise<{
  updated: boolean;
  matchesData: MatchesData;
  standingsData: StandingsData;
}> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[Step 1] Fetching official SFL 2026 data from: ${DEFAULT_API_URL}`);

  let rawJson: {
    status: string;
    data?: {
      schedules?: CapcomScheduleEntry[];
    };
  } | null = null;

  const seedFile = path.join(DATA_DIR, "raw-capcom-seed.json");

  try {
    const res = await fetch(DEFAULT_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Referer: "https://sf.esports.capcom.com/sfl2026/schedule/",
        "X-fd-mode": "retrieve_all",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      rawJson = (await res.json()) as {
        status: string;
        data?: {
          schedules?: CapcomScheduleEntry[];
        };
      };
      // 最新取得成功時はシードキャッシュも更新
      fs.writeFileSync(seedFile, JSON.stringify(rawJson), "utf8");
    } else {
      console.warn(
        `[Step 1] Live API returned HTTP ${res.status}. Falling back to cached official seed data.`
      );
    }
  } catch (err) {
    console.warn(
      `[Step 1] Live API fetch error (${(err as Error).message}). Falling back to cached official seed data.`
    );
  }

  if (!rawJson && fs.existsSync(seedFile)) {
    rawJson = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  }

  const schedules = rawJson?.data?.schedules;
  if (!schedules || !Array.isArray(schedules)) {
    throw new Error("Unexpected SFL API schema: data.schedules not found");
  }

  const matches: MatchRecord[] = [];
  const completedSections = { s: 0, f: 0 };

  for (const sched of schedules) {
    const slug = sched.post_name;
    let division: DivisionId | null = null;
    if (slug.startsWith("div-s-sec")) division = "s";
    else if (slug.startsWith("div-f-sec")) division = "f";
    if (!division) continue;

    const secNumMatch = slug.match(/sec(\d+)/);
    const sectionNumber = secNumMatch ? parseInt(secNumMatch[1], 10) : 0;
    const sec = sched.fields.section;
    const liveUrl = sec.links?.live?.url || "";

    const slots: Array<{ num: number; slot: CapcomMatchSlot }> = [
      { num: 1, slot: sec.match1 },
      { num: 2, slot: sec.match2 },
      { num: 3, slot: sec.match3 },
    ];

    let allPlayedInSection = true;

    for (const { num, slot } of slots) {
      if (!slot || slot.use === "hide" || slot.home === "none") continue;
      const hasResult =
        typeof slot.result === "object" &&
        slot.result !== null &&
        "total" in slot.result;

      if (!hasResult) {
        allPlayedInSection = false;
      }

      const homePoint = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.point.home)
        : 0;
      const awayPoint = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.point.away)
        : 0;
      const homeBattleDiff = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.battle.home)
        : 0;
      const awayBattleDiff = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.battle.away)
        : 0;
      const homeRoundDiff = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.round.home)
        : 0;
      const awayRoundDiff = hasResult && typeof slot.result === "object"
        ? Number(slot.result.total.round.away)
        : 0;
      const winner =
        hasResult && typeof slot.result === "object"
          ? slot.result.winner
          : null;
      const isTiebreaker =
        hasResult &&
        ((homePoint === 30 && awayPoint === 20) ||
          (homePoint === 20 && awayPoint === 30));

      matches.push({
        id: `${slug}-m${num}`,
        sectionSlug: slug,
        sectionTitle: sched.post_title,
        sectionNumber,
        division,
        matchNumber: num,
        scheduledAt: sec.time,
        home: slot.home,
        away: slot.away,
        played: hasResult,
        homePoint,
        awayPoint,
        homeBattleDiff,
        awayBattleDiff,
        homeRoundDiff,
        awayRoundDiff,
        winner,
        isTiebreaker,
        bouts: extractBouts(slot),
        liveUrl: liveUrl || undefined,
      });
    }

    if (allPlayedInSection) {
      completedSections[division] = Math.max(
        completedSections[division],
        sectionNumber
      );
    }
  }

  // 差分検知
  let hasDiff = true;
  if (fs.existsSync(MATCHES_FILE) && !options.force) {
    try {
      const prev = JSON.parse(fs.readFileSync(MATCHES_FILE, "utf8")) as MatchesData;
      const prevSignature = JSON.stringify(
        prev.matches.map((m) => ({
          id: m.id,
          played: m.played,
          hp: m.homePoint,
          ap: m.awayPoint,
          hb: m.homeBattleDiff,
          hr: m.homeRoundDiff,
        }))
      );
      const nextSignature = JSON.stringify(
        matches.map((m) => ({
          id: m.id,
          played: m.played,
          hp: m.homePoint,
          ap: m.awayPoint,
          hb: m.homeBattleDiff,
          hr: m.homeRoundDiff,
        }))
      );
      hasDiff = prevSignature !== nextSignature;
    } catch {
      hasDiff = true;
    }
  }

  const nowIso = new Date().toISOString();
  const matchesData: MatchesData = MatchesDataSchema.parse({
    updatedAt: nowIso,
    sourceUrl: DEFAULT_API_URL,
    completedSectionCount: completedSections,
    matches,
  });

  const standingsData: StandingsData = StandingsDataSchema.parse({
    updatedAt: nowIso,
    divisions: {
      s: calculateStandings("s", matches),
      f: calculateStandings("f", matches),
    },
  });

  if (!hasDiff && !options.force && fs.existsSync(STANDINGS_FILE)) {
    console.log(
      `[Step 1] No match updates detected (Div S: Sec ${completedSections.s}, Div F: Sec ${completedSections.f}).`
    );
    return { updated: false, matchesData, standingsData };
  }

  fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2) + "\n", "utf8");
  fs.writeFileSync(
    STANDINGS_FILE,
    JSON.stringify(standingsData, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `[Step 1] Saved ${matches.length} matches (Played: ${matches.filter((m) => m.played).length}/${matches.length}). Div S completed: Sec ${completedSections.s}, Div F completed: Sec ${completedSections.f}.`
  );

  return { updated: true, matchesData, standingsData };
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes("--force");
  fetchAndSaveResults({ force }).catch((err) => {
    console.error("[Step 1 Error]", err);
    process.exit(1);
  });
}
