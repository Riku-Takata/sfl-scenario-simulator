import test from "node:test";
import { SF6_CHARACTERS } from "../src/lib/characters";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  analyzeDivisionScenarios,
  calculateStandings,
  sortStandings,
  TEAM_META_MAP,
} from "../src/lib/simulator";
import {
  PREDICTOR_WEIGHTS,
  predictBoutWinRate,
  predictTeamMatchOutcomeDistribution,
} from "../src/lib/predictor";
import {
  decodeSimulationCode,
  encodeSimulationCode,
  generateOutcomesForTargetRank,
} from "../src/components/InteractiveSimulator";
import {
  CptMatchupsTop96DataSchema,
  MasterPlayersDataSchema,
  MatchesDataSchema,
  PlayerStatsDataSchema,
  ScenariosDataSchema,
  Sf6TournamentMatchupsDataSchema,
  StandingsDataSchema,
  MatchRecapsDataSchema,
} from "../src/lib/schema";
import type { TeamStanding } from "../src/lib/types";

const dataDir = path.resolve(process.cwd(), "src/data");
const matchesData = MatchesDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "matches.json"), "utf8"))
);
const standingsData = StandingsDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "standings.json"), "utf8"))
);
const masterPlayersData = MasterPlayersDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "master-players.json"), "utf8"))
);
const cptMatchupsData = CptMatchupsTop96DataSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(dataDir, "cpt-matchups-top96.json"), "utf8")
  )
);
const playerStatsData = PlayerStatsDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "player-stats.json"), "utf8"))
);
const scenariosData = ScenariosDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "scenarios.json"), "utf8"))
);
const sf6TournamentData = Sf6TournamentMatchupsDataSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(dataDir, "sf6-tournament-matchups.json"),
      "utf8"
    )
  )
);
const matchRecapsData = MatchRecapsDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(dataDir, "match-recaps.json"), "utf8"))
);

test("Zod schemas validate all 8 generated JSON datasets cleanly", () => {
  assert.equal(matchesData.matches.length, 60);
  assert.equal(standingsData.divisions.s.length, 6);
  assert.equal(standingsData.divisions.f.length, 6);
  assert.equal(Object.keys(masterPlayersData.players).length, 48);
  assert.equal(cptMatchupsData.characters.length, SF6_CHARACTERS.length);
  assert.equal(Object.keys(playerStatsData.players).length, 48);
  assert.equal(Object.keys(scenariosData.teams).length, 12);
  assert.equal(Object.keys(sf6TournamentData.players).length, 48);
  assert.equal(matchRecapsData.recentSections.s.length, 3);
  assert.equal(matchRecapsData.recentSections.f.length, 3);
});

test("sortStandings strictly prioritizes Point -> BattleDiff -> RoundDiff", () => {
  const sample: TeamStanding[] = [
    {
      key: "a",
      name: "Team A",
      nameJp: "A",
      shortName: "A",
      division: "s",
      color: "#fff",
      order: 0,
      rank: 0,
      point: 100,
      pointHome: 50,
      pointAway: 50,
      battleDiff: 2,
      battleDiffHome: 1,
      battleDiffAway: 1,
      roundDiff: 5,
      roundDiffHome: 2,
      roundDiffAway: 3,
      entry: 4,
      entryHome: 2,
      entryAway: 2,
      victory: 3,
      victoryHome: 2,
      victoryAway: 1,
      remainingMatches: 6,
      remainingHome: 3,
      remainingAway: 3,
      players: [],
    },
    {
      key: "b",
      name: "Team B",
      nameJp: "B",
      shortName: "B",
      division: "s",
      color: "#fff",
      order: 1,
      rank: 0,
      point: 100,
      pointHome: 60,
      pointAway: 40,
      battleDiff: 5,
      battleDiffHome: 3,
      battleDiffAway: 2,
      roundDiff: 1,
      roundDiffHome: 0,
      roundDiffAway: 1,
      entry: 4,
      entryHome: 2,
      entryAway: 2,
      victory: 3,
      victoryHome: 2,
      victoryAway: 1,
      remainingMatches: 6,
      remainingHome: 3,
      remainingAway: 3,
      players: [],
    },
    {
      key: "c",
      name: "Team C",
      nameJp: "C",
      shortName: "C",
      division: "s",
      color: "#fff",
      order: 2,
      rank: 0,
      point: 100,
      pointHome: 50,
      pointAway: 50,
      battleDiff: 2,
      battleDiffHome: 1,
      battleDiffAway: 1,
      roundDiff: 8,
      roundDiffHome: 4,
      roundDiffAway: 4,
      entry: 4,
      entryHome: 2,
      entryAway: 2,
      victory: 3,
      victoryHome: 2,
      victoryAway: 1,
      remainingMatches: 6,
      remainingHome: 3,
      remainingAway: 3,
      players: [],
    },
  ];

  const sorted = sortStandings(sample);
  assert.equal(sorted[0].key, "b", "Higher battleDiff should rank 1st");
  assert.equal(sorted[1].key, "c", "Higher roundDiff should rank 2nd");
  assert.equal(sorted[2].key, "a", "Lower roundDiff should rank 3rd");
});

test("calculateStandings produces valid 6-team tables for Division S and Division F", () => {
  const divS = calculateStandings("s", matchesData.matches);
  const divF = calculateStandings("f", matchesData.matches);

  assert.equal(divS.length, 6);
  assert.equal(divF.length, 6);

  const unplayedS = matchesData.matches.find(
    (m) => m.division === "s" && !m.played
  );
  assert.ok(unplayedS, "Should have unplayed match in Division S");

  const beforeHome = divS.find((t) => t.key === unplayedS.home)!;
  const afterS = calculateStandings("s", matchesData.matches, {
    [unplayedS.id]: "HOME_40_0",
  });
  const afterHome = afterS.find((t) => t.key === unplayedS.home)!;
  assert.equal(afterHome.point, beforeHome.point + 40);
  assert.equal(afterHome.remainingMatches, beforeHome.remainingMatches - 1);
});

