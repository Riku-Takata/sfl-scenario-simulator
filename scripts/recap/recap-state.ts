import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  RecapEvidenceDataSchema, RecapArticlesDataSchema, RecapJobsDataSchema,
} from "../../src/lib/schema";
import type { RecapArticle, RecapEvidence, RecapEvidenceData, RecapArticlesData, RecapJobsData } from "../../src/lib/types";
import { nextArchiveCheckAt } from "./check-schedule";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const EVIDENCE_FILE = path.join(DATA_DIR, "recap-evidence.json");
const ARTICLES_FILE = path.join(DATA_DIR, "recap-articles.json");
const JOBS_FILE = path.join(DATA_DIR, "recap-jobs.json");

function load<T>(file: string, schema: { parse(value: unknown): T }, seed: unknown): T {
  if (!fs.existsSync(file)) return schema.parse(seed);
  return schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}
function save<T>(file: string, schema: { parse(value: unknown): T }, value: T): void {
  const parsed = schema.parse(value) as T & { updatedAt?: string };
  if (fs.existsSync(file)) {
    const prior = schema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) as T & { updatedAt?: string };
    const withoutTimes = (record: unknown): unknown => {
      if (Array.isArray(record)) return record.map(withoutTimes);
      if (record && typeof record === "object") return Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== "updatedAt").map(([key, value]) => [key, withoutTimes(value)])
      );
      return record;
    };
    if (JSON.stringify(withoutTimes(parsed)) === JSON.stringify(withoutTimes(prior))) return;
  }
  parsed.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + "\n");
}

export function loadRecapEvidence(): RecapEvidenceData {
  return load(EVIDENCE_FILE, RecapEvidenceDataSchema, { schemaVersion: 1, updatedAt: new Date().toISOString(), evidence: {} });
}
export function saveRecapEvidence(data: RecapEvidenceData): void {
  data.updatedAt = new Date().toISOString();
  save(EVIDENCE_FILE, RecapEvidenceDataSchema, data);
}
export function loadRecapArticles(): RecapArticlesData {
  return load(ARTICLES_FILE, RecapArticlesDataSchema, { schemaVersion: 1, updatedAt: new Date().toISOString(), articles: {} });
}
export function saveRecapArticles(data: RecapArticlesData): void {
  data.updatedAt = new Date().toISOString();
  save(ARTICLES_FILE, RecapArticlesDataSchema, data);
}
export function loadRecapJobs(): RecapJobsData {
  return load(JOBS_FILE, RecapJobsDataSchema, { schemaVersion: 1, updatedAt: new Date().toISOString(), jobs: {} });
}
export function saveRecapJobs(data: RecapJobsData): void {
  data.updatedAt = new Date().toISOString();
  save(JOBS_FILE, RecapJobsDataSchema, data);
}

