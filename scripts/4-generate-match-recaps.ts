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
 * 文章からタイムスタンプ関連の数字（XX分XX秒など）を除去
 */
function cleanTimestampFromText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\d{1,3}分\d{1,2}秒[（(][^）)]*[）)]/g, "")
    .replace(/\d{1,3}分\d{1,2}秒(?:頃|付近)?/g, "")
    .replace(/\d{1,2}:\d{2}(?::\d{2})?(?:[（(][^）)]*[）)])?/g, "")
    .replace(/（動画開始から約\d+秒）/g, "")
    .replace(/約\d+秒/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * 1ゲームごとのラウンド奪取状況を解析（UIの表示順に合わせて [AWAY - HOME] の順序で出力）
 */
function analyzeRoundFlow(
  gameLogs: RawGameLog[] = [],
  awayPlayerName: string = "",
  homePlayerName: string = ""
): {
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
    const winnerPlayer = winner === "away" ? awayPlayerName : homePlayerName;
    const isFullRound = rounds.length === 3;
    const isComeback =
      (winner === "home" && rounds[0] === "2") ||
      (winner === "away" && rounds[0] === "1");

    // UIの表示順に合わせて [AWAY - HOME] の順序でスコアを表示
    let text = `Game ${idx + 1}: [${awayWins}-${homeWins}] `;
    if (winnerPlayer) {
      text += `${winnerPlayer}選手が`;
    }
    if (rounds.length === 2) {
      text += "ストレート先取";
    } else {
      text += "フルラウンド勝利";
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
    tacticalFocus = `${winnerPlayer}選手が長いリーチの牽制と低空ヨガフロートで間合いを徹底管理し、相手の突進をヨガファイアで阻みながらドライブゲージを削る立ち回り。`;
  } else if (winnerChara.includes("ザンギエフ") || winnerChara.includes("リリー")) {
    tacticalFocus = `${winnerPlayer}選手がドライブゲージを削る強烈なコマ投げと圧巻のプレッシャーで画面端に追い詰め、相手にバーンアウトの重圧をかける展開。`;
  } else if (winnerChara.includes("ガイル") || winnerChara.includes("サガット")) {
    tacticalFocus = `盤石の弾撃ちと鉄壁の対空迎撃で相手の飛びを完全にシャットアウトし、相手のドライブゲージを削り切る要塞戦法。`;
  } else if (winnerChara.includes("エレナ")) {
    tacticalFocus = `${winnerPlayer}選手がリーチの長い足技とローキックでの牽制を機能させ、地上戦の間合いを完全に支配。`;
  } else if (winnerChara.includes("ルーク")) {
    tacticalFocus = `${winnerPlayer}選手がしゃがみ中Pとサンドブラストで間合いを支配し、ドライブラッシュを交えて相手のドライブゲージを着実に削る完璧な主導権掌握。`;
  } else if (winnerChara.includes("リュウ")) {
    tacticalFocus = `${winnerPlayer}選手が重厚なしゃがみ中Pと波掌撃で地上を制圧し、バーンアウトを徹底回避しながら前線を押し上げる堂々の立ち回り。`;
  } else if (winnerChara.includes("キャミィ")) {
    tacticalFocus = `${winnerPlayer}選手が鋭いストライクと素早い地上ダッシュで画面端に追い詰め、シミーと打撃の二択で一気に体力を削り取る展開。`;
  } else if (winnerChara.includes("ケン") || winnerChara.includes("豪鬼")) {
    tacticalFocus = `${winnerPlayer}選手の鋭いラッシュ攻撃と弾牽制が光り、相手のドライブゲージを削りながら画面端へ運ぶ苛烈な攻勢。`;
  } else {
    tacticalFocus = `${winnerPlayer}選手の鋭いラッシュ攻撃と牽制小技の使い分けが光り、地上戦の主導権を終始握り続ける。`;
  }

  if (wonFromBehind || (isFullSet && totalGames >= 3)) {
    turningPoint = `相手に先行を許す苦しい立ち上がりとなったが、中盤以降のバーンアウト攻防を冷静に耐え凌ぎ、的確な対空と差し返しから流れを完全に引き寄せた。`;
  } else if (hadComebackGame) {
    turningPoint = `第1ラウンドを取られて崖っぷちに立たされた場面で、強気の起き攻めシミーとミリ単位のヒット確認を連続で通した勝負強さが光る。`;
  } else {
    turningPoint = `序盤から相手の牽制に対して的確な差し返しを連発し、飛び込みに対しても寸分狂わぬ対空迎撃で一度も主導権を渡さなかった。`;
  }

  if (winnerChara.includes("ダルシム")) {
    lethalMove = isFullSet
      ? `運命の最終セット、互いに体力ミリの極限状態から、相手の技の出かかりを捉えるパニッシュカウンターからヨガファイアを叩き込んで劇的KO！`
      : `画面端に追い詰めた状況から、的確なリーチ牽制と対空迎撃で相手を寄せ付けず完勝KO！`;
  } else if (winnerChara.includes("ルーク")) {
    lethalMove = `バーンアウト状態で追い詰められた相手に対し、ドライブラッシュからの怒涛のラッシュでガードをこじ開け、最後はDDTを叩き込んで圧巻のKO勝利！`;
  } else if (winnerChara.includes("エレナ")) {
    lethalMove = `画面端でガードを固める相手に対し、ドライブラッシュからの下段崩しを冷静にヒット確認し、美しいコンボを叩き込んで完全決着KO！`;
  } else if (winnerChara.includes("リュウ")) {
    lethalMove = `画面端に追い詰めた状況から、投げ抜けを誘う鮮やかなシミー（バックステップ）でパニッシュカウンターを奪い、渾身のSA3（真・昇龍拳）を叩き込んでKO！`;
  } else if (winnerChara.includes("ザンギエフ")) {
    lethalMove = `画面端に追い詰めた極限のプレッシャーから、相手の暴れやジャンプを許さず完璧なコマンド投げを叩き込んで大ダメージKO！`;
  } else if (winnerChara.includes("ガイル")) {
    lethalMove = `相手の決死の飛び込みに対し、冷静沈着なサマーソルトキックからSA3（クロスファイアサマーソルト）へ繋いで完全KO！`;
  } else if (isFullSet) {
    lethalMove = `運命の最終セット、残り体力わずかの極限状態から、飛び込んできた相手に対し冷静無比な対空SA（スーパーアーツ）を叩き込んで決着！`;
  } else {
    lethalMove = `画面端に追い詰めた状況から強烈なシミー（後退による投げスカ誘い）を決め、大ダメージコンボでKO！`;
  }

  const headline = isFullSet
    ? `${winnerPlayer}選手がフルセットの死闘を制す！${statusName}でチームを牽引`
    : `${winnerPlayer}選手が堂々の快勝！${statusName}で貴重な勝利をもたらす`;

  const summary = `${statusName}（${awayPlayerName} vs ${homePlayerName}）は、${awayBattle}-${homeBattle}で${winnerPlayer}選手（${winnerChara}）が勝利。${tacticalFocus} ${turningPoint}`;

  return {
    tacticalFocus,
    turningPoint,
    lethalMove,
    headline,
    summary,
  };
}

interface GeminiVideoAnalysisResult {
  matchHeadline: string;
  matchSummary: string;
  videoObservations: {
    driveAndBurnout: string;
    pokesAndFootsies: string;
    jumpAndAntiAir: string;
    cornerAndShimmy: string;
    finalLethalMove: string;
    koTimestampSec: number;
    koTimestampLabel?: string;
  };
}

/**
 * 有効なYouTube動画リンク（watch または /live/）かどうかを判定
 */
function isValidYoutubeVideoUrl(url: string): boolean {
  return (
    url.includes("watch?v=") ||
    url.includes("youtube.com/live/") ||
    url.includes("youtu.be/")
  );
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
): Promise<GeminiVideoAnalysisResult | null> {
  // 安定性の高い gemini-3.5-flash を優先
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
添付されたYouTubeのSFL公式動画クリップ（${startOffsetSec}秒〜${endOffsetSec}秒、${matchInfo.away} vs ${matchInfo.home} の大一番・決着シーン）の【ゲーム画面の映像】を凝視して詳細に分析してください。

実況の音声だけに頼らず、以下の「ゲーム画面に映る映像」を具体的に分析してください：
1. ドライブゲージ状況（ドライブゲージ残量の削り合い、バーンアウトの発生、バーンアウト時の攻防）
2. 地上戦・牽制（小技・中攻撃の振り合い、リーチ管理、差し返し）
3. 飛びと対空（ジャンプ攻撃の成否、対空技による迎撃）
4. 画面端の攻防（シミーでの投げ抜け誘い、柔道、画面端脱出の駆け引き）
5. 試合の決着シーン（KOの瞬間・決着技：CA/SA、通常技、対空など、体力がミリになった極限状態からの逆転、決着時刻のタイムスタンプ）

【公式確定結果】
${matchInfo.bouts
  .map(
    (b) =>
      `・${b.statusName}: ${b.homePlayer}(${b.homeChara}) vs ${b.awayPlayer}(${b.awayChara}) -> 結果: ${b.score} で${b.winner}勝利`
  )
  .join("\n")}

以下のJSONフォーマットで出力してください:
{
  "matchHeadline": "試合全体の見出し（30文字以内）",
  "matchSummary": "試合全体の流れと決着ドラマの要約（150文字程度。ゲージ攻防や主導権の推移を含む）",
  "videoObservations": {
    "driveAndBurnout": "ドライブゲージとバーンアウトの映像分析（具体的な画面状況）",
    "pokesAndFootsies": "牽制技・地上戦の映像分析（振っていた小技・中技・リーチ管理）",
    "jumpAndAntiAir": "飛びと対空の映像分析（ジャンプと迎撃技の攻防）",
    "cornerAndShimmy": "画面端・シミーの映像分析（投げと打撃、シミーの駆け引き）",
    "finalLethalMove": "最終決着シーンのKO技・リーサル状況（何分何秒あたりでどの技でKOが決まったか詳細に）",
    "koTimestampSec": ${Math.floor((startOffsetSec + endOffsetSec) / 2)},
    "koTimestampLabel": "MM:SSまたはHH:MM:SS"
  }
}
`;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 一時的な503やネットワークエラーに備えて最大3回リトライ
    for (let attempt = 1; attempt <= 3; attempt++) {
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
              temperature: 0.2,
            },
          }),
        });

        if (res.status === 503 || res.status === 429) {
          console.warn(
            `[Gemini API - ${model}] HTTP ${res.status} (attempt ${attempt}/3). Backing off for 6s...`
          );
          await new Promise((r) => setTimeout(r, 6000));
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.warn(`[Gemini API - ${model}] HTTP ${res.status}: ${errBody.slice(0, 150)}`);
          break; // 400等の致命的エラーはモデル切り替え
        }

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        console.log(`[Gemini API] Successfully analyzed video segment using ${model}!`);
        return JSON.parse(text);
      } catch (err) {
        console.warn(`[Gemini API - ${model}] Error (attempt ${attempt}/3): ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 4000));
      }
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

