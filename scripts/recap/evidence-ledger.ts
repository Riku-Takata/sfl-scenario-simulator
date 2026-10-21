import crypto from "node:crypto";
import type { BoutVideoFacts, RecapEvidence } from "../../src/lib/types";
import { passedRuns, type BoutContext } from "./bout-video-facts";
import type { BoutGameDetail } from "./narration";
import { callGemini, parseJsonLoose } from "./gemini-client";
import { z } from "zod";

export const EVIDENCE_EXTRACTOR_VERSION = "recap-evidence-v1";
export const EVIDENCE_VERIFIER_VERSION = "independent-model-overlap-v1";
const VerifierOutputSchema = z.object({ verdict: z.enum(["verified", "rejected", "uncertain"]), observation: z.string().optional() });

function stableId(value: string): string {
  return "ev-" + crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s、。，．・「」『』【】（）()!?！？:：]/g, "");
}

function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x), gy = grams(y);
  if (!gx.size || !gy.size) return 0;
  let common = 0;
  for (const g of gx) if (gy.has(g)) common++;
  return (2 * common) / (gx.size + gy.size);
}

export function buildBoutEvidence(options: {
  sectionId: string;
  matchId: string;
  boutId: string;
  videoFacts?: BoutVideoFacts;
  ctx: BoutContext;
  games: BoutGameDetail[];
}): RecapEvidence[] {
  const { sectionId, matchId, boutId, videoFacts, ctx, games } = options;
  const createdAt = new Date().toISOString();
  const evidence: RecapEvidence[] = [];
  const officialText = ctx.playerA.name + "と" + ctx.playerB.name + "の" + ctx.statusName +
    "は" + Math.max(ctx.scoreA, ctx.scoreB) + "-" + Math.min(ctx.scoreA, ctx.scoreB) + "。" +
    games.map((g, i) => "第" + (i + 1) + "ゲーム" + (g.winner === "A" ? ctx.playerA.name : ctx.playerB.name) + "が勝利").join("、");
  evidence.push({
    id: stableId(boutId + ":official:" + officialText), sectionId, matchId, boutId, kind: "official",
    ...(videoFacts ? { videoId: videoFacts.videoId, startSec: videoFacts.startSec, endSec: videoFacts.endSec } : {}),
    playerIds: [ctx.playerA.name, ctx.playerB.name], observation: officialText,
    officialRefs: [boutId + ":score", ...games.map((_, i) => boutId + ":game:" + i + ":winner-and-rounds")],
    status: "verified", extractorVersion: "official-log-v1", verifierVersion: "official-source-v1",
    sourceModels: [], createdAt,
  });
  if (!videoFacts) return evidence;

  const runs = passedRuns(videoFacts);
  for (let i = 0; i < runs.length; i++) {
    for (const topic of runs[i].topics) {
      const matching = runs.findIndex((other, j) => j !== i && other.model !== runs[i].model &&
        other.topics.some((candidate) => similarity(topic.topic, candidate.topic) >= 0.55));
      const confirmation = matching >= 0
        ? runs[matching].topics.find((candidate) => similarity(topic.topic, candidate.topic) >= 0.55)
        : undefined;
      const observation = confirmation && normalize(confirmation.topic).length > normalize(topic.topic).length
        ? confirmation.topic : topic.topic;
      const id = stableId(boutId + ":video:" + normalize(observation));
      if (evidence.some((item) => item.id === id)) continue;
      const startCandidates = [topic.startSec, confirmation?.startSec].filter((n): n is number => n !== undefined);
      const endCandidates = [topic.endSec, confirmation?.endSec].filter((n): n is number => n !== undefined);
      const preciseWindow = startCandidates.length > 0 && endCandidates.length > 0;
      const startSec = preciseWindow ? Math.max(...startCandidates) : videoFacts.startSec;
      const endSec = preciseWindow ? Math.min(...endCandidates) : videoFacts.endSec;
      const validWindow = preciseWindow && endSec > startSec && startSec >= videoFacts.startSec && endSec <= videoFacts.endSec;
      evidence.push({
        id, sectionId, matchId, boutId,
        kind: topic.evidence === "実況" ? "commentary" : "visual",
        videoId: videoFacts.videoId, ...(validWindow ? { startSec, endSec } : {}),
        playerIds: [ctx.playerA.name, ctx.playerB.name], observation,
        officialRefs: [boutId + ":winner-order-reviewed"],
        // Two extractors nominate the same fact, but only a targeted review below can verify it.
        status: "candidate",
        extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
        ...(confirmation && validWindow ? { verifierVersion: "cross-model-candidate-v1" } : {}),
        sourceModels: confirmation ? [...new Set([runs[i].model, runs[matching].model])] : [runs[i].model],
        createdAt,
      });
    }
  }
  return evidence;
}

export async function verifyEvidenceCandidate(options: {
  apiKey: string;
  models: string[];
  candidate: RecapEvidence;
}): Promise<RecapEvidence> {
  const { apiKey, candidate } = options;
  if (!candidate.videoId || candidate.startSec === undefined || candidate.endSec === undefined || candidate.endSec <= candidate.startSec) return candidate;
  const models = options.models.filter((model) => !candidate.sourceModels.includes(model));
  if (models.length === 0) return candidate;
  const result = await callGemini({
    apiKey,
    models,
    video: { youtubeUrl: "https://www.youtube.com/watch?v=" + candidate.videoId, startSec: candidate.startSec, endSec: candidate.endSec, fps: 2 },
    prompt: `次の映像上の主張だけを指定区間で確認してください。主張: ${candidate.observation}\n\n動画で直接確認できるならverified、明確に誤りならrejected、判定できなければuncertain。説明は観測可能な範囲に限り、主張を補強するために推測しないでください。JSONのみ: {"verdict":"verified|rejected|uncertain","observation":"確認した短い事実"}`,
    temperature: 0,
  });
  if (!result) return candidate;
  try {
    const parsed = VerifierOutputSchema.parse(parseJsonLoose(result.text));
    const compatibleObservation = !parsed.observation?.trim() || similarity(candidate.observation, parsed.observation) >= 0.35;
    return {
      ...candidate,
      status: parsed.verdict === "uncertain" || !compatibleObservation ? "disputed" : parsed.verdict,
      verifierVersion: "targeted-video-review-v1",
      sourceModels: [...new Set([...candidate.sourceModels, result.model])],
    };
  } catch {
    return { ...candidate, status: "disputed", verifierVersion: "targeted-video-review-v1" };
  }
}

export function evidenceSimilarity(a: string, b: string): number {
  return similarity(a, b);
}
