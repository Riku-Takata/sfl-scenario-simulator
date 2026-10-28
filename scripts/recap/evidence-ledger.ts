import crypto from "node:crypto";
import type { BoutVideoFacts, RecapEvidence } from "../../src/lib/types";
import { passedRuns, type BoutContext } from "./bout-video-facts";
import type { BoutGameDetail } from "./narration";
import { callGemini, parseJsonLoose } from "./gemini-client";
import { z } from "zod";

export const EVIDENCE_EXTRACTOR_VERSION = "recap-evidence-v2";
export const EVIDENCE_VERIFIER_VERSION = "independent-description-v3";
// Evidence a person checked against the video; re-extraction must not reset it.
export const MANUAL_REVIEW_VERIFIER_VERSION = "manual-review-v1";
const VerifierOutputSchema = z.object({ observation: z.string().min(8) });

export function mergeEvidenceCandidate(candidate: RecapEvidence, prior?: RecapEvidence): RecapEvidence {
  if (prior && prior.verificationObservation && prior.status === "disputed" && observationSupported(prior.observation, prior.verificationObservation)) {
    return { ...prior, status: "verified", verifierVersion: EVIDENCE_VERIFIER_VERSION };
  }
  const reviewed = prior?.verifierVersion === EVIDENCE_VERIFIER_VERSION ||
    prior?.verifierVersion === MANUAL_REVIEW_VERIFIER_VERSION ||
    (prior?.status === "verified" && prior.verifierVersion === "independent-description-v2");
  return prior && reviewed ? prior : { ...candidate, createdAt: prior?.createdAt ?? candidate.createdAt };
}

export function pendingEvidenceCandidates(evidence: RecapEvidence[], limit = 3): RecapEvidence[] {
  const capable = (item: RecapEvidence) => Number(item.sourceModels.some((model) => !/lite/i.test(model)));
  // 2モデルの解析で一致した候補は検証を通りやすいので先に回し、少ない呼び出しで必要数に届かせる。
  const agreed = (item: RecapEvidence) => Number(item.sourceModels.length >= 2);
  return evidence.filter((item) => item.status === "candidate" && item.startSec !== undefined && item.endSec !== undefined)
    .sort((a, b) => agreed(b) - agreed(a) || capable(b) - capable(a))
    .slice(0, limit);
}

// 一致した2モデルの時間窓の重なりは数秒しか残らないことが多く、そのままでは検証側が攻防を追えない。
export const MIN_VERIFICATION_CLIP_SEC = 12;
export const MAX_VERIFICATION_BATCH = 4;

/** 検証で見せる区間。短すぎる区間は中心を保ったまま最小長まで広げる。 */
export function verificationWindow(candidate: RecapEvidence): { startSec: number; endSec: number } {
  const startSec = candidate.startSec!;
  const endSec = candidate.endSec!;
  if (endSec - startSec >= MIN_VERIFICATION_CLIP_SEC) return { startSec, endSec };
  const widenedStart = Math.max(0, Math.floor((startSec + endSec) / 2 - MIN_VERIFICATION_CLIP_SEC / 2));
  return { startSec: widenedStart, endSec: widenedStart + MIN_VERIFICATION_CLIP_SEC };
}

/**
 * 1回の呼び出しでまとめて検証する候補と、使えるモデルを選ぶ。
 * 検証は抽出に使っていないモデルで行うので、最も多くの候補を受け持てるモデルを基準にする。
 */
export function selectVerificationBatch(candidates: RecapEvidence[], videoModels: string[]): { candidates: RecapEvidence[]; models: string[] } {
  const verifiable = candidates.filter((item) => item.videoId && item.startSec !== undefined && item.endSec !== undefined && item.endSec > item.startSec);
  const capable = videoModels.filter((model) => !/lite/i.test(model));
  let best: RecapEvidence[] = [];
  // 受け持てる数が同じなら、優先度の高い (先頭に近い) 候補を含むモデルを選ぶ。
  const rank = (items: RecapEvidence[]) => items.map((item) => verifiable.indexOf(item));
  const earlier = (a: number[], b: number[]) => {
    const i = a.findIndex((value, j) => value !== b[j]);
    return i >= 0 && a[i] < b[i];
  };
  for (const model of capable) {
    const compatible = verifiable.filter((item) => !item.sourceModels.includes(model) && item.videoId === verifiable[0]?.videoId);
    if (compatible.length > best.length || (compatible.length === best.length && earlier(rank(compatible), rank(best)))) best = compatible;
  }
  const batch = best.slice(0, MAX_VERIFICATION_BATCH);
  return { candidates: batch, models: capable.filter((model) => batch.every((item) => !item.sourceModels.includes(model))) };
}

const BatchVerifierOutputSchema = z.object({
  observations: z.array(z.object({ clip: z.number().int().positive(), observation: z.string() })),
});

/**
 * 複数の候補を1リクエストで独立に検証する。呼び出しに失敗したら null (候補はそのまま)。
 * 区間ごとの判定基準は verifyEvidenceCandidate と同じ。
 */
