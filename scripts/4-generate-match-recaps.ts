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
import {
  extractYoutubeVideoId,
  fetchYoutubeChapters,
  findBoutWindow,
  findMatchStartSec,
} from "./recap/youtube-chapters";
import { parseModelList } from "./recap/gemini-client";
import {
  advanceBoutAnalysis,
  type BoutContext,
  type VideoBudget,
} from "./recap/bout-video-facts";
import {
  buildOfficialDataAnalysis,
  dedupeAnalyses,
  generateMatchNarrative,
  narrationInputHash,
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
    return { winner: a > b ? "A" : "B", rounds };
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
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    VIDEO_FACTS_FILE,
    JSON.stringify(VideoFactsDataSchema.parse(data), null, 2),
    "utf8"
  );
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
  const slugHasVideo = latestSlugs.some((slug) => SECTION_VIDEO_IDS[slug]);
  if (!slugHasVideo) return false;
  const pendingBout = Object.entries(facts.bouts).some(
    ([id, b]) =>
      latestSlugs.some((slug) => id.startsWith(`${slug}-`)) &&
      b.status === "pending" &&
      !editorial.bouts[id]
  );
  const pendingVisual = Object.entries(facts.visual).some(
    ([id, v]) => latestSlugs.some((slug) => id.startsWith(`${slug}-`)) && v.status === "pending"
  );
  const unseenSection = latestSlugs.some(
    (slug) => SECTION_VIDEO_IDS[slug] && !Object.keys(facts.bouts).some((id) => id.startsWith(`${slug}-`))
  );
  const pendingNarration = facts.pendingNarrations.some((id) =>
    latestSlugs.some((slug) => id.startsWith(`${slug}-`))
  );
  return pendingBout || pendingVisual || pendingNarration || unseenSection;
}

