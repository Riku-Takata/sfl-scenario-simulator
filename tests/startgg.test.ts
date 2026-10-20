import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyPremierEvent, SF6_VIDEOGAME_ID } from "../src/lib/startgg/premier";
import { normalizeStartggCharName } from "../src/lib/startgg/characters";
import {
  buildTournamentProfiles,
  estimatePerformanceRating,
} from "../src/lib/startgg/profile";
import { normalizeSet } from "../scripts/0a-fetch-startgg";
import {
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../src/lib/schema";
import type { StartggPremierResultsData, StartggSet } from "../src/lib/types";

const DATA_DIR = path.resolve(process.cwd(), "src/data");

function ev(tournamentName: string, eventName = "Street Fighter 6", numEntrants = 1000, isOnline = false) {
  return { tournamentName, eventName, numEntrants, isOnline, videogameId: SF6_VIDEOGAME_ID };
}

test("classifyPremierEvent: プレミア大会の区分判定", () => {
  assert.equal(classifyPremierEvent(ev("World Warrior 2026 - Japan 4", "Street Fighter 6", 1476, true)), "CPT WW");
  assert.equal(classifyPremierEvent(ev("Evo Japan 2026 presented by Levtech")), "EVO");
  assert.equal(classifyPremierEvent(ev("COMBO BREAKER 2026")), "CPT Premier");
  assert.equal(
    classifyPremierEvent(ev("BAM 16", "Street Fighter 6 [BAM 2026] Capcom Pro Tour Premier Event CPT2026", 230)),
    "CPT Premier"
  );
  // サイドイベント・小規模・他タイトル・オンライン大型は対象外
  assert.equal(classifyPremierEvent(ev("CEO 2026 Thursday Night Teams", "3v3 SF6 Teams", 44)), null);
  assert.equal(classifyPremierEvent(ev("Esports World Cup 2026: Street Fighter 6 - LCQ", "Street Fighter 6 LCQ", 269)), null);
  assert.equal(classifyPremierEvent(ev("Paradise Cup #95", "SF6 1vs1", 85)), null);
  assert.equal(classifyPremierEvent(ev("もかCUP#3", "SF6", 1341, true)), null);
  assert.equal(classifyPremierEvent({ ...ev("Evo 2026"), videogameId: 1 }), null);
  // 大型オフラインは Major
  assert.equal(classifyPremierEvent(ev("Some Big Local 2026", "Street Fighter 6", 600)), "Major");
});

test("normalizeStartggCharName: start.gg表記 → 内部キー", () => {
  assert.equal(normalizeStartggCharName("Akuma"), "gouki_akuma");
  assert.equal(normalizeStartggCharName("M. Bison"), "vega_mbison");
  assert.equal(normalizeStartggCharName("Chun-Li"), "chunli");
  assert.equal(normalizeStartggCharName("Dee Jay"), "dee_jay");
  assert.equal(normalizeStartggCharName("C. Viper"), "cviper");
  assert.equal(normalizeStartggCharName("A.K.I."), "aki");
  assert.equal(normalizeStartggCharName("Random"), null);
  assert.equal(normalizeStartggCharName(null), null);
});

function rawSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    completedAt: 1_790_000_000,
    fullRoundText: "Losers Round 1",
    round: -3,
    winnerId: 20,
    phaseGroup: { phase: { name: "Top 32" } },
    event: { id: 99, videogame: { id: SF6_VIDEOGAME_ID } },
    slots: [
      {
        entrant: { id: 10, initialSeedNum: 9, standing: { placement: 25 }, participants: [{ player: { id: 1, gamerTag: "Me" } }] },
        standing: { stats: { score: { value: 1 } } },
      },
      {
        entrant: { id: 20, initialSeedNum: 100, standing: { placement: 17 }, participants: [{ player: { id: 2, gamerTag: "Opp" } }] },
        standing: { stats: { score: { value: 2 } } },
      },
    ],
    games: [
      { orderNum: 2, winnerId: 20, selections: null },
      { orderNum: 1, winnerId: 10, selections: [{ entrant: { id: 10 }, character: { name: "Ken" } }, { entrant: { id: 20 }, character: { name: "Akuma" } }] },
      { orderNum: 3, winnerId: 20, selections: null },
    ],
    ...overrides,
  };
}

test("normalizeSet: 選手視点への正規化とDQ除外", () => {
  const norm = normalizeSet(rawSet() as never, 1);
  assert.ok(norm);
  assert.equal(norm.set.won, false);
  assert.equal(norm.set.myScore, 1);
  assert.equal(norm.set.oppScore, 2);
  assert.equal(norm.set.mySeed, 9);
  assert.equal(norm.set.oppPlayerId, 2);
  assert.deepEqual(
    norm.set.games.map((g) => [g.won, g.myChar, g.oppChar]),
    [
      [true, "ken", "gouki_akuma"],
      [false, null, null],
      [false, null, null],
    ]
  );
  assert.deepEqual(norm.placement, { eventId: "99", placement: 25, seed: 9 });

  const dq = rawSet();
  (dq.slots[0].standing.stats.score as { value: number }).value = -1;
  assert.equal(normalizeSet(dq as never, 1), null);
  assert.equal(normalizeSet(rawSet({ completedAt: null }) as never, 1), null);
});

