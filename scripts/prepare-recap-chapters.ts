import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { MatchesDataSchema, RecapJobsDataSchema, VideoFactsDataSchema } from "../src/lib/schema";
import { selectAutomaticSection } from "./recap/automation";
import { RecapUsageSchema, remainingDailyUsage } from "./recap/usage";
import type { MatchesData, VideoFactsData } from "../src/lib/types";
import { SECTION_VIDEO_IDS } from "../src/config/section-videos";
import { SFL_CURRENT_SEASON } from "../src/lib/sfl/play-style";
import { fetchSectionVideos } from "./recap/youtube-archive";
import { extractYoutubeVideoId, fetchYoutubeChapters, findBoutWindow } from "./recap/youtube-chapters";

export async function prepareChapters(matches: MatchesData, facts: VideoFactsData): Promise<boolean> {
  const detected = await fetchSectionVideos(SFL_CURRENT_SEASON);
  let changed = false;
  for (const division of ["s", "f"] as const) {
    const latest = matches.completedSectionCount[division];
    const slug = `div-${division}-sec${latest}`;
    const section = matches.matches.filter((match) => match.sectionSlug === slug && match.played);
    const videoId = SECTION_VIDEO_IDS[slug] ?? detected[slug] ?? facts.videos[slug]?.videoId ?? extractYoutubeVideoId(section[0]?.liveUrl ?? "");
    if (!section.length || !videoId) continue;
    const cached = facts.videos[slug];
    const required = section.flatMap((match) => (match.bouts ?? []).map((bout) => ({ matchNumber: match.matchNumber, status: bout.status })));
    if (cached?.videoId === videoId && cached.chapters.length && required.every((bout) => findBoutWindow(cached.chapters, bout.matchNumber, bout.status))) continue;
    try {
      const chapters = await fetchYoutubeChapters(videoId);
      if (chapters.length && JSON.stringify(cached) !== JSON.stringify({ videoId, chapters })) {
        facts.videos[slug] = { videoId, chapters };
        changed = true;
        console.log(`[Chapters] ${slug}: cached ${chapters.length} official chapters`);
      }
    } catch (error) {
      console.warn(`[Chapters] ${slug}: ${(error as Error).message}; keeping cached chapters for the next check`);
    }
  }
  if (changed) facts.updatedAt = new Date().toISOString();
  return changed;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--publish")) {
    const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync("src/data/matches.json", "utf8")));
    const facts = VideoFactsDataSchema.parse(JSON.parse(fs.readFileSync("src/data/video-facts.json", "utf8")));
    if (await prepareChapters(matches, facts)) fs.writeFileSync("src/data/video-facts.json", JSON.stringify(VideoFactsDataSchema.parse(facts), null, 2));
    return;
  }
  // Read and update only the current remote cache. The SHA guards against a
  // concurrent worker overwriting newly extracted video facts.
  const repository = process.env.SFL_REPOSITORY ?? "Riku-Takata/sfl-scenario-simulator";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid repository");
  const gh = process.env.SFL_GH_PATH || "gh";
  const request = (args: string[], input?: unknown) => JSON.parse(execFileSync(gh, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, input: input === undefined ? undefined : JSON.stringify(input) }));
  const read = (name: string) => request(["api", `repos/${repository}/contents/src/data/${name}.json?ref=main`]);
  const decode = (file: any) => JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  for (let attempt = 0; attempt < 3; attempt++) {
    const matches = MatchesDataSchema.parse(decode(read("matches")));
    const remote = read("video-facts");
    const facts = VideoFactsDataSchema.parse(decode(remote));
    const readyOnly = process.argv.includes("--ready-only");
    if (!readyOnly && await prepareChapters(matches, facts)) {
      try {
        request(["api", `repos/${repository}/contents/src/data/video-facts.json`, "--method", "PUT", "--input", "-"], {
          message: "chore(recap): cache official chapters after broadcast",
          content: Buffer.from(JSON.stringify(VideoFactsDataSchema.parse(facts), null, 2)).toString("base64"),
          sha: remote.sha, branch: "main",
        });
      } catch (error) { if (attempt < 2) continue; throw error; }
    }
    const jobs = RecapJobsDataSchema.parse(decode(read("recap-jobs")));
    const remaining = remainingDailyUsage(RecapUsageSchema.parse(decode(read("recap-usage"))));
    const section = remaining.calls && remaining.videoSeconds
      ? selectAutomaticSection({ jobs, facts, matches, apiAvailable: true, allowArchiveCheck: !readyOnly }) : undefined;
    console.log(`SFL_RECAP_SECTIONS=${section ?? ""}`);
    return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
