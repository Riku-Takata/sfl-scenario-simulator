import type { MatchesData, RecapJobsData, VideoFactsData, RecapEvidence } from "../../src/lib/types";
import { findBoutWindow } from "./youtube-chapters";
import { VideoFactsDataSchema } from "../../src/lib/schema";

export const AUTOMATIC_STAGES = new Set(["queued", "waiting_video", "waiting_window", "extracting", "verifying", "writing", "retry_wait", "paused"]);

export function articleEvidenceReady(evidence: RecapEvidence[]): boolean {
  return evidence.some((item) => item.kind === "official" && item.status === "verified") &&
    evidence.filter((item) => ["visual", "commentary"].includes(item.kind) && item.status === "verified").length >= 2;
}

/** Prepared descriptions enter the same serialized writer as article state. */
export function mergePreparedChapters(facts: VideoFactsData, matches: MatchesData, encoded: string): boolean {
  if (!encoded) return false;
  if (encoded.length > 65_536) throw new Error("Prepared chapter cache is too large");
  const videos = VideoFactsDataSchema.shape.videos.parse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
  let changed = false;
  for (const [slug, video] of Object.entries(videos)) {
    if (!/^div-[sf]-sec\d+$/.test(slug) || !/^[\w-]{11}$/.test(video.videoId) ||
        !matches.matches.some((match) => match.sectionSlug === slug && match.played)) throw new Error(`Unexpected prepared section: ${slug}`);
    if (video.chapters.length && JSON.stringify(facts.videos[slug]) !== JSON.stringify(video)) {
      facts.videos[slug] = video;
      changed = true;
    }
  }
  if (changed) facts.updatedAt = new Date().toISOString();
  return changed;
}

/** Waiting for a description is different from continuing an already available video. */
export function selectAutomaticSection(input: {
  jobs: RecapJobsData; facts: VideoFactsData; matches: MatchesData;
  now?: number; apiAvailable: boolean; allowArchiveCheck: boolean;
}): string | undefined {
  const now = input.now ?? Date.now();
  return Object.values(input.jobs.jobs)
    .filter((job) => AUTOMATIC_STAGES.has(job.stage))
    .filter((job) => job.stage !== "paused" || input.apiAvailable)
    .filter((job) => !job.leaseUntil || Date.parse(job.leaseUntil) <= now)
    .filter((job) => {
      const due = !job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now;
      if (job.stage !== "waiting_video" && job.stage !== "waiting_window") return due;
      const video = input.facts.videos[job.sectionId];
      const match = input.matches.matches.find((match) => match.id === job.matchId);
      const bouts = (match?.bouts ?? []).filter((bout) => !job.boutId || job.boutId === `${job.matchId}-b${bout.status}`);
      const ready = Boolean(video?.chapters.length && match && bouts.length &&
        bouts.every((bout) => findBoutWindow(video.chapters, match.matchNumber, bout.status)));
      return ready || (input.allowArchiveCheck && due);
    })
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.sectionId.localeCompare(b.sectionId))[0]?.sectionId;
}
