import crypto from "node:crypto";
import type { BoutGameDetail } from "./narration";
import type { RecapArticle, RecapEvidence } from "../../src/lib/types";
import { contradictsOfficialRounds, isVacuousKeyPoint } from "./narration";

export const ARTICLE_QUALITY_VERSION = "recap-quality-v2";

export function applyPublicationMode(article: RecapArticle, mode: "shadow" | "auto"): RecapArticle {
  if (mode === "auto" || article.status !== "passed") return article;
  return { ...article, articleId: article.articleId.replace(/:published$/, ":candidate"), status: "candidate" };
}

function normalizeText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[\s、。，．・「」『』【】（）()!?！？:：]/g, "");
}

function diceSimilarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const bigrams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2)));
  const aGrams = bigrams(left);
  const bGrams = bigrams(right);
  if (!aGrams.size || !bGrams.size) return 0;
  let overlap = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) overlap++;
  return (2 * overlap) / (aGrams.size + bGrams.size);
}

function sentences(text: string): string[] {
  return text.split(/(?<=[。！？!?])\s*|\r?\n+/).map((part) => part.trim()).filter(Boolean);
}

function revision(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function evaluateBoutArticle(input: {
  matchId: string;
  boutId: string;
  summary: string;
  summaryEvidenceIds: string[];
  keyPoints: Array<{ text: string; evidenceIds: string[] }>;
  evidence: RecapEvidence[];
  games: BoutGameDetail[];
}): RecapArticle {
  const allowed = new Map(input.evidence.filter((e) => e.status === "verified" && e.boutId === input.boutId).map((e) => [e.id, e]));
  const validSummaryRefs = input.summaryEvidenceIds.filter((id) => allowed.has(id));
  const keyPoints = input.keyPoints.map((point) => ({
    text: point.text.trim(),
    evidenceIds: point.evidenceIds.filter((id) => allowed.has(id)),
  }));
  const cited = [...new Set([...validSummaryRefs, ...keyPoints.flatMap((point) => point.evidenceIds)])];
  const claimMappings = [
    ...sentences(input.summary).map((text) => ({ text, refs: validSummaryRefs })),
    ...keyPoints.flatMap((point) => sentences(point.text).map((text) => ({ text, refs: point.evidenceIds }))),
  ];
  const claimsHaveEvidenceOverlap = claimMappings.length > 0 && claimMappings.every(({ text, refs }) =>
    refs.some((id) => diceSimilarity(text, allowed.get(id)?.observation ?? "") >= 0.12 ||
      diceSimilarity(text, allowed.get(id)?.verificationObservation ?? "") >= 0.12));
  const videoEvidencePoints = keyPoints.filter((point) => point.evidenceIds.some((id) => {
    const kind = allowed.get(id)?.kind;
    return kind === "visual" || kind === "commentary";
  })).length;
  const checks: Record<string, boolean> = {
    summaryHasVerifiedReferences: validSummaryRefs.length > 0,
    everyPointHasVerifiedReferences: keyPoints.length > 0 && keyPoints.every((point) => point.evidenceIds.length > 0),
    noForeignEvidence: cited.length === new Set([...input.summaryEvidenceIds, ...input.keyPoints.flatMap((point) => point.evidenceIds)]).size &&
      cited.length === new Set([...validSummaryRefs, ...keyPoints.flatMap((point) => point.evidenceIds)]).size,
    noOfficialContradiction: ![input.summary, ...keyPoints.map((point) => point.text)].some((text) => contradictsOfficialRounds(text, input.games)),
    summaryHasSubstance: input.summary.trim().length >= 45,
    enoughSpecificPoints: keyPoints.length >= 2 && keyPoints.every((point) => point.text.length >= 24 && !isVacuousKeyPoint(point.text)),
    multipleVideoBackedPoints: videoEvidencePoints >= 2,
    noRepeatedPoints: new Set(keyPoints.map((point) => point.text.replace(/\s/g, ""))).size === keyPoints.length,
    everyClaimOverlapsCitedEvidence: claimsHaveEvidenceOverlap,
  };
  const passed = Object.values(checks).every(Boolean);
  const reasons = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  const body = JSON.stringify({ matchId: input.matchId, boutId: input.boutId, summary: input.summary, keyPoints, cited });
  return {
    articleId: input.boutId + ":" + revision(body) + (passed ? ":published" : ":candidate"),
    matchId: input.matchId,
    boutId: input.boutId,
    revision: revision(body),
    status: passed ? "passed" : "insufficient",
    summary: input.summary.trim(),
    summaryEvidenceIds: validSummaryRefs,
    keyPoints,
    evidenceIds: cited,
    quality: {
      score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
      checks,
      reasons,
      evaluatedAt: new Date().toISOString(),
      evaluatorVersion: ARTICLE_QUALITY_VERSION,
    },
    createdAt: new Date().toISOString(),
  };
}

export function evaluateMatchArticle(input: {
  matchId: string;
  headline: string;
  summary: string;
  evidenceIds: string[];
  boutArticles: RecapArticle[];
  evidence: RecapEvidence[];
}): RecapArticle {
  const allowed = new Map(input.evidence.filter((e) => e.status === "verified" && e.matchId === input.matchId).map((e) => [e.id, e]));
  const refs = input.evidenceIds.filter((id) => allowed.has(id));
  const allBoutsPassed = input.boutArticles.length > 0 && input.boutArticles.every((article) => article.status === "passed");
  const coversAllBouts = input.boutArticles.every((article) => article.evidenceIds.some((id) => refs.includes(id)));
  const checks: Record<string, boolean> = {
    allBoutsPassed,
    everyBoutReferenced: coversAllBouts,
    noForeignEvidence: refs.length === input.evidenceIds.length,
    headlineHasContent: input.headline.trim().length >= 8 && input.headline.trim().length <= 40,
    summaryHasSubstance: input.summary.trim().length >= 180,
  };
  const passed = Object.values(checks).every(Boolean);
  const reasons = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  const body = JSON.stringify({ matchId: input.matchId, headline: input.headline, summary: input.summary, refs });
  const rev = revision(body);
  return {
    articleId: input.matchId + ":" + rev + (passed ? ":published" : ":candidate"),
    matchId: input.matchId,
    revision: rev,
    status: passed ? "passed" : "insufficient",
    headline: input.headline.trim(),
    summary: input.summary.trim(),
    summaryEvidenceIds: refs,
    keyPoints: [],
    evidenceIds: refs,
    quality: {
      score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
      checks,
      reasons,
      evaluatedAt: new Date().toISOString(),
      evaluatorVersion: ARTICLE_QUALITY_VERSION,
    },
    createdAt: new Date().toISOString(),
  };
}
