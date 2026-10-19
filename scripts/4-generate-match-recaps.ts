import fs from "node:fs";
import path from "node:path";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

import {
  MatchRecapsDataSchema,
} from "../src/lib/schema";
import type {
  DivisionId,
  MatchRecapsData,
  PastSectionArchive,
  RecentBoutRecap,
  RecentMatchRecap,
  VideoHighlightMoment,
} from "../src/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../src/lib/simulator";
import { formatCharName } from "../src/lib/player-encyclopedia";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const SEED_FILE = path.join(DATA_DIR, "raw-capcom-seed.json");
const RECAPS_FILE = path.join(DATA_DIR, "match-recaps.json");

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
 * 1ゲームごとのラウンド奪取状況を解析
 */
function analyzeRoundFlow(gameLogs: RawGameLog[] = []): {
  roundFlowTexts: string[];
  gameOutcomes: Array<{
    gameNum: number;
    winner: "home" | "away";
    homeRounds: number;
    awayRounds: number;
    isFullRound: boolean;
    isComeback: boolean;
  }>;
} {
  const roundFlowTexts: string[] = [];
  const gameOutcomes: Array<{
    gameNum: number;
    winner: "home" | "away";
    homeRounds: number;
    awayRounds: number;
    isFullRound: boolean;
    isComeback: boolean;
  }> = [];

  gameLogs.forEach((g, idx) => {
    const rounds = [g.r1, g.r2, g.r3].filter(Boolean);
    const homeWins = rounds.filter((r) => r === "1").length;
    const awayWins = rounds.filter((r) => r === "2").length;
    const winner: "home" | "away" = homeWins > awayWins ? "home" : "away";
    const isFullRound = rounds.length === 3;
    const isComeback =
      (winner === "home" && rounds[0] === "2") ||
      (winner === "away" && rounds[0] === "1");

    let text = `Game ${idx + 1}: `;
    if (rounds.length === 2) {
      text += `[${winner === "home" ? "2-0" : "0-2"}] ストレート先取`;
    } else {
      text += `[${winner === "home" ? "2-1" : "1-2"}] フルラウンド`;
      if (isComeback) text += "（先制されるも逆転）";
    }
    roundFlowTexts.push(text);

    gameOutcomes.push({
      gameNum: idx + 1,
      winner,
      homeRounds: homeWins,
      awayRounds: awayWins,
      isFullRound,
      isComeback,
    });
  });

  return { roundFlowTexts, gameOutcomes };
}

/**
 * ルールベース＆公式ラウンドログに基づく臨場感ある詳細展開解説を生成
 */
