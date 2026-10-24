import type { MatchesData, RecapJobsData, VideoFactsData, RecapEvidence } from "../../src/lib/types";
import { findBoutWindow } from "./youtube-chapters";

export const AUTOMATIC_STAGES = new Set(["queued", "waiting_video", "waiting_window", "extracting", "verifying", "writing", "retry_wait", "paused"]);

export function articleEvidenceReady(evidence: RecapEvidence[]): boolean {
  return evidence.some((item) => item.kind === "official" && item.status === "verified") &&
    evidence.filter((item) => ["visual", "commentary"].includes(item.kind) && item.status === "verified").length >= 2;
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