test("estimatePerformanceRating: 勝つほど・強い相手ほど高い", () => {
  const vsSeed = (oppRating: number, won: boolean) => ({ oppRating, won });
  const weak = estimatePerformanceRating([vsSeed(1600, true), vsSeed(1600, false)]);
  const strong = estimatePerformanceRating([vsSeed(1600, true), vsSeed(1600, true)]);
  const strongerOpp = estimatePerformanceRating([vsSeed(1900, true), vsSeed(1900, true)]);
  assert.ok(weak != null && strong != null && strongerOpp != null);
  assert.ok(strong > weak);
  assert.ok(strongerOpp > strong);
  assert.equal(estimatePerformanceRating([]), null);
});

function set(partial: Partial<StartggSet>): StartggSet {
  return {
    id: String(Math.random()),
    eventId: "e1",
    completedAt: 1_790_000_000,
    round: 1,
    roundText: "Winners Round 1",
    phaseName: null,
    mySeed: 10,
    oppSeed: 50,
    oppPlayerId: 999,
    oppTag: "x",
    myScore: 2,
    oppScore: 0,
    won: true,
    games: [],
    ...partial,
  };
}

test("buildTournamentProfiles: 特徴量・H2H・大会成績", () => {
  const results: StartggPremierResultsData = {
    updatedAt: "2026-10-20T00:00:00.000Z",
    source: "test",
    windowDays: 365,
    windowStart: "2025-10-20",
    events: {
      e1: { id: "e1", slug: "s", tournamentName: "Evo 2026", eventName: "SF6", startDate: "2026-06-26", numEntrants: 2000, isOnline: false, countryCode: "US", category: "EVO" },
      e2: { id: "e2", slug: "s2", tournamentName: "Weekly", eventName: "SF6", startDate: "2026-06-27", numEntrants: 50, isOnline: true, countryCode: null, category: null },
    },
    players: {
      a: {
        startggPlayerId: 1,
        gamerTag: "A",
        fetchedAt: "2026-10-20T00:00:00.000Z",
        placements: [{ eventId: "e1", placement: 5, seed: 10 }],
        sets: [
          set({ won: true, myScore: 2, oppScore: 1, games: [{ won: false, myChar: null, oppChar: null }, { won: true, myChar: null, oppChar: null }, { won: true, myChar: null, oppChar: null }] }),
          set({ won: false, myScore: 1, oppScore: 2, oppPlayerId: 2, oppSeed: 3, round: -2 }),
          set({ won: true, myScore: 2, oppScore: 0, oppPlayerId: 2, oppSeed: 3 }),
          // プレミア対象外イベントは無視
          set({ eventId: "e2", won: false, myScore: 0, oppScore: 2 }),
        ],
      },
    },
  };
  const identities = {
    updatedAt: "2026-10-20",
    players: {
      a: { startggPlayerId: 1, gamerTag: "A", userSlug: "user/a", evidence: "test" },
      b: { startggPlayerId: 2, gamerTag: "B", userSlug: null, evidence: "test" },
    },
  };
  const p = buildTournamentProfiles(results, identities, { b: "Bさん" }, 1_790_000_000 + 10)["a"];
  assert.equal(p.sets.total, 3);
  assert.equal(p.sets.won, 2);
  assert.equal(p.decidingGame.total, 2);
  assert.equal(p.decidingGame.won, 1);
  assert.equal(p.comeback.total, 1);
  assert.equal(p.comeback.won, 1);
  assert.equal(p.losersBracket.total, 1);
  assert.equal(p.vsHigherSeed.total, 2);
  assert.deepEqual(p.h2h.b, { opponentKey: "b", won: 1, lost: 1 });
  assert.equal(p.eventsCount, 1);
  assert.equal(p.bestResult?.placement, 5);
  assert.equal(p.overseasEventsCount, 1);
  assert.ok(p.summary.some((line) => line.includes("Bさん 1-1")));
});

test("start.gg データファイル: Zod検証と対応表の整合", () => {
  const identities = StartggIdentitiesDataSchema.parse(
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "startgg-identities.json"), "utf8"))
  );
  const results = StartggPremierResultsDataSchema.parse(
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "startgg-premier-results.json"), "utf8"))
  );
  const seed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "raw-capcom-seed.json"), "utf8"));
  for (const key of Object.keys(seed.data.players)) {
    assert.ok(identities.players[key], `start.gg 対応表に ${key} がありません`);
  }
  const ids = Object.values(identities.players).map((p) => p.startggPlayerId);
  assert.equal(new Set(ids).size, ids.length, "start.gg player id が重複しています");
  for (const p of Object.values(results.players)) {
    for (const s of p.sets) {
      assert.ok(results.events[s.eventId]?.category, `プレミア対象外のセットが保存されています: ${s.id}`);
    }
  }
});
