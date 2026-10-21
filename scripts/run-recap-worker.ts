import fs from "node:fs";
import { RecapJobsDataSchema } from "../src/lib/schema";
import { generateAndSaveMatchRecaps } from "./4-generate-match-recaps";

const JOBS_FILE = new URL("../src/data/recap-jobs.json", import.meta.url);
const ACTIVE_STAGES = new Set(["queued", "waiting_video", "waiting_window", "extracting", "verifying", "writing", "retry_wait", "paused"]);

function nextSection(): { section?: string; hasJobs: boolean } {
  if (!fs.existsSync(JOBS_FILE)) return { hasJobs: false };
  const data = RecapJobsDataSchema.parse(JSON.parse(fs.readFileSync(JOBS_FILE, "utf8")));
  const now = Date.now();
  const jobs = Object.values(data.jobs)
    .filter((job) => ACTIVE_STAGES.has(job.stage))
    .filter((job) => job.stage !== "paused" || Boolean(process.env.GEMINI_API_KEY))
    .filter((job) => !job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now)
    .filter((job) => !job.leaseUntil || Date.parse(job.leaseUntil) <= now)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.sectionId.localeCompare(b.sectionId));
  return { section: jobs[0]?.sectionId, hasJobs: Object.keys(data.jobs).length > 0 };
}

const explicitSection = process.argv.find((arg) => arg.startsWith("--section="))?.slice("--section=".length);
const next = nextSection();
const section = explicitSection || next.section;
if (!section && next.hasJobs) {
  console.log("[Recap worker] No job is due; durable state is unchanged.");
  process.exit(0);
}
if (section) console.log("[Recap worker] Resuming oldest eligible section " + section + ".");
else console.log("[Recap worker] No durable jobs exist yet; seeding work from the latest official results.");

generateAndSaveMatchRecaps({ onlySection: section }).catch((error) => {
  console.error("[Recap worker] failed:", error);
  process.exit(1);
});
