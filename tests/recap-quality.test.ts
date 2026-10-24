import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyPublicationMode, evaluateBoutArticle } from "../scripts/recap/article-quality";
import { upsertJob, upsertMatchJob } from "../scripts/recap/recap-state";
import { nextArchiveCheckAt } from "../scripts/recap/check-schedule";
import { chaptersFromWatchPage } from "../scripts/recap/youtube-chapters";
import { prepareChapters } from "../scripts/prepare-recap-chapters";
import { mergeEvidenceCandidate, pendingEvidenceCandidates, verifyEvidenceCandidate, EVIDENCE_VERIFIER_VERSION } from "../scripts/recap/evidence-ledger";
import { MatchesDataSchema, VideoFactsDataSchema } from "../src/lib/schema";
import { articleEvidenceReady, mergePreparedChapters, selectAutomaticSection } from "../scripts/recap/automation";
import { persistentVideoBudget, remainingDailyUsage, usageDay, type RecapUsage, DAILY_VIDEO_LIMIT } from "../scripts/recap/usage";
import {
  isBoutVideoCacheStale,
  normalizeTopicWindow,
  videoAnalysisFingerprint,
  budgetAllows,
  advanceBoutAnalysis,
} from "../scripts/recap/bout-video-facts";
import type { RecapEvidence, RecapJobsData } from "../src/lib/types";
import type { BoutVideoFacts } from "../src/lib/types";

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

test("automatic lifecycle waits for video metadata, wakes on fresh chapters, and stops after publication", () => {
  const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/matches.json", import.meta.url), "utf8")));
  const match = matches.matches.find((match) => match.sectionSlug === "div-s-sec1" && match.matchNumber === 1)!;
  const facts = VideoFactsDataSchema.parse({ updatedAt: "2026-10-24T00:00:00Z", videos: {}, bouts: {}, visual: {}, narratives: {}, pendingNarrations: [] });
  const jobs: RecapJobsData = { schemaVersion: 1, updatedAt: "2026-10-24T00:00:00Z", jobs: {} };
  upsertMatchJob({ jobs, sectionId: match.sectionSlug, matchId: match.id, inputHash: "source", hasVideo: false, hasWindow: false, videoPending: true, apiAvailable: true, editorial: false, someBoutPassed: false });
  const job = jobs.jobs[match.id + ":article"];
  job.nextAttemptAt = "2026-10-24T23:00:00Z";
  const context = { matches, facts, jobs, apiAvailable: true, now: Date.parse("2026-10-24T22:00:00Z"), allowArchiveCheck: false };
  assert.equal(selectAutomaticSection(context), undefined);
  assert.equal(selectAutomaticSection({ ...context, allowArchiveCheck: true }), undefined);
  assert.equal(selectAutomaticSection({ ...context, allowArchiveCheck: true, now: Date.parse(job.nextAttemptAt) }), match.sectionSlug);
  facts.videos[match.sectionSlug] = { videoId: "VIDEO", chapters: [
    { startSec: 0, title: "TEAM MATCH 1 選手入場" },
    ...(match.bouts ?? []).map((bout, index) => ({ startSec: (index + 1) * 60, title: `TEAM MATCH 1 ${bout.statusName}` })),
  ] };
  assert.equal(selectAutomaticSection(context), match.sectionSlug, "new chapters wake waiting jobs without waiting another day");
  job.leaseUntil = "2026-10-25T00:00:00Z";
  assert.equal(selectAutomaticSection(context), undefined, "active work is not duplicated");
  delete job.leaseUntil;
  job.stage = "completed";
  job.quality = "passed";
  job.publication = "detailed";
  assert.equal(selectAutomaticSection({ ...context, allowArchiveCheck: true }), undefined);
});

test("writing waits for independently verified video evidence rather than generating a low-information draft", () => {
  assert.equal(articleEvidenceReady(evidenceSet.map((item) => ({ ...item, status: item.kind === "official" ? "verified" : "candidate" }))), false);
  assert.equal(articleEvidenceReady(evidenceSet), true);
  assert.equal(articleEvidenceReady(evidenceSet.filter((item) => item.kind !== "official")), false);
});

test("prepared chapters merge under the writer without replacing analysis, and reject foreign sections", () => {
  const matches = MatchesDataSchema.parse(JSON.parse(fs.readFileSync(new URL("../src/data/matches.json", import.meta.url), "utf8")));
  const facts = VideoFactsDataSchema.parse({ updatedAt: "2026-10-24T00:00:00Z", videos: {}, bouts: {}, visual: {}, narratives: {}, pendingNarrations: ["preserve-analysis"] });
  const encoded = Buffer.from(JSON.stringify({ "div-s-sec1": { videoId: "RdpsP-M30sU", chapters: [{ startSec: 0, title: "配信開始" }] } })).toString("base64");
  assert.equal(mergePreparedChapters(facts, matches, encoded), true);
  assert.deepEqual(facts.pendingNarrations, ["preserve-analysis"]);
  assert.equal(mergePreparedChapters(facts, matches, encoded), false);
  const foreign = Buffer.from(JSON.stringify({ "div-s-sec999": { videoId: "RdpsP-M30sU", chapters: [] } })).toString("base64");
  assert.throws(() => mergePreparedChapters(facts, matches, foreign), /Unexpected prepared section/);
});

