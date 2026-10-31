import fs from "node:fs";
import path from "node:path";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

import {
  EditorialRecapsDataSchema,
  MatchRecapsDataSchema,
  VideoFactsDataSchema,
} from "../src/lib/schema";
import type {
  DivisionId,
  EditorialRecapsData,
  MatchRecapsData,
  PastSectionArchive,
  RecentBoutAnalysis,
  RecentBoutRecap,
  RecentMatchRecap,
  VideoFactsData,
} from "../src/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../src/lib/simulator";
import { formatCharName } from "../src/lib/player-encyclopedia";
import { SECTION_VIDEO_IDS } from "../src/config/section-videos";
import { fetchSectionPlaylists, fetchSectionVideos } from "./recap/youtube-archive";
import { SFL_CURRENT_SEASON } from "../src/lib/sfl/play-style";
import {
  extractYoutubeVideoId,
  fetchYoutubeChapters,
  findBoutWindow,
  findMatchStartSec,
} from "./recap/youtube-chapters";
import { activeModels, isVideoQuotaExhausted, lastGeminiFailureStatus, parseModelList } from "./recap/gemini-client";
import {
  advanceBoutAnalysis,
  budgetAllows,
  isBoutVideoCacheStale,
  videoAnalysisFingerprint,
  MAX_RUNS_PER_BOUT,
  type BoutContext,
  type VideoBudget,
} from "./recap/bout-video-facts";
import {
  buildBoutEvidence, MAX_VERIFICATION_BATCH, mergeEvidenceCandidate, pendingEvidenceCandidates, selectVerificationBatch,
  verificationWindow, verifyEvidenceBatch, verifyEvidenceCandidate,
} from "./recap/evidence-ledger";
import { articleEvidenceReady } from "./recap/automation";
import { persistentVideoBudget } from "./recap/usage";
import { finishWriteRequest, loadWriteRequests, queueWriteRequest, readPreparedNarratives, saveWriteRequests } from "./recap/writer-state";
import { recordTokenUsage } from "./recap/token-usage";
import { applyPublicationMode, evaluateBoutArticle, evaluateMatchArticle } from "./recap/article-quality";
import {
  currentPassedArticle, currentPassedMatchArticle, latestArticle, latestMatchArticle, evidenceForBout, loadRecapArticles, loadRecapEvidence, loadRecapJobs, recapInputHash,
  putArticle, saveRecapArticles, saveRecapEvidence, saveRecapJobs, upsertJob, upsertMatchJob,
} from "./recap/recap-state";
import {
  buildOfficialDataAnalysis,
  dedupeAnalyses,
  generateMatchNarrative,
  narrationInputHash,
  buildNarrationPrompt,
  normalizeMatchNarrative,
  type BoutGameDetail,
  type NarrationBoutInput,
  type NarrationMatchInput,
} from "./recap/narration";
import {
  advanceVisualAnalysis,
  buildVerifiedGames,
  buildVerifiedTags,
} from "./recap/visual-facts";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const SEED_FILE = path.join(DATA_DIR, "raw-capcom-seed.json");
const RECAPS_FILE = path.join(DATA_DIR, "match-recaps.json");
const VIDEO_FACTS_FILE = path.join(DATA_DIR, "video-facts.json");
const EDITORIAL_FILE = path.join(DATA_DIR, "editorial-recaps.json");

const DEFAULT_VIDEO_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
];
// 解説生成は品質を優先して lite モデルを使わない（3.8-flash と lite の比較で、lite は根拠の薄い要点や
// 飾り言葉が混ざった）。両方とも使えない日は pendingNarrations に記録し、翌日以降の実行で生成する
const DEFAULT_TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];

interface RawGameLog {
  "1p_character": string;
  "1p_mode": string;
  "2p_character": string;
  "2p_mode": string;
  r1: string;
  r2: string;
  r3: string;
  status: number;
  status_name: string;
}

interface RawBoutPlayer {
  player: string;
  point: number;
  battle: number;
  round: number;
  status: number;
  status_name: string;
  use_chara?: Record<string, { entry: number; win: number; lose: number }>;
}

interface RawMatchSlot {
  home: string;
  away: string;
  use: string;
  result:
    | ""
    | {
        "1p"?: RawBoutPlayer[];
        "2p"?: RawBoutPlayer[];
        log?: RawGameLog[][];
        total: {
          point: { home: number; away: number };
          battle: { home: number; away: number };
          round: { home: number; away: number };
        };
        winner: "home" | "away";
      };
}

interface RawScheduleEntry {
  ID: number;
  post_title: string;
  post_name: string;
  fields: {
    section: {
      time: string;
      links?: {
        live?: { url?: string };
        playlist?: { url?: string };
        single?: { url?: string };
      };
      match1: RawMatchSlot;
      match2: RawMatchSlot;
      match3: RawMatchSlot;
      match4?: RawMatchSlot;
    };
  };
}

/**
 * 公式ラウンドログ → ゲームごとの勝者とラウンド推移。
 * r = "1" は 1P(HOME)=B、"2" は 2P(AWAY)=A のラウンド取得。
 */
export function toGameDetails(gameLogs: RawGameLog[] = []): BoutGameDetail[] {
  return gameLogs.map((g) => {
    const rounds = [g.r1, g.r2, g.r3]
      .filter((r) => r === "1" || r === "2")
      .map((r) => (r === "1" ? "B" : "A") as "A" | "B");
    const a = rounds.filter((r) => r === "A").length;
    const b = rounds.filter((r) => r === "B").length;
    return {
      winner: a > b ? "A" : "B",
      homeChara: g["1p_character"],
      awayChara: g["2p_character"],
      rounds,
    };
  });
}

/** UIの [AWAY - HOME] 表示順に合わせたラウンド推移テキスト */
function buildRoundFlowTexts(games: BoutGameDetail[], awayName: string, homeName: string): string[] {
  return games.map((g, idx) => {
    const a = g.rounds.filter((r) => r === "A").length;
    const b = g.rounds.filter((r) => r === "B").length;
    const winnerName = g.winner === "A" ? awayName : homeName;
    let text = `Game ${idx + 1}: [${a}-${b}] ${winnerName}選手が`;
    if (g.rounds.length === 2) {
      text += "ストレート先取";
    } else {
      text += "フルラウンド勝利";
      if (g.rounds[0] !== g.winner) text += "（先制されるも逆転）";
    }
    return text;
  });
}

function formatSecondsToTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function loadVideoFacts(): VideoFactsData {
  if (!fs.existsSync(VIDEO_FACTS_FILE)) {
    return {
      updatedAt: new Date().toISOString(),
      videos: {},
      bouts: {},
      narratives: {},
      visual: {},
      pendingNarrations: [],
    };
  }
  return VideoFactsDataSchema.parse(JSON.parse(fs.readFileSync(VIDEO_FACTS_FILE, "utf8")));
}

function saveVideoFacts(data: VideoFactsData): void {
  const parsed = VideoFactsDataSchema.parse(data);
  if (fs.existsSync(VIDEO_FACTS_FILE)) {
    const prior = VideoFactsDataSchema.parse(JSON.parse(fs.readFileSync(VIDEO_FACTS_FILE, "utf8")));
    const content = (value: VideoFactsData) => {
      const { updatedAt: _updatedAt, ...rest } = value;
      return JSON.stringify(rest);
    };
    if (content(parsed) === content(prior)) return;
  }
  parsed.updatedAt = new Date().toISOString();
  fs.writeFileSync(VIDEO_FACTS_FILE, JSON.stringify(parsed, null, 2), "utf8");
}

function loadEditorial(): EditorialRecapsData {
  if (!fs.existsSync(EDITORIAL_FILE)) return { bouts: {}, matches: {} };
  return EditorialRecapsDataSchema.parse(JSON.parse(fs.readFileSync(EDITORIAL_FILE, "utf8")));
}

function loadCompletedSections(): { s: RawScheduleEntry[]; f: RawScheduleEntry[] } {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }
  const rawSeed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as {
    data?: { schedules?: RawScheduleEntry[] };
  };
  const completed: { s: RawScheduleEntry[]; f: RawScheduleEntry[] } = { s: [], f: [] };
  for (const s of rawSeed.data?.schedules || []) {
    const hasResult =
      s.fields.section.match1 &&
      typeof s.fields.section.match1.result === "object" &&
      s.fields.section.match1.result !== null;
    if (!hasResult) continue;
    if (s.post_name.startsWith("div-s-sec")) completed.s.push(s);
    else if (s.post_name.startsWith("div-f-sec")) completed.f.push(s);
  }
  return completed;
}

function activeSlots(sec: RawScheduleEntry["fields"]["section"]) {
  const slots: Array<{ num: number; slot: RawMatchSlot }> = [
    { num: 1, slot: sec.match1 },
    { num: 2, slot: sec.match2 },
    { num: 3, slot: sec.match3 },
  ];
  if (sec.match4 && sec.match4.use !== "hide" && sec.match4.home !== "none") {
    slots.push({ num: 4, slot: sec.match4 });
  }
  return slots.filter(
    ({ slot }) => slot && slot.use !== "hide" && typeof slot.result === "object" && slot.result
  );
}

/** 最新節で、まだ動画解析が終わっていない（pending の）Boutがあるか。パイプラインの再開判定用。 */
export function hasPendingVideoWork(): boolean {
  if (!process.env.GEMINI_API_KEY || !fs.existsSync(VIDEO_FACTS_FILE)) return false;
  const facts = loadVideoFacts();
  const editorial = loadEditorial();
  const completed = loadCompletedSections();
  const latestSlugs = [completed.s.at(-1)?.post_name, completed.f.at(-1)?.post_name].filter(
    Boolean
  ) as string[];
  if (latestSlugs.length === 0) return false;
  const pendingBout = Object.entries(facts.bouts).some(
    ([id, b]) =>
      latestSlugs.some((slug) => id.startsWith(`${slug}-`)) &&
      b.status === "pending" &&
      !editorial.bouts[id]
  );
  const pendingVisual = process.env.RECAP_ENABLE_FULL_VISUAL_ANALYSIS === "true" && Object.entries(facts.visual).some(
    ([id, v]) => latestSlugs.some((slug) => id.startsWith(`${slug}-`)) && v.status === "pending"
  );
  // アーカイブ (チャプター付き) がまだ見つかっていない最新節。
  // アーカイブは生成時に公式チャンネルから自動検出するため、見つかるまで毎回確認する
  const unseenSection = latestSlugs.some((slug) => {
    if (facts.videos[slug]?.chapters?.length) return false;
    const entry = completed.s.concat(completed.f).find((section) => section.post_name === slug);
    if (!entry) return false;
    const hasUncoveredBout = activeSlots(entry.fields.section).some(({ num, slot }) => {
      const result = slot.result as Exclude<RawMatchSlot["result"], "">;
      return (result["1p"] || []).some(
        (bout) => !editorial.bouts[`${slug}-m${num}-b${bout.status}`]
      );
    });
    return hasUncoveredBout && !Object.keys(facts.bouts).some((id) => id.startsWith(`${slug}-`));
  });
  const pendingNarration = facts.pendingNarrations.some((id) =>
    latestSlugs.some((slug) => id.startsWith(`${slug}-`))
  );
  const missingBoutWindow = latestSlugs.some((slug) => {
    const video = facts.videos[slug];
    const entry = completed.s.concat(completed.f).find((section) => section.post_name === slug);
    if (!entry) return false;
    return activeSlots(entry.fields.section).some(({ num, slot }) => {
      const result = slot.result as Exclude<RawMatchSlot["result"], "">;
      return (result["1p"] || []).some((bout) => {
        if (editorial.bouts[`${slug}-m${num}-b${bout.status}`]) return false;
        return !video?.chapters.length || !findBoutWindow(video.chapters, num, bout.status);
      });
    });
  });
  const now = Date.now();
  const queued = Object.values(loadRecapJobs().jobs).some((job) =>
    ["queued", "waiting_video", "waiting_window", "extracting", "verifying", "writing", "retry_wait"].includes(job.stage) &&
    (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now) &&
    (!job.leaseUntil || Date.parse(job.leaseUntil) <= now)
  );
  return pendingBout || pendingVisual || pendingNarration || unseenSection || missingBoutWindow || queued;
}

