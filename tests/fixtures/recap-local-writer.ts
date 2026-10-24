// Isolated pipeline fixture: no network, no model calls, and no production writes.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
process.chdir(process.argv[2]);
process.env.GEMINI_API_KEY = "fixture-key";
process.env.GEMINI_VIDEO_MAX_CALLS = "0";
process.env.RECAP_TEXT_BACKEND = "codex";
process.env.RECAP_PUBLICATION_MODE = "auto";
globalThis.fetch = async () => new Response("", { status: 200 });
const { generateAndSaveMatchRecaps } = await import("../../scripts/4-generate-match-recaps");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join("src/data", name + ".json"), "utf8"));
const write = (name: string, data: unknown) => fs.writeFileSync(path.join("src/data", name + ".json"), JSON.stringify(data));
const run = () => generateAndSaveMatchRecaps({ onlySection: "div-s-sec5", refreshChapters: false });
const matchId = "div-s-sec5-m1";
await generateAndSaveMatchRecaps({ onlySection: "div-s-sec5", resultsOnly: true, refreshChapters: false });
const evidence = read("recap-evidence");
const facts = read("video-facts");
const ids = Object.keys(facts.bouts).filter((id) => id.startsWith(matchId + "-b"));
assert.equal(ids.length, 3);
for (const id of ids) {
  facts.bouts[id].status = "complete";
  facts.bouts[id].runs = [{ model: "fixture", analyzedAt: new Date().toISOString(), gameWinnersSeen: ["A"], gatePassed: true, gateReason: "fixture", topics: [] }];
  const official: any = Object.values(evidence.evidence).find((item: any) => item.boutId === id && item.kind === "official");
  assert.ok(official);
  for (let index = 0; index < 2; index++) {
    const observation = index ? "中央でドライブラッシュを使って距離を詰め、相手の通常技に差し返しを決めて攻撃を継続した。" : "画面端で投げを決めた後にドライブインパクトを重ね、相手のガードを崩して連続技につなげた。";
    const item = { ...official, id: id + "-fixture" + index, kind: "visual", observation, status: "verified", verifierVersion: "independent-description-v3", sourceModels: ["fixture", "independent-fixture"] };
    evidence.evidence[item.id] = item;
  }
}
write("video-facts", facts);
write("recap-evidence", evidence);
write("recap-articles", { schemaVersion: 1, updatedAt: new Date().toISOString(), articles: {} });
await run();
const request = () => read("recap-write-requests").requests[matchId];
assert.equal(request().stage, "queued");
const initialHash = request().inputHash;
let output = { matchHeadline: "動作確認の未公開原稿", matchSummary: "短い未公開原稿", matchEvidenceIds: [] as string[], bouts: ids.map((boutId) => ({ boutId, summary: "短い原稿", summaryEvidenceIds: [] as string[], keyPoints: [] as Array<{ text: string; evidenceIds: string[] }> })) };
const submit = async (inputHash: string, runId: string) => {
  process.env.RECAP_NARRATIVE_CACHE = Buffer.from(JSON.stringify([{ matchId, inputHash, model: "codex-cli", runId, generatedAt: new Date().toISOString(), output, usage: { inputTokens: 10, outputTokens: 2 } }])).toString("base64");
  await run();
  delete process.env.RECAP_NARRATIVE_CACHE;
};
// Job scheduling counters must not invalidate a draft while it is being written.
const jobs = read("recap-jobs");
for (const job of Object.values(jobs.jobs) as any[]) if (job.matchId === matchId) job.attempts = 7;
write("recap-jobs", jobs);
await submit(initialHash, "first");
assert.equal(request().attempts, 1);
await run();
const retryHash = request().inputHash;
assert.notEqual(retryHash, initialHash);
await run();
assert.equal(request().inputHash, retryHash, "queued retries are stable across continuation ticks");
await submit(initialHash, "first");
assert.equal(request().attempts, 1, "stale drafts cannot consume another quality retry");
assert.equal(request().inputHash, retryHash);
await submit(retryHash, "second");
assert.equal(request().attempts, 2);
await run();
await submit(request().inputHash, "third");
assert.equal(request().stage, "needs_review");
assert.equal(read("recap-jobs").jobs[matchId + ":article"].stage, "needs_review");
assert.equal(Object.values(read("recap-articles").articles).some((article: any) => article.matchId === matchId && article.status === "passed"), false);
const usage: any = Object.values(read("recap-token-usage").days)[0];
assert.equal(usage["codex:narration:codex-cli"].responses, 3, "resubmitting a cached draft is not double counted");
// New verified facts reopen the request with a stable hash and a fresh retry allowance.
const newEvidence = read("recap-evidence");
newEvidence.evidence[ids[0] + "-fixture0"].verificationObservation = "追加の独立確認が完了した。";
write("recap-evidence", newEvidence);
await run();
assert.equal(request().attempts, 0);
assert.equal(request().stage, "queued");
const recoveredHash = request().inputHash;
await run();
assert.equal(request().inputHash, recoveredHash);
output = { matchHeadline: "検証済みの攻防から振り返る一戦", matchSummary: ids.map((id) => newEvidence.evidence[id + "-fixture0"].observation + newEvidence.evidence[id + "-fixture1"].observation).join(""), matchEvidenceIds: ids.flatMap((id) => [id + "-fixture0", id + "-fixture1"]), bouts: ids.map((boutId) => ({
  boutId, summary: newEvidence.evidence[boutId + "-fixture0"].observation + newEvidence.evidence[boutId + "-fixture1"].observation,
  summaryEvidenceIds: [boutId + "-fixture0", boutId + "-fixture1"],
  keyPoints: [0, 1].map((index) => ({ text: newEvidence.evidence[boutId + "-fixture" + index].observation, evidenceIds: [boutId + "-fixture" + index] })),
})) };
await submit(recoveredHash, "passed");
assert.equal(request().stage, "completed");
assert.equal(request().prompt, "");
assert.equal(read("recap-jobs").jobs[matchId + ":article"].stage, "completed");
await run();
assert.equal(request().stage, "completed", "publishing must not queue another draft when quality feedback clears");
assert.equal(request().inputHash, recoveredHash);
console.log("LOCAL_WRITER_PIPELINE_OK");
