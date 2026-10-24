import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyPublicationMode, evaluateBoutArticle } from "../scripts/recap/article-quality";
import { upsertJob, upsertMatchJob } from "../scripts/recap/recap-state";
import { nextArchiveCheckAt } from "../scripts/recap/check-schedule";
import { chaptersFromWatchPage } from "../scripts/recap/youtube-chapters";
import { prepareChapters } from "../scripts/prepare-recap-chapters";
import { MatchesDataSchema, VideoFactsDataSchema } from "../src/lib/schema";
import {
  isBoutVideoCacheStale,
  normalizeTopicWindow,
  videoAnalysisFingerprint,
} from "../scripts/recap/bout-video-facts";
import type { RecapEvidence, RecapJobsData } from "../src/lib/types";

const clip = { startSec: 2632, endSec: 3289 };

test("archive checks wait until 00:10 or 08:00 JST across date boundaries", () => {
  assert.equal(nextArchiveCheckAt(new Date("2026-10-23T23:59:00+09:00")), "2026-10-23T15:10:00.000Z");
  assert.equal(nextArchiveCheckAt(new Date("2026-10-24T00:10:00+09:00")), "2026-10-23T23:00:00.000Z");
  assert.equal(nextArchiveCheckAt(new Date("2026-10-24T07:59:00+09:00")), "2026-10-23T23:00:00.000Z");
  assert.equal(nextArchiveCheckAt(new Date("2026-10-24T08:00:00+09:00")), "2026-10-24T15:10:00.000Z");
});

test("late descriptions remain retryable and resume when chapters arrive, even after legacy review counts", () => {
  const jobs: RecapJobsData = { schemaVersion: 1, updatedAt: "2026-10-24T00:00:00Z", jobs: {} };
  const bout = { jobs, sectionId: "div-s-sec5", matchId: "match-1", boutId: "bout-1", officialInput: { bout: 1 }, hasVideo: true, hasWindow: false, videoStatus: "pending" as const, apiAvailable: true, editorial: false };
  const match = { jobs, sectionId: "div-s-sec5", matchId: "match-1", inputHash: "same", hasVideo: true, hasWindow: false, videoPending: true, apiAvailable: true, editorial: false, someBoutPassed: false };
  upsertJob(bout);
  upsertMatchJob(match);
  jobs.jobs["match-1:article"].attempts = 5;
  jobs.jobs["match-1:article"].stage = "needs_review";
  for (let check = 0; check < 5; check++) {
    upsertJob(bout);
    upsertMatchJob(match);
    assert.equal(jobs.jobs["bout-1"].stage, "waiting_window");
    assert.equal(jobs.jobs["match-1:article"].stage, "waiting_window");
    assert.equal(jobs.jobs["match-1:article"].attempts, 0);
    assert.ok(Date.parse(jobs.jobs["match-1:article"].nextAttemptAt!) > Date.now());
  }
  upsertJob({ ...bout, hasWindow: true });
  upsertMatchJob({ ...match, hasWindow: true });
  assert.equal(jobs.jobs["bout-1"].stage, "extracting");
  assert.equal(jobs.jobs["match-1:article"].stage, "extracting");
});

test("chapters can be read from either YouTube description layout and unavailable pages are retryable errors", () => {
  const description = "00:00 配信開始\n47:51 TEAM MATCH 1 先鋒戦";
  const expected = [{ startSec: 0, title: "配信開始" }, { startSec: 2871, title: "TEAM MATCH 1 先鋒戦" }];
  assert.deepEqual(chaptersFromWatchPage(JSON.stringify({ shortDescription: description })), expected);
  assert.deepEqual(chaptersFromWatchPage(`<script>var ytInitialData = ${JSON.stringify({ engagementPanels: [{ attributedDescription: { content: description } }] })};</script>`), expected);
  assert.throws(() => chaptersFromWatchPage("<html>description not ready</html>"), /next archive check/);
});

test("local chapter preparation preserves existing analysis while an unavailable description is retried later", async (t) => {
  const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/matches.json", import.meta.url), "utf8")));
  matches.completedSectionCount = { s: 1, f: 0 };
  matches.matches = matches.matches.filter((match) => match.sectionSlug === "div-s-sec1");
  const facts = VideoFactsDataSchema.parse({ updatedAt: "2026-10-24T00:00:00Z", videos: {}, bouts: {}, visual: {}, narratives: {}, pendingNarrations: ["keep-this-pending"] });
  let ready = false;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/streams")) return new Response("<html></html>");
    return new Response(ready ? JSON.stringify({ shortDescription: "00:00 配信開始\n39:38 TEAM MATCH 1 選手入場\n47:51 TEAM MATCH 1 先鋒戦\n56:26 中堅戦ホーム側オーダー発表" }) : "<html>description not ready</html>");
  });
  assert.equal(await prepareChapters(matches, facts), false);
  assert.equal(facts.updatedAt, "2026-10-24T00:00:00Z");
  ready = true;
  assert.equal(await prepareChapters(matches, facts), true);
  assert.equal(facts.videos["div-s-sec1"].chapters.length, 4);
  assert.deepEqual(facts.pendingNarrations, ["keep-this-pending"]);
});

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
