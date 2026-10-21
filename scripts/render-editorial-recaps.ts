import fs from "node:fs";
import path from "node:path";
import { EditorialRecapsDataSchema, MatchRecapsDataSchema } from "../src/lib/schema";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const recapsPath = path.join(DATA_DIR, "match-recaps.json");
const editorialPath = path.join(DATA_DIR, "editorial-recaps.json");
const sectionArg = process.argv.find((arg) => arg.startsWith("--section="));
const onlySection = sectionArg?.slice("--section=".length);

const recaps = MatchRecapsDataSchema.parse(JSON.parse(fs.readFileSync(recapsPath, "utf8")));
const editorial = EditorialRecapsDataSchema.parse(
  JSON.parse(fs.readFileSync(editorialPath, "utf8"))
);

let renderedMatches = 0;
let renderedBouts = 0;
for (const division of ["s", "f"] as const) {
  for (const match of recaps.recentSections[division]) {
    if (onlySection && !match.matchId.startsWith(`${onlySection}-m`)) continue;
    const matchEditorial = editorial.matches[match.matchId];
    let matchHasEditorial = false;
    for (const bout of match.bouts) {
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