export async function generateAndSaveMatchRecaps(
  options: { onlySection?: string; resultsOnly?: boolean; refreshChapters?: boolean } = {}
): Promise<MatchRecapsData> {
  console.log("=== SFL 2026 Match Recaps (Gemini video facts) Generator Start ===");

  const completedDivSections = loadCompletedSections();
  const latestSecNum = {
    s: completedDivSections.s.length
      ? parseInt(completedDivSections.s.at(-1)!.post_name.replace("div-s-sec", ""), 10)
      : 0,
    f: completedDivSections.f.length
      ? parseInt(completedDivSections.f.at(-1)!.post_name.replace("div-f-sec", ""), 10)
      : 0,
  };

  const apiKey = process.env.GEMINI_API_KEY || "";
  const configuredVideoModels = parseModelList(process.env.GEMINI_VIDEO_MODELS, DEFAULT_VIDEO_MODELS);
  const videoModels = activeModels(configuredVideoModels);
  const textModels = parseModelList(process.env.GEMINI_TEXT_MODELS, DEFAULT_TEXT_MODELS);
  const textBackend = (process.env.RECAP_TEXT_BACKEND as import("./recap/writer-manager").TextBackendType) || "codex";
  const fullVisualAnalysis = process.env.RECAP_ENABLE_FULL_VISUAL_ANALYSIS === "true";
  const fps = Number(process.env.GEMINI_VIDEO_FPS || "1");
  // 指紋が変わると解析済みの Bout がすべて再解析になるので、廃止モデルを除く前の一覧で計算する。
  const analysisVersion = videoAnalysisFingerprint(configuredVideoModels, fps);
  const publicationMode = process.env.RECAP_PUBLICATION_MODE === "auto" ? "auto" : "shadow";
  // 複数区間の同時送信を API が受け付けなかったら、この実行では1区間ずつに戻す。
  let batchedVerificationRejected = false;
  const budget: VideoBudget = persistentVideoBudget({
    maxCalls: Number(process.env.GEMINI_VIDEO_MAX_CALLS || "24"),
    // 無料枠のYouTube入力は1日8時間まで。他の利用分を残して7時間で打ち切る
    maxVideoSeconds: Number(process.env.GEMINI_VIDEO_MAX_SECONDS || String(7 * 3600)),
    calls: 0,
    videoSeconds: 0,
    // 新しい動画解析を始めてよい時間 (既定20分)。無料枠切れ・503が続く日もここで打ち切って持ち越す
    deadlineMs: Date.now() + Number(process.env.GEMINI_VIDEO_TIME_BUDGET_MIN || "20") * 60_000,
  });

  const videoFacts = loadVideoFacts();
  const editorial = loadEditorial();
  const evidenceData = loadRecapEvidence();
  const articlesData = loadRecapArticles();
  const jobsData = loadRecapJobs();
  const writeRequests = loadWriteRequests();
  const preparedNarratives = readPreparedNarratives();
  for (const prepared of preparedNarratives) recordTokenUsage({ provider: "codex", model: prepared.model, purpose: "narration", usage: prepared.usage, id: prepared.runId });

  // 節の配信アーカイブ: 手動登録 > 公式チャンネルから自動検出 > 以前に検出してキャッシュ済み
  const previousRecaps = fs.existsSync(RECAPS_FILE)
    ? MatchRecapsDataSchema.parse(JSON.parse(fs.readFileSync(RECAPS_FILE, "utf8"))) : undefined;
  const fallbackPlaylists = Object.fromEntries([...completedDivSections.s, ...completedDivSections.f]
    .map((entry) => [entry.post_name, entry.fields.section.links?.playlist?.url || ""]));
  for (const div of ["s", "f"] as const) for (const section of previousRecaps?.pastSections[div] ?? []) {
    if (section.playlistUrl) fallbackPlaylists[`div-${div}-sec${section.sectionNumber}`] = section.playlistUrl;
  }
  const [detectedVideos, detectedPlaylists] = await Promise.all([
    fetchSectionVideos(SFL_CURRENT_SEASON), fetchSectionPlaylists(SFL_CURRENT_SEASON, fallbackPlaylists),
  ]);
  const resolveVideoId = (slug: string): string | undefined =>
    SECTION_VIDEO_IDS[slug] ?? detectedVideos[slug] ?? videoFacts.videos[slug]?.videoId;

  const resultRecaps: MatchRecapsData = {
    updatedAt: new Date().toISOString(),
    generatorMode: "deterministic-rules",
    latestSection: latestSecNum,
    recentSections: { s: [], f: [] },
    pastSections: { s: [], f: [] },
  };
  const allAnalyses: RecentBoutAnalysis[] = [];

  for (const div of ["s", "f"] as DivisionId[]) {
    const completed = completedDivSections[div];
    if (completed.length === 0) continue;

    // 過去節のアーカイブ
    for (const entry of completed.slice(0, -1)) {
      const sec = entry.fields.section;
      const videoId = resolveVideoId(entry.post_name);
      const matchesArchive: PastSectionArchive["matches"] = activeSlots(sec)
        .filter(({ num }) => num <= 3)
        .map(({ slot }) => {
          const r = slot.result as Exclude<RawMatchSlot["result"], "">;
          return {
            home: slot.home,
            away: slot.away,
            homePoint: r.total.point.home,
            awayPoint: r.total.point.away,
            winner: r.winner,
          };
        });
      resultRecaps.pastSections[div].push({
        sectionNumber: parseInt(entry.post_name.replace(`div-${div}-sec`, ""), 10),
        sectionTitle: entry.post_title,
        scheduledAt: sec.time,
        youtubeUrl: videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : sec.links?.live?.url || "https://www.youtube.com/@CapcomFightersJP",
        playlistUrl: entry.post_name in detectedPlaylists ? detectedPlaylists[entry.post_name] || undefined : fallbackPlaylists[entry.post_name] || undefined,
        matches: matchesArchive,
      });
    }

    // 最新節の詳細
    const latestEntry = (options.onlySection && completed.find((entry) => entry.post_name === options.onlySection)) || completed.at(-1)!;
    const slug = latestEntry.post_name;
    const sec = latestEntry.fields.section;
    const videoId =
      resolveVideoId(slug) || extractYoutubeVideoId(sec.links?.live?.url || "") || null;
    const youtubeUrl = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "https://www.youtube.com/@CapcomFightersJP";
    const divisionLabel = `Division ${div.toUpperCase()}`;
    const videoWorkAllowed = !options.resultsOnly && Boolean(apiKey && videoId) && (!options.onlySection || options.onlySection === slug);

    // 公式チャプター（キャッシュ優先）
    let chapters = videoFacts.videos[slug]?.chapters ?? [];
    const requiredWindowsMissing = activeSlots(sec).some(({ num, slot }) => {
      const result = slot.result as Exclude<RawMatchSlot["result"], "">;
      return (result["1p"] || []).some((bout) => !findBoutWindow(chapters, num, bout.status));
    });
    if (!options.resultsOnly && options.refreshChapters !== false && videoId && (chapters.length === 0 || requiredWindowsMissing)) {
      try {
        const refreshed = await fetchYoutubeChapters(videoId);
        if (refreshed.length > 0) {
          chapters = refreshed;
          videoFacts.videos[slug] = { videoId, chapters };
          console.log(`[Chapters] ${slug}: refreshed ${chapters.length} chapters from YouTube description`);
        }
      } catch (err) {
        console.warn(`[Chapters] ${slug}: ${(err as Error).message}`);
      }
    }

    for (const { num, slot } of activeSlots(sec)) {
      const result = slot.result as Exclude<RawMatchSlot["result"], "">;
      const p1 = result["1p"] || [];
      const p2 = result["2p"] || [];
      const rawLogs = result.log || [];
      const homeName = TEAM_META_MAP[slot.home]?.name || slot.home;
      const awayName = TEAM_META_MAP[slot.away]?.name || slot.away;
      const matchId = `${slug}-m${num}`;

      const boutInputs: NarrationBoutInput[] = [];
      const boutRecaps: RecentBoutRecap[] = [];
      const evidenceExhaustedBouts = new Set<string>();

      for (let i = 0; i < Math.min(p1.length, p2.length); i++) {
        const hp = p1[i];
        const ap = p2[i];
        const homePlayerDisp = PLAYER_NAME_MAP[hp.player] || hp.player;
        const awayPlayerDisp = PLAYER_NAME_MAP[ap.player] || ap.player;
        const homeCharaKey = Object.keys(hp.use_chara || {})[0] || "";
        const awayCharaKey = Object.keys(ap.use_chara || {})[0] || "";
        const games = toGameDetails(rawLogs[i] || []);
        const boutWinner: "home" | "away" = hp.battle > ap.battle ? "home" : "away";
        const bestOf = hp.status === 2 ? 5 : 3;

        const ctx: BoutContext = {
          boutId: `${matchId}-b${hp.status}`,
          divisionLabel,
          sectionTitle: latestEntry.post_title.replace(/^Division\s*[SF]\s*/i, ""),
          matchNumber: num,
          statusName: hp.status_name,
          bestOf,
          playerA: { name: awayPlayerDisp, chara: formatCharName(awayCharaKey), team: awayName },
          playerB: { name: homePlayerDisp, chara: formatCharName(homeCharaKey), team: homeName },
          officialGameWinners: games.map((g) => g.winner),
          boutWinner: boutWinner === "away" ? "A" : "B",
          scoreA: ap.battle,
          scoreB: hp.battle,
        };

        // 動画解析（チャプターでBout区間が取れたものだけ）
        const window = findBoutWindow(chapters, num, hp.status);
        let facts = videoFacts.bouts[ctx.boutId];
        const cacheStale = isBoutVideoCacheStale(facts, { videoId, window, analysisVersion });
        if (facts && cacheStale) {
          facts = {
            videoId: videoId ?? facts.videoId,
            ...(window ?? { startSec: facts.startSec, endSec: facts.endSec }),
            status: "pending",
            analysisVersion,
            staleRuns: [...(facts.staleRuns ?? []), ...facts.runs],
            runs: [],
          };
          videoFacts.bouts[ctx.boutId] = facts;
        }
        if (!facts && videoId && window) {
          facts = { videoId, ...window, status: "pending", analysisVersion, staleRuns: [], runs: [] };
          videoFacts.bouts[ctx.boutId] = facts;
        }
        // 編集解説があるBoutは動画解析しない（無料枠の節約）
        if (facts && videoWorkAllowed && facts.status === "pending" && !editorial.bouts[ctx.boutId]) {
          await advanceBoutAnalysis({ apiKey, models: videoModels.filter((model) => !/lite/i.test(model)), ctx, facts, budget, fps });
          saveVideoFacts(videoFacts); // 途中で止まっても解析済み分は残す
        }

        const officialInput = { ctx, games, videoId, window, analysisVersion, publicationMode };
        const priorJob = jobsData.jobs[ctx.boutId];
        if (priorJob && priorJob.inputHash !== recapInputHash(officialInput)) {
          for (const article of Object.values(articlesData.articles)) {
            if (article.boutId === ctx.boutId) delete articlesData.articles[article.articleId];
          }
          for (const item of Object.values(evidenceData.evidence)) {
            if (item.boutId === ctx.boutId) {
              item.status = "disputed";
              item.verifierVersion = "invalidated-by-official-update";
            }
          }
          for (const article of Object.values(articlesData.articles)) {
            if (article.matchId === matchId && !article.boutId) delete articlesData.articles[article.articleId];
          }
        }
        const boutEvidence = buildBoutEvidence({ sectionId: slug, matchId, boutId: ctx.boutId, videoFacts: facts, ctx, games });
        for (const item of boutEvidence) {
          const prior = evidenceData.evidence[item.id];
          evidenceData.evidence[item.id] = mergeEvidenceCandidate(item, prior);
        }
        if (videoWorkAllowed && facts && !isVideoQuotaExhausted() && !articleEvidenceReady(evidenceForBout(evidenceData, ctx.boutId)) && budgetAllows(budget, 0)) {
          // 無料枠は1日のリクエスト数で尽きるので、Boutの候補はまとめて1リクエストで検証する。
          const batch = selectVerificationBatch(pendingEvidenceCandidates(evidenceForBout(evidenceData, ctx.boutId), MAX_VERIFICATION_BATCH), videoModels);
          const batchSeconds = batch.candidates.reduce((sum, item) => {
            const clip = verificationWindow(item);
            return sum + clip.endSec - clip.startSec;
          }, 0);
          if (!batchedVerificationRejected && batch.candidates.length > 1 && budgetAllows(budget, batchSeconds)) {
            budget.calls += 1;
            budget.videoSeconds += batchSeconds;
            const results = await verifyEvidenceBatch({ apiKey, models: batch.models, candidates: batch.candidates });
            if (results) {
              for (const item of results) evidenceData.evidence[item.id] = item;
              saveRecapEvidence(evidenceData);
            } else if (lastGeminiFailureStatus() === 400) {
              // 失敗したリクエストも Google の日次上限に数えられるので、予約は戻さない。
              batchedVerificationRejected = true;
              console.warn("[Evidence] the API rejected several clips in one request; verifying one clip per request for the rest of this run.");
            }
          }
          if (batchedVerificationRejected || batch.candidates.length === 1) {
            for (const candidate of pendingEvidenceCandidates(evidenceForBout(evidenceData, ctx.boutId))) {
              const clip = verificationWindow(candidate);
              if (!budgetAllows(budget, clip.endSec - clip.startSec)) break;
              budget.calls += 1;
              budget.videoSeconds += clip.endSec - clip.startSec;
              const verified = await verifyEvidenceCandidate({ apiKey, models: videoModels, candidate });
              if (verified === candidate) break;
              evidenceData.evidence[verified.id] = verified;
              saveRecapEvidence(evidenceData);
              if (articleEvidenceReady(evidenceForBout(evidenceData, ctx.boutId))) break;
            }
          }
        }
        // If the observed topics could not be independently verified, collect
        // one additional observation on the next pass, within the existing cap.
        if (videoWorkAllowed && facts && !editorial.bouts[ctx.boutId] &&
            !articleEvidenceReady(evidenceForBout(evidenceData, ctx.boutId)) &&
            pendingEvidenceCandidates(evidenceForBout(evidenceData, ctx.boutId)).length === 0 &&
            facts.runs.length < MAX_RUNS_PER_BOUT && facts.status === "complete") {
          await advanceBoutAnalysis({ apiKey, models: videoModels.filter((model) => !/lite/i.test(model)), ctx, facts, budget, fps, collectMoreEvidence: true });
          for (const item of buildBoutEvidence({ sectionId: slug, matchId, boutId: ctx.boutId, videoFacts: facts, ctx, games })) {
            evidenceData.evidence[item.id] = mergeEvidenceCandidate(item, evidenceData.evidence[item.id]);
          }
          saveVideoFacts(videoFacts);
          saveRecapEvidence(evidenceData);
        }
        if (facts && !editorial.bouts[ctx.boutId] && facts.runs.length >= MAX_RUNS_PER_BOUT &&
            !articleEvidenceReady(evidenceForBout(evidenceData, ctx.boutId)) &&
            pendingEvidenceCandidates(evidenceForBout(evidenceData, ctx.boutId)).length === 0) evidenceExhaustedBouts.add(ctx.boutId);
        const verifiedBoutEvidence = evidenceForBout(evidenceData, ctx.boutId);

        // 詳細な視覚統計の再抽出は明示的に有効化した場合だけ行う。保存済みの結果は再利用する。
        let visual = videoFacts.visual[ctx.boutId];
        if (fullVisualAnalysis && !visual && videoId && window) {
          visual = { videoId, ...window, status: "pending", runs: [] };
          videoFacts.visual[ctx.boutId] = visual;
        }
        if (fullVisualAnalysis && visual && videoWorkAllowed && visual.status === "pending") {
          await advanceVisualAnalysis({
            apiKey,
            models: videoModels,
            ctx,
            officialGames: games,
            facts: visual,
            budget,
            fps,
          });
          saveVideoFacts(videoFacts);
        }
        const visualRuns = visual?.runs ?? [];
        // 映像解析の進み具合 (編集解説があれば完了扱い)
        const videoStatus: "complete" | "pending" | "unavailable" = editorial.bouts[ctx.boutId]
          ? "complete"
          : !videoId
            ? "unavailable"
            : !window
              ? // チャプターが不完全でもアーカイブがあれば次回に再探索する。
                videoId ? "pending" : "unavailable"
            : facts?.status === "pending" || (fullVisualAnalysis && visual?.status === "pending")
              ? "pending"
              : facts?.status === "complete" || visual?.status === "complete"
                ? "complete"
                : "unavailable";

        boutInputs.push({ ctx, games, facts, evidence: verifiedBoutEvidence });
        boutRecaps.push({
          status: hp.status,
          statusName: hp.status_name,
          homePlayer: hp.player,
          awayPlayer: ap.player,
          homeChara: homeCharaKey,
          awayChara: awayCharaKey,
          homeBattle: hp.battle,
          awayBattle: ap.battle,
          homePoint: hp.point,
          awayPoint: ap.point,
          winner: boutWinner,
          isFullSet: ap.battle + hp.battle === bestOf,
          roundFlow: buildRoundFlowTexts(games, awayPlayerDisp, homePlayerDisp),
          analysis: buildOfficialDataAnalysis({ ctx, games }),
          games: buildVerifiedGames(games, visualRuns),
          tags: buildVerifiedTags(games, visualRuns),
          videoStatus,
        });
      }

      const isTiebreaker =
        (result.total.point.home === 30 && result.total.point.away === 20) ||
        (result.total.point.home === 20 && result.total.point.away === 30);
      const matchWinnerTeam = result.winner === "home" ? homeName : awayName;
      const matchSourceHash = recapInputHash({
        matchId, awayTeam: awayName, homeTeam: homeName,
        awayPoint: result.total.point.away, homePoint: result.total.point.home,
        bouts: boutInputs.map((input) => ({ ctx: input.ctx, games: input.games, videoId })),
      });
      const writerSourceHash = recapInputHash({ matchSourceHash, evidence: boutInputs.map((bout) => bout.evidence?.filter((item) => item.status === "verified")) });
      const previousRequest = writeRequests.requests[matchId];
      const writerAttempts = previousRequest?.sourceHash === writerSourceHash ? previousRequest.attempts : 0;
      const narrationInput: NarrationMatchInput = {
        matchId,
        awayTeam: awayName,
        homeTeam: homeName,
        awayPoint: result.total.point.away,
        homePoint: result.total.point.home,
        winnerTeam: matchWinnerTeam,
        isTiebreaker,
        bouts: boutInputs,
        styleExamples: (["s", "f"] as const).flatMap((division) => Object.entries(editorial.bouts)
          .filter(([boutId]) => boutId.startsWith(`div-${division}-`))
          .slice(0, 2)
          .map(([, item]) => ({ division: division.toUpperCase() as "S" | "F", summary: item.summary, keyPoints: item.keyPoints }))),
        qualityFeedback: Object.fromEntries([
          ...(writerAttempts > 0 ? [[matchId + ":writer", [`writer retry ${writerAttempts}`]]] : []),
          ...boutInputs.flatMap((input) => {
          const previous = latestArticle(articlesData, input.ctx.boutId);
          const job = jobsData.jobs[input.ctx.boutId];
          return previous?.status === "insufficient" ? [[input.ctx.boutId, [...previous.quality.reasons, ...(textBackend === "gemini" ? ["retry " + (job?.attempts ?? 0)] : [])]]] : [];
          }),
          ...(() => {
            const previous = latestMatchArticle(articlesData, matchId);
            const job = jobsData.jobs[matchId + ":article"];
            return previous?.status === "insufficient"
              ? [[matchId + ":article", [...previous.quality.reasons, ...(textBackend === "gemini" ? ["retry " + (job?.attempts ?? 0)] : [])]]]
              : [];
          })(),
        ]),
      };

      // 全Boutの動画解析が決着（complete/failed/区間なし）したら解説を1回だけ生成
      const allSettled = boutInputs.every((b) => !b.facts || b.facts.status !== "pending");
      const anyComplete = boutInputs.some((b) => b.facts?.status === "complete");
      const inputHash = narrationInputHash(narrationInput);
      let narrative = videoFacts.narratives[matchId];
      let narrationAttempted = false;
      let acceptedPrepared = false;
      const alreadyPublished = jobsData.jobs[matchId + ":article"]?.inputHash === matchSourceHash &&
        Boolean(currentPassedMatchArticle(articlesData, matchId)) &&
        boutInputs.every((bout) => editorial.bouts[bout.ctx.boutId] || currentPassedArticle(articlesData, bout.ctx.boutId));
      // 全Boutに編集解説がある試合は自動生成しない（無料枠の節約）
      const needsNarration = boutInputs.some((b) => !editorial.bouts[b.ctx.boutId]);
      const evidenceReady = boutInputs.every((bout) => editorial.bouts[bout.ctx.boutId] || articleEvidenceReady(bout.evidence ?? []));
      const markPending = (pending: boolean) => {
        const list = videoFacts.pendingNarrations.filter((id) => id !== matchId);
        videoFacts.pendingNarrations = pending ? [...list, matchId] : list;
      };
      if (!needsNarration || alreadyPublished) {
        markPending(false);
        const request = writeRequests.requests[matchId];
        if (request && request.stage !== "completed") { request.stage = "completed"; request.prompt = ""; request.updatedAt = new Date().toISOString(); }
      }
      if (!evidenceReady && writeRequests.requests[matchId]?.stage === "queued") {
        writeRequests.requests[matchId].stage = "waiting_evidence";
      }
      if (
        !options.resultsOnly && apiKey &&
        needsNarration &&
        !alreadyPublished &&
        evidenceReady &&
        allSettled &&
        anyComplete &&
        (!narrative || narrative.inputHash !== inputHash) &&
        (!options.onlySection || options.onlySection === slug)
      ) {
        const prepared = preparedNarratives.find((item) => item.matchId === matchId && item.inputHash === inputHash);
        let generated;
        if (prepared) {
          console.log(`[Narration] ${matchId}: validating the prepared Codex draft...`);
          narrationAttempted = true;
          try {
            generated = normalizeMatchNarrative(prepared.output, narrationInput, prepared.model, prepared.generatedAt);
            acceptedPrepared = true;
          } catch (error) {
            console.warn(`[Narration] ${matchId}: rejected prepared draft: ${(error as Error).message}`);
            finishWriteRequest(writeRequests, matchId, inputHash, false);
          }
        } else if (textBackend !== "gemini") {
          queueWriteRequest(writeRequests, { matchId, sectionId: slug, inputHash,
            sourceHash: writerSourceHash,
            prompt: buildNarrationPrompt(narrationInput),
          });
          saveWriteRequests(writeRequests);
          console.log(`[Narration] ${matchId}: queued verified materials for the local LLM writer (${textBackend}).`);
        } else {
          console.log(`[Narration] ${matchId}: generating with the explicitly selected Gemini text backend...`);
          narrationAttempted = true;
          generated = await generateMatchNarrative({
          apiKey,
          models: textModels,
          match: narrationInput,
          });
        }
        if (generated) {
          videoFacts.narratives[matchId] = generated;
          narrative = generated;
          markPending(false);
        } else {
          console.log(`[Narration] ${matchId}: draft is pending; retaining the verified materials.`);
          markPending(true);
        }
        saveVideoFacts(videoFacts);
      }
      const narrativeUsable = narrative && (narrative.inputHash === inputHash || alreadyPublished);
      // 解説文の進み具合: 動画がある試合で、解析待ち・解説の持ち越し中なら「作成中」
      const articleByBout = new Map<string, ReturnType<typeof evaluateBoutArticle>>();
      if (narrativeUsable) {
        for (const input of boutInputs) {
          if (editorial.bouts[input.ctx.boutId]) continue;
          const boutNarrative = narrative!.bouts.find((bout) => bout.boutId === input.ctx.boutId);
          if (!boutNarrative) continue;
          const keyPoints = boutNarrative.keyPoints.map((point) => typeof point === "string"
            ? { text: point, evidenceIds: [] }
            : point);
          const article = applyPublicationMode(evaluateBoutArticle({
            matchId, boutId: input.ctx.boutId, summary: boutNarrative.summary,
            summaryEvidenceIds: boutNarrative.summaryEvidenceIds ?? [], keyPoints,
            evidence: evidenceForBout(evidenceData, input.ctx.boutId), games: input.games,
          }), publicationMode);
          putArticle(articlesData, article);
          articleByBout.set(input.ctx.boutId, article);
        }
      }
      const passedBoutArticles = boutInputs.map((input) => {
        const candidate = articleByBout.get(input.ctx.boutId);
        return candidate?.status === "passed" ? candidate : currentPassedArticle(articlesData, input.ctx.boutId);
      }).filter((article) => article !== undefined);
      const qualityPassedBoutArticles = boutInputs.map((input) => {
        const candidate = articleByBout.get(input.ctx.boutId);
        const article = candidate ?? currentPassedArticle(articlesData, input.ctx.boutId);
        return article?.status === "candidate" ? { ...article, status: "passed" as const } : article;
      }).filter((article): article is NonNullable<typeof article> =>
        article !== undefined && article.quality.reasons.length === 0);
      const matchEvidence = Object.values(evidenceData.evidence).filter((item) => item.matchId === matchId);
      const matchArticle = narrativeUsable
        ? applyPublicationMode(evaluateMatchArticle({
            matchId, headline: narrative!.matchHeadline, summary: narrative!.matchSummary,
            evidenceIds: narrative!.matchEvidenceIds ?? [], boutArticles: qualityPassedBoutArticles,
            evidence: matchEvidence,
          }), publicationMode)
        : undefined;
      if (matchArticle) putArticle(articlesData, matchArticle);
      const publishedMatchArticle = matchArticle?.status === "passed" ? matchArticle : currentPassedMatchArticle(articlesData, matchId);
      if (acceptedPrepared) finishWriteRequest(writeRequests, matchId, inputHash, publishedMatchArticle?.status === "passed" && passedBoutArticles.length === boutInputs.length);
      const editorialCoversBouts = boutInputs.every((input) => Boolean(editorial.bouts[input.ctx.boutId]));
      const videoPending = boutInputs.some((input) => input.facts?.status === "pending" || (videoId && !findBoutWindow(chapters, num,
        input.ctx.statusName.includes("延長") ? 3 : input.ctx.statusName.includes("大将") ? 2 : input.ctx.statusName.includes("中堅") ? 1 : 0)));
      upsertMatchJob({
        jobs: jobsData, sectionId: slug, matchId, inputHash: matchSourceHash,
        hasVideo: Boolean(videoId), videoPending,
        hasWindow: boutInputs.every((input) => Boolean(findBoutWindow(chapters, num, Number(input.ctx.boutId.at(-1))))),
        attempted: narrationAttempted,
        evidenceExhausted: evidenceExhaustedBouts.size > 0,
        apiAvailable: Boolean(apiKey),
        // A failed redraft or a missing narrative must not unpublish an article that already passed.
        article: publishedMatchArticle ?? matchArticle, editorial: Boolean(editorial.matches[matchId]) || editorialCoversBouts,
        someBoutPassed: passedBoutArticles.length > 0,
      });
      for (let idx = 0; idx < boutInputs.length; idx++) {
        const input = boutInputs[idx];
        const recap = boutRecaps[idx];
        const window = findBoutWindow(chapters, num, input.ctx.boutId.endsWith("-b3") ? 3 : input.ctx.boutId.endsWith("-b2") ? 2 : input.ctx.boutId.endsWith("-b1") ? 1 : 0);
        const candidateDraft = articleByBout.get(input.ctx.boutId);
        const candidate = candidateDraft?.status === "passed"
          ? candidateDraft
          : currentPassedArticle(articlesData, input.ctx.boutId) ?? candidateDraft;
        upsertJob({
          jobs: jobsData, sectionId: slug, matchId, boutId: input.ctx.boutId,
          officialInput: { ctx: input.ctx, games: input.games, videoId, window, analysisVersion, publicationMode },
          hasVideo: Boolean(videoId), hasWindow: Boolean(window), videoStatus: recap.videoStatus,
          apiAvailable: Boolean(apiKey),
          attempted: narrationAttempted,
          evidenceExhausted: evidenceExhaustedBouts.has(input.ctx.boutId),
          article: candidate, editorial: Boolean(editorial.bouts[input.ctx.boutId]),
        });
        const recapJob = jobsData.jobs[input.ctx.boutId];
        if (writeRequests.requests[matchId]?.stage === "needs_review" && candidate?.status !== "passed" && !editorial.bouts[input.ctx.boutId]) {
          recapJob.stage = "needs_review";
          recapJob.failureReason = "local_writer_quality_retry_limit";
          delete recapJob.nextAttemptAt;
        }
        recap.videoStatus = editorial.bouts[input.ctx.boutId] || candidate?.status === "passed"
          ? "complete"
          : recapJob?.stage === "needs_review" || recapJob?.stage === "paused" || recapJob?.stage === "reviewing"
            ? "unavailable" : "pending";
      }
      const narrativeCoversAllBouts = Boolean(publishedMatchArticle?.status === "passed" && passedBoutArticles.length === boutInputs.length);
      const matchJob = jobsData.jobs[matchId + ":article"];
      if (writeRequests.requests[matchId]?.stage === "needs_review" && !narrativeCoversAllBouts) {
        matchJob.stage = "needs_review";
        matchJob.failureReason = "local_writer_quality_retry_limit";
        delete matchJob.nextAttemptAt;
      }
      const narrationStatus: "complete" | "pending" | "unavailable" =
        editorial.matches[matchId] || narrativeCoversAllBouts || !needsNarration
          ? "complete"
          : matchJob?.stage === "needs_review" || matchJob?.stage === "paused" || matchJob?.stage === "reviewing"
            ? "unavailable"
            : videoId && (options.resultsOnly || matchJob?.stage !== "completed" || !allSettled ||
                videoFacts.pendingNarrations.includes(matchId) || boutRecaps.some((bout) => bout.videoStatus === "pending"))
              ? "pending"
              : "unavailable";

      // 独立検証済みの根拠を引用し、品質判定を通った解説だけを採用する。
      boutRecaps.forEach((recap, idx) => {
        const input = boutInputs[idx];
        // 映像観測を使った生成文は公式ログ整合性を通したうえで、内容のある文だけ採用する。
        const articleDraft = articleByBout.get(input.ctx.boutId);
        const article = articleDraft?.status === "passed" ? articleDraft : currentPassedArticle(articlesData, input.ctx.boutId);
        // 手作業で仕上げた記事など、現行の生成文がなくても合格済みの記事は公開する。
        if (article?.status === "passed") {
          recap.analysis = {
            source: "gemini-video",
            summary: article.summary,
            keyPoints: article.keyPoints.map((point) => point.text),
          };
        }
        // 編集解説があれば最優先
        const editorialBout = editorial.bouts[input.ctx.boutId];
        if (editorialBout) {
          recap.analysis = {
            source: "editorial",
            summary: editorialBout.summary,
            keyPoints: editorialBout.keyPoints,
          };
        }
        allAnalyses.push(recap.analysis);
      });

      const winnerScore =
        result.winner === "home"
          ? `${result.total.point.home}-${result.total.point.away}`
          : `${result.total.point.away}-${result.total.point.home}`;
      const decisiveBout = boutRecaps.at(-1);
      const decisiveWinnerName = decisiveBout
        ? decisiveBout.winner === "home"
          ? PLAYER_NAME_MAP[decisiveBout.homePlayer] || decisiveBout.homePlayer
          : PLAYER_NAME_MAP[decisiveBout.awayPlayer] || decisiveBout.awayPlayer
        : "";
      const fallbackHeadline = isTiebreaker
        ? `${matchWinnerTeam}が延長戦を制し勝ち点30`
        : `${matchWinnerTeam}が${winnerScore}で勝利`;
      const fallbackSummary = `第${num}試合【${awayName} vs ${homeName}】は${result.total.point.away}-${result.total.point.home}で${matchWinnerTeam}の勝利。${
        decisiveBout ? `${decisiveBout.statusName}は${decisiveWinnerName}選手が制した。` : ""
      }`;

      const matchStartTime = findMatchStartSec(chapters, num) ?? undefined;
      const recentMatch: RecentMatchRecap = {
        matchId,
        division: div,
        sectionNumber: latestSecNum[div],
        sectionTitle: latestEntry.post_title,
        matchNumber: num,
        scheduledAt: sec.time,
        youtubeUrl,
        matchVideoUrl:
          videoId && matchStartTime !== undefined ? `${youtubeUrl}&t=${matchStartTime}s` : youtubeUrl,
        matchStartTime,
        matchStartLabel:
          matchStartTime !== undefined ? formatSecondsToTimestamp(matchStartTime) : undefined,
        home: slot.home,
        away: slot.away,
        homePoint: result.total.point.home,
        awayPoint: result.total.point.away,
        winner: result.winner,
        isTiebreaker,
        matchHeadline:
        editorial.matches[matchId]?.headline ??
          (publishedMatchArticle?.status === "passed" ? publishedMatchArticle.headline ?? fallbackHeadline : fallbackHeadline),
        matchSummary:
          editorial.matches[matchId]?.summary ??
          (publishedMatchArticle?.status === "passed" ? publishedMatchArticle.summary : fallbackSummary),
        bouts: boutRecaps,
        narrationStatus,
      };
      resultRecaps.recentSections[div].push(recentMatch);
    }
  }

  dedupeAnalyses(allAnalyses);
  const videoCount = allAnalyses.filter((a) => a.source === "gemini-video").length;
  const editorialCount = allAnalyses.filter((a) => a.source === "editorial").length;
  const sources = new Set(allAnalyses.map((a) => a.source));
  resultRecaps.generatorMode =
    sources.size > 1
      ? "mixed"
      : sources.has("editorial")
        ? "editorial"
        : sources.has("gemini-video")
          ? "gemini-video"
          : "deterministic-rules";

  saveVideoFacts(videoFacts);
  saveRecapEvidence(evidenceData);
  saveRecapArticles(articlesData);
  saveRecapJobs(jobsData);
  saveWriteRequests(writeRequests);
  const validated = MatchRecapsDataSchema.parse(resultRecaps);
  const targetIsVisibleLatest = !options.onlySection || [...completedDivSections.s, ...completedDivSections.f]
    .filter((entry) => [completedDivSections.s.at(-1)?.post_name, completedDivSections.f.at(-1)?.post_name].includes(entry.post_name))
    .some((entry) => entry.post_name === options.onlySection);
  if (targetIsVisibleLatest) {
    let changed = true;
    if (fs.existsSync(RECAPS_FILE)) {
      const previous = MatchRecapsDataSchema.parse(JSON.parse(fs.readFileSync(RECAPS_FILE, "utf8")));
      const content = (value: MatchRecapsData) => {
        const { updatedAt: _updatedAt, ...rest } = value;
        return JSON.stringify(rest);
      };
      changed = content(previous) !== content(validated);
    }
    if (changed) {
      fs.writeFileSync(RECAPS_FILE, JSON.stringify(validated, null, 2), "utf8");
      console.log(`[Step 4b] Match recaps saved: ${RECAPS_FILE}`);
    } else console.log("[Step 4b] Visible recap snapshot is unchanged.");
  } else {
    console.log(`[Step 4b] Processed ${options.onlySection} in the durable job ledger; kept current visible recap snapshot.`);
  }
  console.log(
    `[Step 4b] Mode: ${validated.generatorMode} (editorial ${editorialCount}, video facts ${videoCount} / ${allAnalyses.length} bouts), video calls this run: ${budget.calls}, video seconds: ${budget.videoSeconds}`
  );
  return validated;
}

// 直接実行時のエントリポイント: tsx scripts/4-generate-match-recaps.ts [--only=div-s-sec4]
if (process.argv[1] && process.argv[1].endsWith("4-generate-match-recaps.ts")) {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const resultsOnly = process.argv.includes("--results-only");
  generateAndSaveMatchRecaps({ onlySection: only, resultsOnly }).catch((err) => {
    console.error("Match recap generation failed:", err);
    process.exit(1);
  });
}