test("continuations share a persisted daily budget and resume after the JST date changes", () => {
  const day = usageDay();
  const usage: RecapUsage = { schemaVersion: 1, days: { [day]: { calls: 90, videoSeconds: DAILY_VIDEO_LIMIT - 20 } } };
  let saved: RecapUsage = structuredClone(usage);
  const budget = persistentVideoBudget({ calls: 0, videoSeconds: 0, maxCalls: 24, maxVideoSeconds: DAILY_VIDEO_LIMIT }, usage, (value) => { saved = structuredClone(value); });
  assert.equal(budget.maxCalls, 6);
  assert.equal(budget.maxVideoSeconds, 20);
  budget.calls += 1;
  budget.videoSeconds += 12;
  assert.deepEqual(saved.days[day], { calls: 91, videoSeconds: DAILY_VIDEO_LIMIT - 8 });
  assert.equal(budgetAllows(budget, 9), false);
  const resumed = persistentVideoBudget({ calls: 0, videoSeconds: 0, maxCalls: 24, maxVideoSeconds: DAILY_VIDEO_LIMIT }, saved, () => {});
  assert.equal(resumed.maxCalls, 5);
  assert.equal(resumed.maxVideoSeconds, 8);
  const tomorrow = new Date(Date.parse(`${day}T12:00:00+09:00`) + 24 * 3600_000);
  assert.deepEqual(remainingDailyUsage(saved, tomorrow), { calls: 96, videoSeconds: DAILY_VIDEO_LIMIT });
});

test("insufficient verified facts can collect one more observation without exceeding the bout analysis cap", async (t) => {
  const facts: BoutVideoFacts = { videoId: "VIDEO", startSec: 100, endSec: 200, status: "complete", staleRuns: [], runs: ["model-a", "model-b"].map((model) => ({ model, analyzedAt: "2026-10-24T00:00:00Z", gameWinnersSeen: ["A", "A"], gatePassed: true, gateReason: "matched", topics: [] })) };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({ output_text: JSON.stringify({ gameWinnersSeen: ["A", "A"], topics: [{ topic: "選手Aが画面端でドライブインパクトを当てた。", evidence: "映像", startSec: 10, endSec: 20 }] }) }));
  });
  const budget = { calls: 0, videoSeconds: 0, maxCalls: 8, maxVideoSeconds: 1000 };
  const ctx = { boutId: "bout", divisionLabel: "Division S", sectionTitle: "第1節", matchNumber: 1, statusName: "先鋒戦", bestOf: 3, playerA: { name: "A", chara: "ケン", team: "A" }, playerB: { name: "B", chara: "リュウ", team: "B" }, officialGameWinners: ["A", "A"] as Array<"A" | "B">, boutWinner: "A" as const, scoreA: 2, scoreB: 0 };
  await advanceBoutAnalysis({ apiKey: "test", models: ["model-c"], facts, ctx, budget, fps: 1, collectMoreEvidence: true });
  assert.equal(calls, 1);
  assert.equal(facts.runs.length, 3);
  assert.equal(facts.status, "complete");
  await advanceBoutAnalysis({ apiKey: "test", models: ["model-d"], facts, ctx, budget, fps: 1, collectMoreEvidence: true });
  await advanceBoutAnalysis({ apiKey: "test", models: ["model-e"], facts, ctx, budget, fps: 1, collectMoreEvidence: true });
  assert.equal(calls, 2);
  assert.equal(facts.runs.length, 4);
});

test("evidence review advances past saved decisions instead of rechecking the first two candidates forever", () => {
  const candidates = ["one", "two", "three"].map((id) => ({ ...evidence(id, "visual", "画面端でブランカのローリングが相手にヒットした。"), status: "candidate" as const }));
  const saved = [
    { ...candidates[0], status: "verified" as const, verifierVersion: EVIDENCE_VERIFIER_VERSION },
    { ...candidates[1], status: "disputed" as const, verifierVersion: EVIDENCE_VERIFIER_VERSION },
  ];
  const merged = candidates.map((candidate) => mergeEvidenceCandidate(candidate, saved.find((prior) => prior.id === candidate.id)));
  assert.deepEqual(pendingEvidenceCandidates(merged).map((candidate) => candidate.id), ["three"]);
  assert.equal(mergeEvidenceCandidate(candidates[0], { ...saved[0], verifierVersion: "independent-description-v2" }).status, "verified");
  assert.equal(mergeEvidenceCandidate(candidates[1], { ...saved[1], verifierVersion: "independent-description-v2" }).status, "candidate");
});

test("independent verification uses a capable model distinct from the extractor, with the same evidence gate", async (t) => {
  const observation = "ブランカが画面端でローリングを当て、相手の体力ゲージが残りわずかになった。";
  const candidate = { ...evidence("review", "visual", observation), status: "candidate" as const, sourceModels: ["gemini-3.8-flash"] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls++;
    const request = JSON.parse(String(options.body));
    assert.equal(request.model, "gemini-3.6-flash");
    return new Response(JSON.stringify({ output_text: JSON.stringify({ observation }) }));
  });
  const verified = await verifyEvidenceCandidate({ apiKey: "test", models: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"], candidate });
  assert.equal(calls, 1);
  assert.equal(verified.status, "verified");
  assert.deepEqual(verified.sourceModels, ["gemini-3.8-flash", "gemini-3.6-flash"]);
});

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