function generateDeterministicVisualAnalysis(
  statusName: string,
  homePlayerName: string,
  awayPlayerName: string,
  homeChara: string,
  awayChara: string,
  homeBattle: number,
  awayBattle: number,
  winner: "home" | "away",
  gameOutcomes: ReturnType<typeof analyzeRoundFlow>["gameOutcomes"]
): {
  tacticalFocus: string;
  turningPoint: string;
  lethalMove: string;
  headline: string;
  summary: string;
} {
  const winnerPlayer = winner === "home" ? homePlayerName : awayPlayerName;
  const loserPlayer = winner === "home" ? awayPlayerName : homePlayerName;
  const winnerChara = formatCharName(winner === "home" ? homeChara : awayChara);
  const loserChara = formatCharName(winner === "home" ? awayChara : homeChara);

  const isFullSet = Math.abs(homeBattle - awayBattle) === 1 && (homeBattle >= 2 || awayBattle >= 2);
  const totalGames = gameOutcomes.length;
  const hadComebackGame = gameOutcomes.some((g) => g.isComeback);
  const wonFromBehind =
    (winner === "home" && gameOutcomes[0]?.winner === "away") ||
    (winner === "away" && gameOutcomes[0]?.winner === "home");

  let tacticalFocus = "";
  let turningPoint = "";
  let lethalMove = "";

  if (winnerChara.includes("ダルシム")) {
    tacticalFocus = `${winnerPlayer}選手が長いリーチの通常技と低空ヨガフロートで間合いを徹底管理し、相手の突進や接近を許さない立ち回り。`;
  } else if (winnerChara.includes("ザンギエフ") || winnerChara.includes("リリー")) {
    tacticalFocus = `${winnerPlayer}選手がドライブゲージを削る強烈なコマ投げと圧巻のプレッシャーで画面端に追い詰める展開。`;
  } else if (winnerChara.includes("ガイル") || winnerChara.includes("サガット")) {
    tacticalFocus = `盤石の弾撃ちと鉄壁の対空迎撃で相手の飛びを完全にシャットアウトする完璧な要塞戦法。`;
  } else {
    tacticalFocus = `${winnerPlayer}選手の鋭いラッシュ攻撃とドライブインパクトの使い分けが光り、地上戦の主導権を終始握り続ける。`;
  }

  if (wonFromBehind || (isFullSet && totalGames >= 3)) {
    turningPoint = `相手に先行を許す苦しい立ち上がりとなったが、中盤以降のバーンアウト攻防を冷静に耐え凌ぎ、的確な反撃から流れを完全に引き寄せた。`;
  } else if (hadComebackGame) {
    turningPoint = `第1ラウンドを取られて崖っぷちに立たされた場面で、強気の起き攻めとミリ単位のヒット確認を連続で通した勝負強さが光る。`;
  } else {
    turningPoint = `序盤から相手の牽制に対して的確な差し返しを連発し、一度も主導権を渡さずペースを保ち続けた。`;
  }

  if (isFullSet) {
    lethalMove = `運命の最終セット、残り体力わずかの極限状態から、飛び込んできた${loserChara}に対し冷静無比な対空SA（スーパーアーツ）を叩き込んで決着！`;
  } else {
    lethalMove = `画面端に追い詰めた状況から強烈なシミー（後退による投げスカ誘い）を決め、大ダメージコンボでKO！`;
  }

  const headline = isFullSet
    ? `${winnerPlayer}選手がフルセットの死闘を制す！${statusName}でチームを牽引`
    : `${winnerPlayer}選手が堂々の快勝！${statusName}で貴重な勝利をもたらす`;

  const summary = `${statusName}（${homePlayerName} vs ${awayPlayerName}）は、${homeBattle}-${awayBattle}で${winnerPlayer}選手（${winnerChara}）が勝利。${tacticalFocus} ${turningPoint}`;

  return {
    tacticalFocus,
    turningPoint,
    lethalMove,
    headline,
    summary,
  };
}

/**
 * Gemini API による YouTube 動画理解の呼び出し（タイムスタンプ・クリッピング対応）
 */
