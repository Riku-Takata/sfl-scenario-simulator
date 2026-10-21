import fs from "node:fs";
import path from "node:path";
import { EditorialRecapsDataSchema, MatchRecapsDataSchema } from "../src/lib/schema";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const recapsPath = path.join(DATA_DIR, "match-recaps.json");
const editorialPath = path.join(DATA_DIR, "editorial-recaps.json");
const seedPath = path.join(DATA_DIR, "raw-capcom-seed.json");
const sectionArg = process.argv.find((arg) => arg.startsWith("--section="));
const onlySection = sectionArg?.slice("--section=".length);

interface RawGameLog {
  "1p_character": string;
  "2p_character": string;
}

interface RawBoutLog {
  status: number;
}

interface RawMatchResult {
  "1p"?: RawBoutLog[];
  log?: RawGameLog[][];
}

interface RawSchedule {
  post_name: string;
  fields: {
    section: Record<string, { result?: RawMatchResult }>;
  };
}

const recaps = MatchRecapsDataSchema.parse(JSON.parse(fs.readFileSync(recapsPath, "utf8")));
const editorial = EditorialRecapsDataSchema.parse(
  JSON.parse(fs.readFileSync(editorialPath, "utf8"))
);
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as {
  data?: { schedules?: RawSchedule[] };
};

let renderedMatches = 0;
let renderedBouts = 0;
for (const division of ["s", "f"] as const) {
  for (const match of recaps.recentSections[division]) {
    if (onlySection && !match.matchId.startsWith(`${onlySection}-m`)) continue;
    const sectionSlug = match.matchId.replace(/-m\d+$/, "");
    const schedule = seed.data?.schedules?.find((entry) => entry.post_name === sectionSlug);
    const result = schedule?.fields.section[`match${match.matchNumber}`]?.result;
    const matchEditorial = editorial.matches[match.matchId];
    let matchHasEditorial = false;
    for (const bout of match.bouts) {
      const rawBoutIndex = result?.["1p"]?.findIndex((entry) => entry.status === bout.status) ?? -1;
      const rawGames = rawBoutIndex >= 0 ? result?.log?.[rawBoutIndex] : undefined;
      if (rawGames && bout.games) {
        bout.games = bout.games.map((game, index) => {
          const withCharacters = { ...game };
          const homeChara = rawGames[index]?.["1p_character"] || game.homeChara;
          const awayChara = rawGames[index]?.["2p_character"] || game.awayChara;
          if (homeChara) withCharacters.homeChara = homeChara;
          if (awayChara) withCharacters.awayChara = awayChara;
          return withCharacters;
        });
      }
      const boutId = `${match.matchId}-b${bout.status}`;
      const boutEditorial = editorial.bouts[boutId];
      if (!boutEditorial) {
        if (onlySection) throw new Error(`Missing editorial for ${boutId}`);
        continue;
      }
      bout.analysis = {
        source: "editorial",
        summary: boutEditorial.summary,
        keyPoints: boutEditorial.keyPoints,
      };
      bout.videoStatus = "complete";
      matchHasEditorial = true;
      renderedBouts++;
    }
    if (!matchEditorial && onlySection) {
      throw new Error(`Missing match editorial for ${match.matchId}`);
    }
    if (matchEditorial) {
      match.matchHeadline = matchEditorial.headline;
      match.matchSummary = matchEditorial.summary;
      matchHasEditorial = true;
    }
    if (!matchHasEditorial) continue;

    if (match.bouts.every((bout) => bout.analysis.source === "editorial")) {
      match.narrationStatus = "complete";
    }
    renderedMatches++;
  }
}

if (onlySection && renderedMatches === 0) {
  throw new Error(`No current match recaps found for ${onlySection}`);
}

const sources = new Set(
  [...recaps.recentSections.s, ...recaps.recentSections.f].flatMap((match) =>
    match.bouts.map((bout) => bout.analysis.source)
  )
);
recaps.generatorMode =
  sources.size > 1
    ? "mixed"
    : sources.has("editorial")
      ? "editorial"
      : sources.has("gemini-video")
        ? "gemini-video"
        : "deterministic-rules";
recaps.updatedAt = new Date().toISOString();

const validated = MatchRecapsDataSchema.parse(recaps);
fs.writeFileSync(recapsPath, `${JSON.stringify(validated, null, 2)}\n`);
console.log(
  `[Editorial render] ${onlySection || "all sections"}: ${renderedMatches} matches, ${renderedBouts} bouts (offline)`
);
