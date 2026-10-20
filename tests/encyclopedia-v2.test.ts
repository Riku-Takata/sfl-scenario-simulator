import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BucklerProfilesDataSchema,
  CptMatchupsTop96DataSchema,
  MatchesDataSchema,
  PlayerStatsDataSchema,
  SflPlayStatsDataSchema,
  Sf6TournamentMatchupsDataSchema,
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../src/lib/schema";
import { buildPlayerEncyclopedia } from "../src/lib/player-encyclopedia";
import { buildTournamentProfiles } from "../src/lib/startgg/profile";
import { buildPlayStyleProfiles } from "../src/lib/sfl/play-style";
import { buildPlayerMatchDetail } from "../src/lib/player-encyclopedia/match-detail";
import { PLAYER_NAME_MAP } from "../src/lib/simulator";

const read = (f: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "src/data", f), "utf8"));
const results = StartggPremierResultsDataSchema.parse(read("startgg-premier-results.json"));
const identities = StartggIdentitiesDataSchema.parse(read("startgg-identities.json"));

test("選手図鑑: 全選手に総評を含む解説が付き、出典が明示される", () => {
  const players = buildPlayerEncyclopedia(
    PlayerStatsDataSchema.parse(read("player-stats.json")),
    MatchesDataSchema.parse(read("matches.json")),
    CptMatchupsTop96DataSchema.parse(read("cpt-matchups-top96.json")),
    Sf6TournamentMatchupsDataSchema.parse(read("sf6-tournament-matchups.json")),
    buildTournamentProfiles(results, identities, PLAYER_NAME_MAP),
    buildPlayStyleProfiles(SflPlayStatsDataSchema.parse(read("sfl-play-stats.json")), "2026", "2025"),
    BucklerProfilesDataSchema.parse(read("buckler-profiles.json")).players
  );
  assert.equal(players.length, 48);
  for (const p of players) {
    assert.equal(p.commentary[0]?.heading, "総評", p.playerKey);
    for (const s of p.commentary) {
      assert.ok(s.text.length > 0 && s.sources.length > 0, `${p.playerKey} ${s.heading}`);
      assert.ok(!/undefined|NaN|null/.test(s.text), `${p.playerKey} ${s.heading}: ${s.text}`);
    }
  }
  assert.ok(players.some((p) => p.commentary.some((s) => s.heading === "大会での勝ち方")));
});

test("対戦データ詳細: 大会ごとにセットをまとめ、SFL選手の相手を選手キーで示す", () => {
  const d = buildPlayerMatchDetail("higuchi", results, identities);
  assert.ok(d.events.length > 0);
  const dates = d.events.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "新しい大会が先");
  const sets = d.events.flatMap((e) => e.sets);
  assert.equal(sets.length, results.players.higuchi.sets.length);
  assert.ok(sets.some((s) => s.oppSflKey && identities.players[s.oppSflKey]));
  assert.deepEqual(buildPlayerMatchDetail("unknown", results, identities).events, []);
});
