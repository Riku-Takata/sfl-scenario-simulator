import test from "node:test";
import assert from "node:assert/strict";
import { applyPublicationMode, evaluateBoutArticle } from "../scripts/recap/article-quality";
import { upsertJob } from "../scripts/recap/recap-state";
import {
  isBoutVideoCacheStale,
  normalizeTopicWindow,
  videoAnalysisFingerprint,
} from "../scripts/recap/bout-video-facts";
import type { RecapEvidence, RecapJobsData } from "../src/lib/types";

const clip = { startSec: 2632, endSec: 3289 };

test("clip-relative Gemini timestamps are normalized to archive time", () => {
  assert.deepEqual(normalizeTopicWindow({ startSec: 12, endSec: 24 }, clip), {
    startSec: 2644,
    endSec: 2656,
  });
  assert.deepEqual(normalizeTopicWindow({ startSec: 2644, endSec: 2656 }, clip), {
    startSec: 2644,
    endSec: 2656,
  });
  assert.equal(normalizeTopicWindow({ startSec: 650, endSec: 660 }, clip), null);
  assert.equal(normalizeTopicWindow({ startSec: 20 }, clip), null);
});

test("old or changed video analysis caches become stale while unavailable windows wait", () => {
  const legacy = { videoId: "abc", startSec: 2632, endSec: 3289 };
  assert.equal(isBoutVideoCacheStale(legacy, {
    videoId: "abc", window: clip, analysisVersion: "v2",
  }), true);
  assert.equal(isBoutVideoCacheStale({ ...legacy, analysisVersion: "v2" }, {
    videoId: "abc", window: clip, analysisVersion: "v2",
  }), false);
  assert.equal(isBoutVideoCacheStale(legacy, {
    videoId: "abc", window: null, analysisVersion: "v2",
  }), false);
  assert.notEqual(videoAnalysisFingerprint(["gemini-3.8-flash"], 1),
    videoAnalysisFingerprint(["gemini-3.8-flash"], 2));
});

function evidence(id: string, kind: RecapEvidence["kind"], observation: string): RecapEvidence {
  return {
    id, sectionId: "div-s-sec4", matchId: "match-1", boutId: "bout-1", kind,
    videoId: kind === "official" ? undefined : "abc", startSec: kind === "official" ? undefined : 2640,
    endSec: kind === "official" ? undefined : 2660, playerIds: ["ACQUA", "2BASSA"],
    observation, officialRefs: ["bout-1:result"], status: "verified", extractorVersion: "test",
    sourceModels: [], createdAt: "2026-10-21T00:00:00.000Z",
  };
}

const evidenceSet = [
  evidence("official", "official", "ACQUA選手と2BASSA選手の先鋒戦は2-1。第1ゲームはACQUA選手が勝利。"),
  evidence("video-1", "visual", "ACQUA選手がブランカのローリングを画面端で2BASSA選手に当てる。"),
  evidence("video-2", "visual", "2BASSA選手の体力ゲージが残りわずかになった画面が映る。"),
];

test("quality gate rejects unrelated prose even when all cited evidence IDs are valid", () => {
  const unrelated = evaluateBoutArticle({
    matchId: "match-1", boutId: "bout-1",
    summary: "会場は雨模様で、観客席には多くの人が集まった。試合前の照明演出が続き、会場全体が華やかな雰囲気に包まれていた。",
    summaryEvidenceIds: ["official", "video-1"],
    keyPoints: [
      { text: "客席の照明が赤く変わり、会場の雰囲気を盛り上げた。", evidenceIds: ["video-1"] },
      { text: "雨の降る会場で観客の応援が長く続いていた。", evidenceIds: ["video-2"] },
    ],
    evidence: evidenceSet,
    games: [{ winner: "A", rounds: ["A", "A"] }],
  });
  assert.equal(unrelated.quality.checks.everyClaimOverlapsCitedEvidence, false);
  assert.equal(unrelated.status, "insufficient");
});

test("quality gate accepts claims with concrete overlap to their cited evidence", () => {
  const supported = evaluateBoutArticle({
    matchId: "match-1", boutId: "bout-1",
    summary: "ACQUA選手は画面端でブランカのローリングを2BASSA選手に当てた。その後、2BASSA選手の体力ゲージは残りわずかとなり、ACQUA選手が先鋒戦を2-1で制した。",
    summaryEvidenceIds: ["official", "video-1", "video-2"],
    keyPoints: [
      { text: "ACQUA選手がブランカのローリングを画面端で2BASSA選手に当てた。", evidenceIds: ["video-1"] },
      { text: "2BASSA選手の体力ゲージが残りわずかになった。", evidenceIds: ["video-2"] },
    ],
    evidence: evidenceSet,
    games: [{ winner: "A", rounds: ["A", "A"] }],
  });
  assert.equal(supported.quality.checks.everyClaimOverlapsCitedEvidence, true);
  assert.equal(supported.status, "passed");
});

test("machine checks create a shadow candidate and hold publication for editorial review", () => {
  const evaluated = evaluateBoutArticle({
    matchId: "match-1", boutId: "bout-1",
    summary: "ACQUA選手は画面端でブランカのローリングを2BASSA選手に当てた。その後、2BASSA選手の体力ゲージは残りわずかとなり、ACQUA選手が先鋒戦を2-1で制した。",
    summaryEvidenceIds: ["official", "video-1", "video-2"],
    keyPoints: [
      { text: "ACQUA選手がブランカのローリングを画面端で2BASSA選手に当てた。", evidenceIds: ["video-1"] },
      { text: "2BASSA選手の体力ゲージが残りわずかになった。", evidenceIds: ["video-2"] },
    ],
    evidence: evidenceSet,
    games: [{ winner: "A", rounds: ["A", "A"] }],
  });
  const candidate = applyPublicationMode(evaluated, "shadow");
  assert.equal(candidate.status, "candidate");
  assert.equal(applyPublicationMode(evaluated, "auto").status, "passed");

  const jobs: RecapJobsData = { schemaVersion: 1, updatedAt: "2026-10-21T00:00:00.000Z", jobs: {} };
  upsertJob({
    jobs, sectionId: "div-s-sec4", matchId: "match-1", boutId: "bout-1",
    officialInput: { matchId: "match-1" }, hasVideo: true, hasWindow: true,
    videoStatus: "complete", apiAvailable: true, article: candidate, editorial: false,
  });
  assert.equal(jobs.jobs["bout-1"].stage, "reviewing");
  assert.equal(jobs.jobs["bout-1"].quality, "candidate");
  assert.equal(jobs.jobs["bout-1"].publication, "results_only");
});