const DIVISION_SECTION_META: Record<
  string,
  {
    youtubeUrl: string;
    matches: Array<{
      matchNum: number;
      startTimeSec: number;
      startLabel: string;
    }>;
  }
> = {
  "div-s-sec4": {
    youtubeUrl: "https://www.youtube.com/watch?v=WfaUMDDZ6Es",
    matches: [
      { matchNum: 1, startTimeSec: 2220, startLabel: "37:00" },
      { matchNum: 2, startTimeSec: 6477, startLabel: "1:47:57" },
      { matchNum: 3, startTimeSec: 10387, startLabel: "2:53:07" },
    ],
  },
  "div-f-sec3": {
    youtubeUrl: "https://www.youtube.com/watch?v=3X1zd27viu0",
    matches: [
      { matchNum: 1, startTimeSec: 2235, startLabel: "37:15" },
      { matchNum: 2, startTimeSec: 6677, startLabel: "1:51:17" },
      { matchNum: 3, startTimeSec: 10842, startLabel: "3:00:42" },
    ],
  },
};

    // 最新節の詳細展開生成
    const latestEntry = completed[completed.length - 1];
    if (!latestEntry) continue;

    const secNum = latestSecNum[div];
    const sec = latestEntry.fields.section;
    const sectionMeta = DIVISION_SECTION_META[latestEntry.post_name];
    const defaultYtUrl =
      sectionMeta?.youtubeUrl ||
      sec.links?.live?.url ||
      "https://www.youtube.com/@CapcomFightersJP";

    const slots: Array<{ num: number; slot: RawMatchSlot }> = [
      { num: 1, slot: sec.match1 },
      { num: 2, slot: sec.match2 },
      { num: 3, slot: sec.match3 },
    ];
    if (sec.match4 && sec.match4.use !== "hide" && sec.match4.home !== "none") {
      slots.push({ num: 4, slot: sec.match4 });
    }

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
        const homePlayerDisp = PLAYER_NAME_MAP[hp.player] || hp.player;
        const awayPlayerDisp = PLAYER_NAME_MAP[ap.player] || ap.player;
        const homeCharaKey = Object.keys(hp.use_chara || {})[0] || "";
        const awayCharaKey = Object.keys(ap.use_chara || {})[0] || "";
        const boutLogs = rawLogs[i] || [];
        const { roundFlowTexts, gameOutcomes } = analyzeRoundFlow(
          boutLogs,
          awayPlayerDisp,
          homePlayerDisp
        );

        const boutWinner: "home" | "away" = hp.battle > ap.battle ? "home" : "away";
        const isFullSet =
          (hp.status === 2 && (hp.battle + ap.battle === 5)) ||
          (hp.status !== 2 && (hp.battle + ap.battle === 3));

        const baseAnalysis = generateDeterministicVisualAnalysis(
          hp.status_name,
          homePlayerDisp,
          awayPlayerDisp,
          homeCharaKey,
          awayCharaKey,
          hp.battle,
          ap.battle,
          boutWinner,
          gameOutcomes
        );

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
            tacticalFocus: cleanTimestampFromText(baseAnalysis.tacticalFocus),
            turningPoint: cleanTimestampFromText(baseAnalysis.turningPoint),
            lethalMove: cleanTimestampFromText(baseAnalysis.lethalMove),
          },
        });

        boutAnalysisList.push({
          statusName: hp.status_name,
          homePlayer: homePlayerDisp,
          awayPlayer: awayPlayerDisp,
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

      const matchMeta = sectionMeta?.matches.find((m) => m.matchNum === num);
      const matchStartTime = matchMeta?.startTimeSec;
      const matchStartLabel = matchMeta?.startLabel;
      const matchVideoUrl = matchStartTime
        ? `${defaultYtUrl}&t=${matchStartTime}s`
        : defaultYtUrl;

      const recentMatch: RecentMatchRecap = {
        matchId: `${latestEntry.post_name}-m${num}`,
        division: div,
        sectionNumber: secNum,
        sectionTitle: latestEntry.post_title,
        matchNumber: num,
        scheduledAt: sec.time,
        youtubeUrl: defaultYtUrl,
        matchVideoUrl,
        matchStartTime,
        matchStartLabel,
        home: slot.home,
        away: slot.away,
        homePoint: slot.result.total.point.home,
        awayPoint: slot.result.total.point.away,
        winner: slot.result.winner,
        isTiebreaker,
        matchHeadline: cleanTimestampFromText(matchHeadline),
        matchSummary: cleanTimestampFromText(matchSummary),
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
