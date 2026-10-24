import fs from "node:fs";
import { MatchesDataSchema, RecapJobsDataSchema, VideoFactsDataSchema } from "../src/lib/schema";
import { generateAndSaveMatchRecaps } from "./4-generate-match-recaps";
import { mergePreparedChapters, selectAutomaticSection } from "./recap/automation";
import { loadRecapUsage, remainingDailyUsage } from "./recap/usage";

const JOBS_FILE = new URL("../src/data/recap-jobs.json", import.meta.url);
const allowArchiveCheck = process.env.RECAP_CHECK_ARCHIVES === "true" || process.argv.includes("--check-archives");
if (process.env.RECAP_CHAPTER_CACHE) {
  const file = new URL("../src/data/video-facts.json", import.meta.url);
  const facts = VideoFactsDataSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/matches.json", import.meta.url), "utf8")));
  if (mergePreparedChapters(facts, matches, process.env.RECAP_CHAPTER_CACHE)) {
    fs.writeFileSync(file, JSON.stringify(VideoFactsDataSchema.parse(facts), null, 2));
    console.log("[Recap worker] Imported prepared official chapters into the serialized writer.");
  }
}

function nextSection(): { section?: string; hasJobs: boolean } {
  if (!fs.existsSync(JOBS_FILE)) return { hasJobs: false };
  const data = RecapJobsDataSchema.parse(JSON.parse(fs.readFileSync(JOBS_FILE, "utf8")));
  const facts = VideoFactsDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/video-facts.json", import.meta.url), "utf8")));
  const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/matches.json", import.meta.url), "utf8")));
  return { section: selectAutomaticSection({ jobs: data, facts, matches, apiAvailable: Boolean(process.env.GEMINI_API_KEY), allowArchiveCheck }), hasJobs: Object.keys(data.jobs).length > 0 };
}

const explicitSection = process.argv.find((arg) => arg.startsWith("--section="))?.slice("--section=".length);
const next = nextSection();
const section = explicitSection || next.section;
const remaining = remainingDailyUsage(loadRecapUsage());
if ((!remaining.calls || !remaining.videoSeconds) && !process.env.RECAP_NARRATIVE_CACHE) {
  console.log("[Recap worker] Daily video budget reached; saved progress will resume after the daily reset.");
  process.exit(0);
}
if (!section && next.hasJobs) {
  console.log("[Recap worker] No job is due; durable state is unchanged.");
  process.exit(0);
}
if (section) console.log("[Recap worker] Resuming oldest eligible section " + section + ".");
else console.log("[Recap worker] No durable jobs exist yet; seeding work from the latest official results.");

generateAndSaveMatchRecaps({ onlySection: section, refreshChapters: allowArchiveCheck }).catch((error) => {
  console.error("[Recap worker] failed:", error);
  process.exit(1);
});