async function tryGenerateWithGeminiVideo(
  apiKey: string,
  youtubeUrl: string,
  startOffsetSec: number,
  endOffsetSec: number,
  matchInfo: {
    home: string;
    away: string;
    bouts: Array<{
      statusName: string;
      homePlayer: string;
      awayPlayer: string;
      homeChara: string;
      awayChara: string;
      winner: string;
      score: string;
    }>;
  }
): Promise<{
  matchHeadline: string;
  matchSummary: string;
  matchHighlightSec: number;
  matchHighlightText: string;
  bouts: Array<{
    tacticalFocus: string;
    turningPoint: string;
    lethalMove: string;
    commentaryQuote: string;
    highlightSec: number;
    highlightLabel: string;
  }>;
} | null> {
  const candidateModels = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL,
        "gemini-3.5-flash",
        "gemini-3.8-flash",
      ].filter(Boolean) as string[]
    )
  );

  const prompt = `
あなたはストリートファイター6のプロ格ゲーマー兼SFL公式アナリストです。
添付されたYouTubeのSFL公式動画クリップ（${startOffsetSec}秒〜${endOffsetSec}秒）から、
【${matchInfo.home} vs ${matchInfo.away}】の試合展開を、「ゲームプレイ画面の映像」を注視して詳細に分析してください。
実況の言葉だけでなく、画面内のドライブゲージ・バーンアウト状況、牽制技の振り合い（しゃがみ中P、立ち中K、小技など）、飛びと対空の成否、画面端のシミーやセットプレイなど、実際の画面で起きたプレイヤーの操作と状態を捉えてください。

【公式確定結果】
${matchInfo.bouts
  .map(
    (b) =>
      `・${b.statusName}: ${b.homePlayer}(${b.homeChara}) vs ${b.awayPlayer}(${b.awayChara}) -> 結果: ${b.score} で${b.winner}勝利`
  )
  .join("\n")}

以下のJSON形式で出力してください:
{
  "matchHeadline": "試合全体の見出し（30文字以内）",
  "matchSummary": "試合全体の流れとドラマの要約（150文字程度。ゲージ攻防や主導権の推移を含む）",
  "matchHighlightSec": ${startOffsetSec + 120},
  "matchHighlightText": "マッチ最大の決定打シーンの解説（具体的な技名・ヒット確認・逆転劇）",
  "bouts": [
    ${matchInfo.bouts
      .map(
        (b) => `{
      "tacticalFocus": "${b.statusName}での地上戦牽制（小技・中攻撃の振り合い）やドライブゲージ・バーンアウト攻防（80文字）",
      "turningPoint": "飛びと対空、画面端のシミーやパニッシュカウンターなど勝負の分かれ目（80文字）",
      "lethalMove": "決着技（SA/CA、OD無敵技、コマンド投げなど）やリーサルの情景（50文字）",
      "commentaryQuote": "実況解説席の盛り上がりや印象的な言葉",
      "highlightSec": ${startOffsetSec + 60},
      "highlightLabel": "名場面の見出し"
    }`
      )
      .join(",\n    ")}
  ]
}
`;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  fileData: {
                    fileUri: youtubeUrl,
                  },
                  videoMetadata: {
                    startOffset: `${startOffsetSec}s`,
                    endOffset: `${endOffsetSec}s`,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        }),
      });

      if (!res.ok) {
        console.warn(`[Gemini API - ${model}] HTTP ${res.status}. Trying next candidate...`);
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      console.log(`[Gemini API] Successfully analyzed video segment using ${model}!`);
      return JSON.parse(text);
    } catch (err) {
      console.warn(`[Gemini API - ${model}] Video understanding error: ${(err as Error).message}`);
    }
  }

  return null;
}

/**
 * 秒数を HH:MM:SS または MM:SS に変換
 */
function formatSecondsToTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export async function generateAndSaveMatchRecaps(): Promise<MatchRecapsData> {
  console.log("=== SFL 2026 Match Recaps & Video Highlights Generator Start ===");

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }

  const rawSeed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as {
    data?: { schedules?: RawScheduleEntry[] };
  };

  const schedules = rawSeed.data?.schedules || [];
  const completedDivSections: { s: RawScheduleEntry[]; f: RawScheduleEntry[] } = {
    s: [],
    f: [],
  };

  for (const s of schedules) {
    const slug = s.post_name;
    const hasResult =
      s.fields.section.match1 &&
      typeof s.fields.section.match1.result === "object" &&
      s.fields.section.match1.result !== null;
    if (!hasResult) continue;

    if (slug.startsWith("div-s-sec")) {
      completedDivSections.s.push(s);
    } else if (slug.startsWith("div-f-sec")) {
      completedDivSections.f.push(s);
    }
  }

  const latestS = completedDivSections.s[completedDivSections.s.length - 1];
  const latestF = completedDivSections.f[completedDivSections.f.length - 1];

  const latestSecNum = {
    s: latestS ? parseInt(latestS.post_name.replace("div-s-sec", ""), 10) : 0,
    f: latestF ? parseInt(latestF.post_name.replace("div-f-sec", ""), 10) : 0,
  };

  const apiKey = process.env.GEMINI_API_KEY || "";
  let usedGeminiVideo = false;

  const resultRecaps: MatchRecapsData = {
    updatedAt: new Date().toISOString(),
    generatorMode: apiKey ? "gemini-video" : "deterministic-rules",
    latestSection: latestSecNum,
    recentSections: {
      s: [],
      f: [],
    },
    pastSections: {
      s: [],
      f: [],
    },
  };

  // 各ディビジョンごとに処理
  for (const div of ["s", "f"] as DivisionId[]) {
    const completed = completedDivSections[div];
    if (completed.length === 0) continue;

    // 過去節のアーカイブ
    const pastEntries = completed.slice(0, completed.length - 1);
    for (const entry of pastEntries) {
      const secNum = parseInt(entry.post_name.replace(`div-${div}-sec`, ""), 10);
      const sec = entry.fields.section;
      const ytUrl = sec.links?.live?.url || "https://www.youtube.com/@CapcomFightersJP";
      const matchesArchive: PastSectionArchive["matches"] = [];

      for (const slotKey of ["match1", "match2", "match3"] as const) {
        const slot = sec[slotKey];
        if (!slot || slot.use === "hide" || typeof slot.result !== "object" || !slot.result) continue;
        matchesArchive.push({
          home: slot.home,
          away: slot.away,
          homePoint: slot.result.total.point.home,
          awayPoint: slot.result.total.point.away,
          winner: slot.result.winner,
        });
      }

      resultRecaps.pastSections[div].push({
        sectionNumber: secNum,
        sectionTitle: entry.post_title,
        scheduledAt: sec.time,
        youtubeUrl: ytUrl,
        playlistUrl: sec.links?.playlist?.url,
        matches: matchesArchive,
      });
    }

    // 最新節の詳細展開生成
    const latestEntry = completed[completed.length - 1];
    if (!latestEntry) continue;

    const secNum = latestSecNum[div];
    const sec = latestEntry.fields.section;
    const defaultYtUrl =
      sec.links?.live?.url ||
      (div === "s" && secNum === 4
        ? "https://www.youtube.com/watch?v=23c5PgJcFwY"
        : "https://www.youtube.com/@CapcomFightersJP");

    const slots: Array<{ num: number; slot: RawMatchSlot }> = [
      { num: 1, slot: sec.match1 },
      { num: 2, slot: sec.match2 },
      { num: 3, slot: sec.match3 },
    ];
    if (sec.match4 && sec.match4.use !== "hide" && sec.match4.home !== "none") {
      slots.push({ num: 4, slot: sec.match4 });
    }

    // 1マッチあたり約8分(480秒 / 約12.6万トークン)の区間クリッピング (無料枠 250,000 TPM に完全適合)
    const matchTimeWindows = [
      { start: 1200, end: 1680 },
      { start: 4200, end: 4680 },
      { start: 7800, end: 8280 },
      { start: 11400, end: 11880 },
    ];

    for (const { num, slot } of slots) {
      if (!slot || slot.use === "hide" || typeof slot.result !== "object" || !slot.result) continue;

      const p1 = slot.result["1p"] || [];
      const p2 = slot.result["2p"] || [];
      const rawLogs = slot.result.log || [];
      const homeMeta = TEAM_META_MAP[slot.home];
      const awayMeta = TEAM_META_MAP[slot.away];
      const homeName = homeMeta?.name || slot.home;
      const awayName = awayMeta?.name || slot.away;
      const count = Math.min(p1.length, p2.length);

      const bouts: RecentBoutRecap[] = [];
      const boutAnalysisList: Array<{
        statusName: string;
        homePlayer: string;
        awayPlayer: string;
        homeChara: string;
        awayChara: string;
        winner: string;
        score: string;
      }> = [];

      for (let i = 0; i < count; i++) {
        const hp = p1[i];
        const ap = p2[i];
        const homeCharaKey = Object.keys(hp.use_chara || {})[0] || "";
        const awayCharaKey = Object.keys(ap.use_chara || {})[0] || "";
        const boutLogs = rawLogs[i] || [];
        const { roundFlowTexts, gameOutcomes } = analyzeRoundFlow(boutLogs);

        const boutWinner: "home" | "away" = hp.battle > ap.battle ? "home" : "away";
        const isFullSet =
          (hp.status === 2 && (hp.battle + ap.battle === 5)) ||
          (hp.status !== 2 && (hp.battle + ap.battle === 3));

        const baseAnalysis = generateDeterministicVisualAnalysis(
          hp.status_name,
          PLAYER_NAME_MAP[hp.player] || hp.player,
          PLAYER_NAME_MAP[ap.player] || ap.player,
          homeCharaKey,
          awayCharaKey,
          hp.battle,
          ap.battle,
          boutWinner,
          gameOutcomes
        );

        const timeWindow = matchTimeWindows[num - 1] || { start: 1800, end: 3600 };
        const boutOffset = timeWindow.start + i * 600 + 300;

        const highlightMoment: VideoHighlightMoment = {
          timestampSeconds: boutOffset,
          timestampLabel: formatSecondsToTimestamp(boutOffset),
          title: baseAnalysis.headline,
          description: baseAnalysis.lethalMove,
          videoUrlWithTime: `${defaultYtUrl}&t=${boutOffset}s`,
        };

        bouts.push({
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
          isFullSet,
          roundFlow: roundFlowTexts,
          visualAnalysis: {
            tacticalFocus: baseAnalysis.tacticalFocus,
            turningPoint: baseAnalysis.turningPoint,
            lethalMove: baseAnalysis.lethalMove,
          },
          highlight: highlightMoment,
        });

        boutAnalysisList.push({
          statusName: hp.status_name,
          homePlayer: PLAYER_NAME_MAP[hp.player] || hp.player,
          awayPlayer: PLAYER_NAME_MAP[ap.player] || ap.player,
          homeChara: formatCharName(homeCharaKey),
          awayChara: formatCharName(awayCharaKey),
          winner: boutWinner === "home" ? homeName : awayName,
          score: `${hp.battle} - ${ap.battle}`,
        });
      }

      // マッチ総括
      const isTiebreaker =
        (slot.result.total.point.home === 30 && slot.result.total.point.away === 20) ||
        (slot.result.total.point.home === 20 && slot.result.total.point.away === 30);
      const matchWinnerTeam = slot.result.winner === "home" ? homeName : awayName;
      const winnerScore =
        slot.result.winner === "home"
          ? `${slot.result.total.point.home} - ${slot.result.total.point.away}`
          : `${slot.result.total.point.away} - ${slot.result.total.point.home}`;

      let matchHeadline = `${matchWinnerTeam}が${winnerScore}で勝利！`;
      if (isTiebreaker) {
        matchHeadline = `大熱戦の延長戦を制し、${matchWinnerTeam}が勝ち点30をもぎ取る！`;
      } else if (slot.result.total.point.home === 40 || slot.result.total.point.away === 40) {
        matchHeadline = `${matchWinnerTeam}が40-0の完全勝利で圧倒！`;
      }

      let matchSummary = `第${num}試合【${awayName} vs ${homeName}】は、${slot.result.total.point.away} - ${slot.result.total.point.home} で${matchWinnerTeam}がマッチ勝利。`;
      if (isTiebreaker) {
        matchSummary += `先鋒・中堅・大将戦を終えて20-20の同点となり、決着は運命の延長戦へ。緊迫した1先勝負を制した${matchWinnerTeam}が大きな勝ち点30を獲得しました。`;
      } else if (slot.result.total.point.home >= 30 || slot.result.total.point.away >= 30) {
        matchSummary += `大将戦を制した${matchWinnerTeam}が大量ポイントを獲得し、順位戦線で大きなアドバンテージを手にしました。`;
      }

      // Gemini Video API による動画理解（キーがあり、YouTubeリンクが有効な場合）
      if (apiKey && defaultYtUrl.includes("youtube.com")) {
        const timeWindow = matchTimeWindows[num - 1] || { start: 1200, end: 3600 };
        console.log(
          `[Gemini Video] Requesting video understanding for ${div.toUpperCase()} Sec${secNum} Match${num} (${timeWindow.start}s - ${timeWindow.end}s)...`
        );
        const geminiResult = await tryGenerateWithGeminiVideo(
          apiKey,
          defaultYtUrl,
          timeWindow.start,
          timeWindow.end,
          {
            home: homeName,
            away: awayName,
            bouts: boutAnalysisList,
          }
        );

        if (geminiResult) {
          usedGeminiVideo = true;
          matchHeadline = geminiResult.matchHeadline || matchHeadline;
          matchSummary = geminiResult.matchSummary || matchSummary;

          // Boutごとの詳細をGemini動画理解結果で更新
          geminiResult.bouts.forEach((gb, idx) => {
            if (bouts[idx]) {
              bouts[idx].visualAnalysis.tacticalFocus =
                gb.tacticalFocus || bouts[idx].visualAnalysis.tacticalFocus;
              bouts[idx].visualAnalysis.turningPoint =
                gb.turningPoint || bouts[idx].visualAnalysis.turningPoint;
              bouts[idx].visualAnalysis.lethalMove =
                gb.lethalMove || bouts[idx].visualAnalysis.lethalMove;
              bouts[idx].visualAnalysis.commentaryQuote = gb.commentaryQuote;

              if (gb.highlightSec) {
                bouts[idx].highlight = {
                  timestampSeconds: gb.highlightSec,
                  timestampLabel: formatSecondsToTimestamp(gb.highlightSec),
                  title: gb.highlightLabel || bouts[idx].highlight?.title || "",
                  description: gb.lethalMove,
                  videoUrlWithTime: `${defaultYtUrl}&t=${gb.highlightSec}s`,
                };
              }
            }
          });
        }
      }

      const matchHighlightSec = matchTimeWindows[num - 1]?.start || 1800;
      const recentMatch: RecentMatchRecap = {
        matchId: `${latestEntry.post_name}-m${num}`,
        division: div,
        sectionNumber: secNum,
        sectionTitle: latestEntry.post_title,
        matchNumber: num,
        scheduledAt: sec.time,
        youtubeUrl: defaultYtUrl,
        home: slot.home,
        away: slot.away,
        homePoint: slot.result.total.point.home,
        awayPoint: slot.result.total.point.away,
        winner: slot.result.winner,
        isTiebreaker,
        matchHeadline,
        matchSummary,
        matchHighlight: {
          timestampSeconds: matchHighlightSec,
          timestampLabel: formatSecondsToTimestamp(matchHighlightSec),
          title: matchHeadline,
          description: matchSummary,
          videoUrlWithTime: `${defaultYtUrl}&t=${matchHighlightSec}s`,
        },
        bouts,
      };

      resultRecaps.recentSections[div].push(recentMatch);
    }
  }

  if (usedGeminiVideo) {
    resultRecaps.generatorMode = "gemini-video";
  }

  // スキーマ検証
  const validated = MatchRecapsDataSchema.parse(resultRecaps);

  fs.writeFileSync(RECAPS_FILE, JSON.stringify(validated, null, 2), "utf8");
  console.log(`[Step 4b] Match recaps saved successfully: ${RECAPS_FILE}`);
  console.log(
    `[Step 4b] Generated recaps for Div S Sec ${latestSecNum.s} (${validated.recentSections.s.length} matches), Div F Sec ${latestSecNum.f} (${validated.recentSections.f.length} matches)`
  );
  console.log(`[Step 4b] Mode: ${validated.generatorMode}`);

  return validated;
}

// 直接実行時のエントリポイント
if (process.argv[1] && process.argv[1].endsWith("4-generate-match-recaps.ts")) {
  generateAndSaveMatchRecaps().catch((err) => {
    console.error("Match recap generation failed:", err);
    process.exit(1);
  });
}
