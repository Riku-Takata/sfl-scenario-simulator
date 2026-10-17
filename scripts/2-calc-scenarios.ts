import fs from "node:fs";
import path from "node:path";
import {
  CptMatchupsTop96DataSchema,
  MatchesDataSchema,
  PlayerStatsDataSchema,
  ScenariosDataSchema,
} from "../src/lib/schema";
import type { ScenariosData } from "../src/lib/types";
import { analyzeDivisionScenarios } from "../src/lib/simulator";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");
const CPT_MATCHUPS_FILE = path.join(DATA_DIR, "cpt-matchups-top96.json");
const PLAYER_STATS_FILE = path.join(DATA_DIR, "player-stats.json");
const SCENARIOS_FILE = path.join(DATA_DIR, "scenarios.json");

export function calculateAndSaveScenarios(iterations = 10000): ScenariosData {
  if (!fs.existsSync(MATCHES_FILE)) {
    throw new Error(`matches.json not found at ${MATCHES_FILE}. Run Step 1 first.`);
  }

  const matchesData = MatchesDataSchema.parse(
    JSON.parse(fs.readFileSync(MATCHES_FILE, "utf8"))
  );

  let predictorData:
    | {
        cptMatchups: ReturnType<typeof CptMatchupsTop96DataSchema.parse>;
        playerStats: ReturnType<typeof PlayerStatsDataSchema.parse>;
      }
    | undefined;

  if (fs.existsSync(CPT_MATCHUPS_FILE) && fs.existsSync(PLAYER_STATS_FILE)) {
    const cptMatchups = CptMatchupsTop96DataSchema.parse(
      JSON.parse(fs.readFileSync(CPT_MATCHUPS_FILE, "utf8"))
    );
    const playerStats = PlayerStatsDataSchema.parse(
      JSON.parse(fs.readFileSync(PLAYER_STATS_FILE, "utf8"))
    );
    predictorData = { cptMatchups, playerStats };
  }

  console.log(
    `[Step 2] Running Monte Carlo simulation (${iterations.toLocaleString()} iterations per division, Predictor Engine: ${
      predictorData ? "ENABLED" : "DISABLED"
    })...`
  );

  const divS = analyzeDivisionScenarios(
    "s",
    matchesData.matches,
    iterations,
    predictorData
  );
  const divF = analyzeDivisionScenarios(
    "f",
    matchesData.matches,
    iterations,
    predictorData
  );

  const scenariosData: ScenariosData = ScenariosDataSchema.parse({
    updatedAt: new Date().toISOString(),
    simulationRuns: iterations,
    generatorMode: "deterministic-engine",
    predictorEnabled: Boolean(predictorData),
    divisionBorders: {
      s: {
        firstAvgPoints: divS.firstAvgPoints,
        secondAvgPoints: divS.secondAvgPoints,
        thirdAvgPoints: divS.thirdAvgPoints,
        nextSectionTitle: divS.nextSectionTitle,
      },
      f: {
        firstAvgPoints: divF.firstAvgPoints,
        secondAvgPoints: divF.secondAvgPoints,
        thirdAvgPoints: divF.thirdAvgPoints,
        nextSectionTitle: divF.nextSectionTitle,
      },
    },
    teams: {
      ...divS.teams,
      ...divF.teams,
    },
  });

  fs.writeFileSync(
    SCENARIOS_FILE,
    JSON.stringify(scenariosData, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `[Step 2] Validated with Zod & saved scenarios for all ${
      Object.keys(scenariosData.teams).length
    } teams.`
  );
  return scenariosData;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  calculateAndSaveScenarios();
}