test("generateOutcomesForTargetRank achieves exact target rank (1st, 2nd, 3rd) for all 12 teams", () => {
  for (const team of Object.values(TEAM_META_MAP)) {
    for (const rank of [1, 2, 3] as const) {
      const outcomes = generateOutcomesForTargetRank(
        team.division,
        matchesData.matches,
        team.key,
        rank
      );
      const standings = calculateStandings(
        team.division,
        matchesData.matches,
        outcomes
      );
      const actualRank = standings.find((t) => t.key === team.key)?.rank;
      assert.equal(
        actualRank,
        rank,
        `Team ${team.key} should achieve exact rank ${rank}`
      );
    }
  }
});

test("encodeSimulationCode and decodeSimulationCode compress 18-21 matches into <=11 chars losslessly", () => {
  for (const div of ["s", "f"] as const) {
    const unplayed = matchesData.matches.filter(
      (m) => m.division === div && !m.played
    );
    const sampleTeam = div === "s" ? "fav" : "rc";
    const fullOutcomes = generateOutcomesForTargetRank(
      div,
      matchesData.matches,
      sampleTeam,
      1
    );
    const code = encodeSimulationCode(unplayed, fullOutcomes);
    assert.ok(
      code.length > 0 && code.length <= 11,
      `Expected compact code <= 11 chars, got "${code}" (${code.length})`
    );
    const decoded = decodeSimulationCode(unplayed, code);
    assert.deepEqual(decoded, fullOutcomes);
  }
});

test("predictBoutWinRate computes bounded probabilities with weighted CPT Top 96 formula", () => {
  assert.ok(
    Math.abs(
      PREDICTOR_WEIGHTS.w1MacroTop96 +
        PREDICTOR_WEIGHTS.w2PlayerVsChar +
        PREDICTOR_WEIGHTS.w3H2hAndHome -
        1
    ) < 1e-6
  );

  const predAB = predictBoutWinRate(
    "umehara",
    "tokido",
    true,
    cptMatchupsData,
    playerStatsData,
    "gouki",
    "jp"
  );

  assert.ok(predAB.expectedWinRateA >= 20 && predAB.expectedWinRateA <= 85);
  assert.ok(predAB.macroMatchupTop96 > 0 && predAB.macroMatchupTop96 < 100);
  assert.ok(predAB.playerVsCharRate > 0 && predAB.playerVsCharRate < 100);
});

test("predictTeamMatchOutcomeDistribution and analyzeDivisionScenarios integrate CPT data", () => {
  const unplayedMatch = matchesData.matches.find((m) => !m.played)!;
  const matchPred = predictTeamMatchOutcomeDistribution(
    unplayedMatch,
    cptMatchupsData,
    playerStatsData
  );

  assert.equal(matchPred.homeOrderRecommendation.recommendedLineup.length, 3);
  assert.ok(
    Math.abs(matchPred.homeWinProbability + matchPred.awayWinProbability - 100) <
      0.5
  );

  const summary = analyzeDivisionScenarios("s", matchesData.matches, 500, {
    cptMatchups: cptMatchupsData,
    playerStats: playerStatsData,
  });
  assert.equal(Object.keys(summary.teams).length, 6);

  for (const team of Object.values(summary.teams)) {
    assert.ok(
      team.probabilities.playoffTop3 >= 0 &&
        team.probabilities.playoffTop3 <= 100
    );
    assert.ok(team.nextMatchPrediction, "Should include nextMatchPrediction");
    assert.ok(team.remainingMatchPredictions && team.remainingMatchPredictions.length > 0, "Should include remainingMatchPredictions");
    assert.equal(team.nextSectionCheeringGuide.length, 2);
  }
});

import { buildPlayerEncyclopedia } from "../src/lib/player-encyclopedia";

test("buildPlayerEncyclopedia builds 48 objective player profiles with 6-axis parameters, all vs-character stats, and SF6 tournament history", () => {
  const encyclopedia = buildPlayerEncyclopedia(
    playerStatsData,
    matchesData,
    cptMatchupsData,
    sf6TournamentData
  );
  assert.equal(encyclopedia.length, 48);

  for (const p of encyclopedia) {
    assert.ok(
      p.parameters.overallScore >= 35 && p.parameters.overallScore <= 99
    );
    assert.equal(p.vsCharacters.length, SF6_CHARACTERS.length);
    assert.equal(p.tournamentVsCharacters.length, SF6_CHARACTERS.length);
    assert.ok(p.strongestMatchups.length <= 5);
    assert.ok(p.closestMatchups.length <= 5);
    assert.ok(p.tournamentStrongestMatchups.length <= 5);
    assert.ok(p.tournamentClosestMatchups.length <= 5);
    assert.ok(p.tournamentSummary.totalMatches > 0);
    assert.equal(p.objectiveSummary.length, 3);

    // Verify all tournament bouts are strictly in the SF6 era (>= 2023-06-02)
    for (const char of p.tournamentVsCharacters) {
      for (const b of char.tournamentMatchups) {
        assert.ok(
          b.date >= "2023-06-02",
          `Tournament match date ${b.date} should be in SF6 era (>= 2023-06-02)`
        );
      }
    }
  }
});