export async function verifyEvidenceBatch(options: {
  apiKey: string;
  models: string[];
  candidates: RecapEvidence[];
}): Promise<RecapEvidence[] | null> {
  const { apiKey, models, candidates } = options;
  if (candidates.length === 0 || models.length === 0) return null;
  const clips = candidates.map(verificationWindow);
  const result = await callGemini({
    purpose: "verify",
    apiKey,
    models,
    video: { youtubeUrl: "https://www.youtube.com/watch?v=" + candidates[0].videoId, startSec: clips[0].startSec, endSec: clips[0].endSec, fps: 2, clips },
    prompt: `ストリートファイター6の映像区間が${clips.length}本、区間1から順に渡されます。区間ごとに独立に観察してください。識別できるキャラクター名、具体的な技・システム、画面端や体力・ゲージの状況、攻防の順序を、画面・音声で直接確認できる範囲で記述してください。一般的な「キャラクターが攻撃した」だけに省略せず、識別できない部分は不明としてください。区間外の結果・勝敗、心理、意図を推測せず、他の区間の内容を混ぜないでください。候補の主張は知らされていない前提で観察します。JSONのみ: {"observations":[{"clip":1,"observation":"観察内容"}]}`,
    temperature: 0,
  });
  if (!result) return null;
  let observations: Map<number, string>;
  try {
    observations = new Map(BatchVerifierOutputSchema.parse(parseJsonLoose(result.text)).observations
      .map((item) => [item.clip, item.observation.trim()] as const));
  } catch {
    return candidates.map((candidate) => ({ ...candidate, status: "disputed" as const, verifierVersion: EVIDENCE_VERIFIER_VERSION }));
  }
  return candidates.map((candidate, index) => {
    const observation = observations.get(index + 1);
    // 区間の記述が欠けた候補は判定せず、次の検証に回す。
    if (!observation || observation.length < 8) return candidate;
    return {
      ...candidate,
      status: observationSupported(candidate.observation, observation) ? "verified" as const : "disputed" as const,
      verifierVersion: EVIDENCE_VERIFIER_VERSION,
      verificationObservation: observation,
      sourceModels: [...new Set([...candidate.sourceModels, result.model])],
    };
  });
}

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

export function observationSupported(candidateObs: string, verifiedObs: string): boolean {
  const sim = similarity(candidateObs, verifiedObs);
  if (sim >= 0.28) return true;
  const x = normalize(candidateObs);
  const y = normalize(verifiedObs);
  if (!x || !y) return false;
  if (y.includes(x)) return true;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x), gy = grams(y);
  if (!gx.size || !gy.size) return false;
  let common = 0;
  for (const g of gx) if (gy.has(g)) common++;
  const coverage = common / gx.size;
  return coverage >= 0.22 && sim >= 0.10;
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
      const startSec = preciseWindow ? Math.max(...startCandidates) : undefined;
      const endSec = preciseWindow ? Math.min(...endCandidates) : undefined;
      const validWindow = preciseWindow && endSec! > startSec! && startSec! >= videoFacts.startSec && endSec! <= videoFacts.endSec;
      // Untimed topics cannot be independently re-opened and therefore stay out of the evidence ledger.
      if (!validWindow) continue;
      evidence.push({
        id, sectionId, matchId, boutId,
        kind: topic.evidence === "実況" ? "commentary" : "visual",
        videoId: videoFacts.videoId, startSec, endSec,
        playerIds: [ctx.playerA.name, ctx.playerB.name], observation,
        officialRefs: [boutId + ":winner-order-reviewed"],
        // Extraction only nominates a fact; a separate targeted review verifies it.
        status: "candidate",
        extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
        ...(confirmation ? { verifierVersion: "cross-model-candidate-v1" } : {}),
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
  const models = options.models.filter((model) => !/lite/i.test(model) && !candidate.sourceModels.includes(model));
  if (models.length === 0) return candidate;
  // Blind pass: independently describe the clip before showing the model the claim.
  const clip = verificationWindow(candidate);
  const result = await callGemini({
    purpose: "verify",
    apiKey,
    models,
    video: { youtubeUrl: "https://www.youtube.com/watch?v=" + candidate.videoId, startSec: clip.startSec, endSec: clip.endSec, fps: 2 },
    prompt: `ストリートファイター6のこの指定区間を独立に観察してください。識別できるキャラクター名、具体的な技・システム、画面端や体力・ゲージの状況、攻防の順序を、画面・音声で直接確認できる範囲で記述してください。一般的な「キャラクターが攻撃した」だけに省略せず、識別できない部分は不明としてください。指定区間外の結果・勝敗、心理、意図を推測しないでください。候補の主張は知らされていない前提で観察します。JSONのみ: {"observation":"観察内容"}`,
    temperature: 0,
  });
  if (!result) return candidate;
  try {
    const parsed = VerifierOutputSchema.parse(parseJsonLoose(result.text));
    const compatibleObservation = observationSupported(candidate.observation, parsed.observation);
    return {
      ...candidate,
      status: compatibleObservation ? "verified" : "disputed",
      verifierVersion: EVIDENCE_VERIFIER_VERSION,
      verificationObservation: parsed.observation.trim(),
      sourceModels: [...new Set([...candidate.sourceModels, result.model])],
    };
  } catch {
    return { ...candidate, status: "disputed", verifierVersion: EVIDENCE_VERIFIER_VERSION };
  }
}

export function evidenceSimilarity(a: string, b: string): number {
  return similarity(a, b);
}