export async function generateAndSaveMatchRecaps(
  options: { onlySection?: string } = {}
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
  const videoModels = parseModelList(process.env.GEMINI_VIDEO_MODELS, DEFAULT_VIDEO_MODELS);
  const textModels = parseModelList(process.env.GEMINI_TEXT_MODELS, DEFAULT_TEXT_MODELS);
  const fps = Number(process.env.GEMINI_VIDEO_FPS || "1");
  const budget: VideoBudget = {
    maxCalls: Number(process.env.GEMINI_VIDEO_MAX_CALLS || "24"),
    // 無料枠のYouTube入力は1日8時間まで。他の利用分を残して7時間で打ち切る
    maxVideoSeconds: Number(process.env.GEMINI_VIDEO_MAX_SECONDS || String(7 * 3600)),
    calls: 0,
    videoSeconds: 0,
  };

  const videoFacts = loadVideoFacts();
  const editorial = loadEditorial();

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
      const videoId = SECTION_VIDEO_IDS[entry.post_name];
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
        playlistUrl: sec.links?.playlist?.url,
        matches: matchesArchive,
      });
    }

    // 最新節の詳細
    const latestEntry = completed.at(-1)!;
    const slug = latestEntry.post_name;
    const sec = latestEntry.fields.section;
    const videoId =
      SECTION_VIDEO_IDS[slug] || extractYoutubeVideoId(sec.links?.live?.url || "") || null;
    const youtubeUrl = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "https://www.youtube.com/@CapcomFightersJP";
    const divisionLabel = `Division ${div.toUpperCase()}`;
    const videoWorkAllowed =
      Boolean(apiKey && videoId) && (!options.onlySection || options.onlySection === slug);

    // 公式チャプター（キャッシュ優先）
    let chapters = videoFacts.videos[slug]?.chapters ?? [];
    if (videoId && chapters.length === 0) {
      try {
        chapters = await fetchYoutubeChapters(videoId);
        videoFacts.videos[slug] = { videoId, chapters };
        console.log(`[Chapters] ${slug}: ${chapters.length} chapters from YouTube description`);
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
        let facts = videoFacts.bouts[ctx.boutId];
        const window = findBoutWindow(chapters, num, hp.status);
        if (!facts && videoId && window) {
          facts = { videoId, ...window, status: "pending", runs: [] };
          videoFacts.bouts[ctx.boutId] = facts;
        }
        // 編集解説があるBoutは動画解析しない（無料枠の節約）
        if (facts && videoWorkAllowed && facts.status === "pending" && !editorial.bouts[ctx.boutId]) {
          await advanceBoutAnalysis({ apiKey, models: videoModels, ctx, facts, budget, fps });
          saveVideoFacts(videoFacts); // 途中で止まっても解析済み分は残す
        }

        // 映像からの画面上の事実（決着方法・PERFECT・バーンアウト・タグ）は編集解説の有無に関わらず抽出
        let visual = videoFacts.visual[ctx.boutId];
        if (!visual && videoId && window) {
          visual = { videoId, ...window, status: "pending", runs: [] };
          videoFacts.visual[ctx.boutId] = visual;
        }
        if (visual && videoWorkAllowed && visual.status === "pending") {
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
          : !videoId || !window
            ? "unavailable"
            : facts?.status === "pending" || visual?.status === "pending"
              ? "pending"
              : facts?.status === "complete" || visual?.status === "complete"
                ? "complete"
                : "unavailable";

        boutInputs.push({ ctx, games, facts });
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
      const narrationInput: NarrationMatchInput = {
        matchId,
        awayTeam: awayName,
        homeTeam: homeName,
        awayPoint: result.total.point.away,
        homePoint: result.total.point.home,
        winnerTeam: matchWinnerTeam,
        isTiebreaker,
        bouts: boutInputs,
      };

      // 全Boutの動画解析が決着（complete/failed/区間なし）したら解説を1回だけ生成
      const allSettled = boutInputs.every((b) => !b.facts || b.facts.status !== "pending");
      const anyComplete = boutInputs.some((b) => b.facts?.status === "complete");
      const inputHash = narrationInputHash(narrationInput);
      let narrative = videoFacts.narratives[matchId];
      // 全Boutに編集解説がある試合は自動生成しない（無料枠の節約）
      const needsNarration = boutInputs.some((b) => !editorial.bouts[b.ctx.boutId]);
      const markPending = (pending: boolean) => {
        const list = videoFacts.pendingNarrations.filter((id) => id !== matchId);
        videoFacts.pendingNarrations = pending ? [...list, matchId] : list;
      };
      if (!needsNarration) markPending(false);
      if (
        apiKey &&
        needsNarration &&
        allSettled &&
        anyComplete &&
        (!narrative || narrative.inputHash !== inputHash) &&
        (!options.onlySection || options.onlySection === slug)
      ) {
        console.log(`[Narration] ${matchId}: generating from verified video facts...`);
        const generated = await generateMatchNarrative({
          apiKey,
          models: textModels,
          match: narrationInput,
        });
        if (generated) {
          videoFacts.narratives[matchId] = generated;
          narrative = generated;
          markPending(false);
        } else {
          console.warn(`[Narration] ${matchId}: no narration model available today; deferred to the next run.`);
          markPending(true);
        }
        saveVideoFacts(videoFacts);
      }
      const narrativeUsable = narrative && narrative.inputHash === inputHash;
      // 解説文の進み具合: 動画がある試合で、解析待ち・解説の持ち越し中なら「作成中」
      const narrationStatus: "complete" | "pending" | "unavailable" =
        editorial.matches[matchId] || narrativeUsable || !needsNarration
          ? "complete"
          : videoId &&
              (!allSettled || anyComplete || videoFacts.pendingNarrations.includes(matchId))
            ? "pending"
            : "unavailable";

      // 動画由来の解説は、2回の解析で一致した要点が1件以上あるBoutだけに採用
      boutRecaps.forEach((recap, idx) => {
        const input = boutInputs[idx];
        const nb = narrativeUsable
          ? narrative!.bouts.find((b) => b.boutId === input.ctx.boutId)
          : undefined;
        // 要約文は2回一致のチェックを通らないため公式データ由来のまま使い、動画由来は要点だけにする
        if (input.facts?.status === "complete" && nb && nb.keyPoints.length > 0) {
          recap.analysis = {
            source: "gemini-video",
            summary: recap.analysis.summary,
            keyPoints: nb.keyPoints,
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
          (narrativeUsable ? narrative!.matchHeadline : fallbackHeadline),
        matchSummary:
          editorial.matches[matchId]?.summary ??
          (narrativeUsable ? narrative!.matchSummary : fallbackSummary),
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
  const validated = MatchRecapsDataSchema.parse(resultRecaps);
  fs.writeFileSync(RECAPS_FILE, JSON.stringify(validated, null, 2), "utf8");
  console.log(`[Step 4b] Match recaps saved: ${RECAPS_FILE}`);
  console.log(
    `[Step 4b] Mode: ${validated.generatorMode} (editorial ${editorialCount}, video facts ${videoCount} / ${allAnalyses.length} bouts), video calls this run: ${budget.calls}, video seconds: ${budget.videoSeconds}`
  );
  return validated;
}

// 直接実行時のエントリポイント: tsx scripts/4-generate-match-recaps.ts [--only=div-s-sec4]
if (process.argv[1] && process.argv[1].endsWith("4-generate-match-recaps.ts")) {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  generateAndSaveMatchRecaps({ onlySection: only }).catch((err) => {
    console.error("Match recap generation failed:", err);
    process.exit(1);
  });
}