export function upsertJob(input: {
  jobs: RecapJobsData;
  sectionId: string;
  matchId: string;
  boutId: string;
  officialInput: unknown;
  hasVideo: boolean;
  hasWindow: boolean;
  videoStatus: "complete" | "pending" | "unavailable";
  apiAvailable: boolean;
  article?: RecapArticle;
  editorial: boolean;
  attempted?: boolean;
}): void {
  const key = input.boutId;
  const inputHash = crypto.createHash("sha256").update(JSON.stringify(input.officialInput)).digest("hex");
  const previous = input.jobs.jobs[key];
  const changed = previous?.inputHash !== inputHash;
  const articlePassed = input.article?.status === "passed";
  const awaitingEditorialReview = input.article?.status === "candidate";
  const editorial = input.editorial;
  let stage: RecapJobsData["jobs"][string]["stage"] = editorial || articlePassed ? "completed"
    : awaitingEditorialReview ? "reviewing"
    : !input.hasVideo ? "waiting_video"
      : !input.hasWindow ? "waiting_window"
        : !input.apiAvailable ? "paused"
          : input.article?.status === "invalid" ? "needs_review"
          : input.article?.status === "insufficient" && (previous?.attempts ?? 0) >= 3 ? "needs_review"
          : input.videoStatus === "pending" ? "extracting"
            : input.videoStatus === "complete" ? "writing"
              : input.article?.status === "insufficient" ? "writing" : "retry_wait";
  const due = !previous || Date.now() - Date.parse(previous.updatedAt) >= 10 * 60_000;
  const attempts = changed || !input.article ? 0 : (previous?.attempts ?? 0) + (due && input.attempted && input.article.status === "insufficient" ? 1 : 0);
  if (input.article?.status === "insufficient" && attempts >= 3) stage = "needs_review";
  const backoffMs = Math.min(6 * 60 * 60_000, 15 * 60_000 * Math.pow(2, Math.max(0, attempts - 1)));
  input.jobs.jobs[key] = {
    jobId: key, sectionId: input.sectionId, matchId: input.matchId, boutId: key,
    stage, quality: editorial || articlePassed ? "passed" : awaitingEditorialReview ? "candidate" : input.article?.status === "invalid" ? "invalid" : input.article ? "insufficient" : "not_evaluated",
    publication: editorial || articlePassed ? "detailed" : "results_only",
    inputHash, pipelineVersion: "recap-pipeline-v3",
    attempts,
    ...(stage === "waiting_video" || stage === "waiting_window" ? { nextAttemptAt: nextArchiveCheckAt() } : {}),
    ...(stage === "retry_wait" || stage === "extracting" || stage === "writing" ? { nextAttemptAt: new Date(Date.now() + backoffMs).toISOString() } : {}),
    ...(previous?.leaseUntil && Date.parse(previous.leaseUntil) > Date.now() ? { leaseUntil: previous.leaseUntil } : {}),
    ...(input.article?.quality.reasons.length ? { failureReason: input.article.quality.reasons.join(",") } : {}),
    evidenceIds: input.article?.evidenceIds ?? [],
    ...((articlePassed || editorial) ? { publishedRevision: input.article?.revision ?? "editorial" } : previous?.publishedRevision ? { publishedRevision: previous.publishedRevision } : {}),
    ...(!articlePassed && !editorial && input.article ? { candidateRevision: input.article.revision } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function recapInputHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function upsertMatchJob(input: {
  jobs: RecapJobsData;
  sectionId: string;
  matchId: string;
  inputHash: string;
  hasVideo: boolean;
  hasWindow: boolean;
  videoPending: boolean;
  apiAvailable: boolean;
  article?: RecapArticle;
  editorial: boolean;
  someBoutPassed: boolean;
  attempted?: boolean;
}): void {
  const key = input.matchId + ":article";
  const previous = input.jobs.jobs[key];
  const changed = previous?.inputHash !== input.inputHash;
  const awaitingEditorialReview = input.article?.status === "candidate";
  const due = !previous || Date.now() - Date.parse(previous.updatedAt) >= 10 * 60_000;
  const attempts = changed || !input.article ? 0 : (previous?.attempts ?? 0) + (due && input.attempted && input.article.status === "insufficient" ? 1 : 0);
  const stage = input.editorial || input.article?.status === "passed" ? "completed"
    : awaitingEditorialReview ? "reviewing"
    : !input.hasVideo ? "waiting_video"
      : !input.hasWindow ? "waiting_window"
        : !input.apiAvailable ? "paused"
          : input.article?.status === "invalid" || attempts >= 3 ? "needs_review"
            : input.videoPending ? "extracting" : "writing";
  const publication = input.editorial || input.article?.status === "passed" ? "detailed" : input.someBoutPassed ? "partial" : "results_only";
  const backoffMs = Math.min(6 * 60 * 60_000, 15 * 60_000 * Math.pow(2, Math.max(0, attempts - 1)));
  input.jobs.jobs[key] = {
    jobId: key, sectionId: input.sectionId, matchId: input.matchId,
    stage, quality: input.editorial || input.article?.status === "passed" ? "passed" : awaitingEditorialReview ? "candidate" : input.article?.status === "invalid" ? "invalid" : input.article ? "insufficient" : "not_evaluated",
    publication, inputHash: input.inputHash, pipelineVersion: "recap-pipeline-v3", attempts,
    ...(stage === "waiting_video" || stage === "waiting_window" ? { nextAttemptAt: nextArchiveCheckAt() } : {}),
    ...(stage === "writing" || stage === "extracting" ? { nextAttemptAt: new Date(Date.now() + backoffMs).toISOString() } : {}),
    ...(previous?.leaseUntil ? { leaseUntil: previous.leaseUntil } : {}),
    ...(input.article?.quality.reasons.length ? { failureReason: input.article.quality.reasons.join(",") } : {}),
    evidenceIds: input.article?.evidenceIds ?? [],
    ...((input.editorial || input.article?.status === "passed") ? { publishedRevision: input.article?.revision ?? "editorial" } : previous?.publishedRevision ? { publishedRevision: previous.publishedRevision } : {}),
    ...(!input.editorial && input.article?.status !== "passed" && input.article ? { candidateRevision: input.article.revision } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function evidenceForBout(data: RecapEvidenceData, boutId: string): RecapEvidence[] {
  return Object.values(data.evidence).filter((item) => item.boutId === boutId);
}

export function currentPassedArticle(data: RecapArticlesData, boutId: string): RecapArticle | undefined {
  return Object.values(data.articles).filter((article) => article.boutId === boutId && article.status === "passed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function currentPassedMatchArticle(data: RecapArticlesData, matchId: string): RecapArticle | undefined {
  return Object.values(data.articles).filter((article) => article.matchId === matchId && !article.boutId && article.status === "passed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestArticle(data: RecapArticlesData, boutId: string): RecapArticle | undefined {
  return Object.values(data.articles).filter((article) => article.boutId === boutId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestMatchArticle(data: RecapArticlesData, matchId: string): RecapArticle | undefined {
  return Object.values(data.articles).filter((article) => article.matchId === matchId && !article.boutId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function putArticle(data: RecapArticlesData, article: RecapArticle): void {
  const previous = data.articles[article.articleId];
  if (previous && previous.revision === article.revision && previous.status === article.status &&
      JSON.stringify(previous.quality.checks) === JSON.stringify(article.quality.checks)) {
    article.createdAt = previous.createdAt;
    article.quality.evaluatedAt = previous.quality.evaluatedAt;
  }
  data.articles[article.articleId] = article;
}
