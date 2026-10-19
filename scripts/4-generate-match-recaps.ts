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

const DIVISION_S_SEC4_CONFIG = {
  youtubeUrl: "https://www.youtube.com/watch?v=WfaUMDDZ6Es",
  matches: [
    {
      matchNum: 1, // iXA vs IBSG
      clippingWindow: { start: 4750, end: 5260 }, // 大将戦 torimeshi vs hibiki 最終局面〜大逆転KO決着
      bouts: [
        { status: 0, startSec: 2632, label: "先鋒戦" }, // 43:52
        { status: 1, startSec: 3486, label: "中堅戦" }, // 58:06
        { status: 2, startSec: 4399, label: "大将戦" }, // 1:13:19
      ],
    },
    {
      matchNum: 2, // FAV vs CR
      clippingWindow: { start: 8400, end: 9150 }, // 大将戦終盤〜延長戦 dogura vs sako 決着
      bouts: [
        { status: 0, startSec: 6887, label: "先鋒戦" }, // 1:54:47
        { status: 1, startSec: 7470, label: "中堅戦" }, // 2:04:30
        { status: 2, startSec: 8110, label: "大将戦" }, // 2:15:10
        { status: 3, startSec: 8844, label: "延長戦" }, // 2:27:24
      ],
    },
    {
      matchNum: 3, // SOL vs ZETA
      clippingWindow: { start: 12600, end: 13260 }, // 大将戦 mago vs tachikawa 決着
      bouts: [
        { status: 0, startSec: 10812, label: "先鋒戦" }, // 3:00:12
        { status: 1, startSec: 11596, label: "中堅戦" }, // 3:13:16
        { status: 2, startSec: 12364, label: "大将戦" }, // 3:26:04
      ],
    },
  ],
};

    // 最新節の詳細展開生成
    const latestEntry = completed[completed.length - 1];
    if (!latestEntry) continue;

    const secNum = latestSecNum[div];
    const sec = latestEntry.fields.section;
    let defaultYtUrl =
      sec.links?.live?.url ||
      (div === "s" && secNum === 4
        ? DIVISION_S_SEC4_CONFIG.youtubeUrl
        : "https://www.youtube.com/@CapcomFightersJP");

    if (div === "s" && secNum === 4) {
      defaultYtUrl = DIVISION_S_SEC4_CONFIG.youtubeUrl;
    }

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

        let boutStartSec = 1800;
        let boutHighlightTitle = baseAnalysis.headline;
        let boutHighlightDesc = baseAnalysis.lethalMove;

        if (div === "s" && secNum === 4) {
          const s4MatchConfig = DIVISION_S_SEC4_CONFIG.matches.find((m) => m.matchNum === num);
          const s4BoutConfig = s4MatchConfig?.bouts.find((b) => b.status === hp.status);
          if (s4BoutConfig) {
            boutStartSec = s4BoutConfig.startSec;
            boutHighlightTitle = `${s4BoutConfig.label} 名場面 (${formatSecondsToTimestamp(boutStartSec)})`;
          }
        }

        const highlightMoment: VideoHighlightMoment = {
          timestampSeconds: boutStartSec,
          timestampLabel: formatSecondsToTimestamp(boutStartSec),
          title: boutHighlightTitle,
          description: boutHighlightDesc,
          videoUrlWithTime: `${defaultYtUrl}&t=${boutStartSec}s`,
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

      let matchHighlightSec = bouts[bouts.length - 1]?.highlight?.timestampSeconds || 1800;
      let matchHighlightTitle = matchHeadline;
      let matchHighlightDesc = matchSummary;

      // Gemini Video API による動画理解（キーがあり、有効な動画URLの場合のみ実行）
      if (apiKey && isValidYoutubeVideoUrl(defaultYtUrl)) {
        let timeWindow = { start: 1800, end: 2400 };
        if (div === "s" && secNum === 4) {
          const s4MatchConfig = DIVISION_S_SEC4_CONFIG.matches.find((m) => m.matchNum === num);
          if (s4MatchConfig) {
            timeWindow = s4MatchConfig.clippingWindow;
          }
        }

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

          const vo = geminiResult.videoObservations;
          const koSec = vo.koTimestampSec || timeWindow.start;
          const koLabel = vo.koTimestampLabel || formatSecondsToTimestamp(koSec);

          // 決定打Bout（延長戦があれば延長戦、なければ大将戦）に深層映像解析結果を反映
          const decisiveBout =
            bouts.find((b) => b.status === 3) || bouts.find((b) => b.status === 2);

          if (decisiveBout) {
            decisiveBout.visualAnalysis.tacticalFocus = `${vo.pokesAndFootsies} ${vo.driveAndBurnout}`;
            decisiveBout.visualAnalysis.turningPoint = `${vo.jumpAndAntiAir} ${vo.cornerAndShimmy}`;
            decisiveBout.visualAnalysis.lethalMove = vo.finalLethalMove;
            decisiveBout.highlight = {
              timestampSeconds: koSec,
              timestampLabel: koLabel,
              title: `${decisiveBout.statusName} 決着の瞬間 (${koLabel})`,
              description: vo.finalLethalMove,
              videoUrlWithTime: `${defaultYtUrl}&t=${koSec}s`,
            };
          }

          matchHighlightSec = koSec;
          matchHighlightTitle = `${matchWinnerTeam} 劇的決着の瞬間 (${koLabel})`;
          matchHighlightDesc = vo.finalLethalMove;
        }

        // TPM (250,000) レートリミット保護のため、次マッチリクエスト前に15秒待機
        if (num < slots.length) {
          console.log(`[Gemini API Protection] Waiting 15s before processing next match...`);
          await new Promise((resolve) => setTimeout(resolve, 15000));
        }
      }

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
          title: matchHighlightTitle,
          description: matchHighlightDesc,
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
