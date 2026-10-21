import crypto from "node:crypto";
import { z } from "zod";
import type { BoutVideoFacts, MatchNarrative, RecentBoutAnalysis } from "../../src/lib/types";
import type { BoutContext } from "./bout-video-facts";
import { passedRuns } from "./bout-video-facts";
import { callGemini, parseJsonLoose } from "./gemini-client";

export interface BoutGameDetail {
  winner: "A" | "B";
  rounds: Array<"A" | "B">;
  homeChara?: string;
  awayChara?: string;
}

export interface NarrationBoutInput {
  ctx: BoutContext;
  games: BoutGameDetail[];
  facts?: BoutVideoFacts;
}

export interface NarrationMatchInput {
  matchId: string;
  awayTeam: string;
  homeTeam: string;
  awayPoint: number;
  homePoint: number;
  winnerTeam: string;
  isTiebreaker: boolean;
  bouts: NarrationBoutInput[];
}

/* ------------------------------------------------------------------ */
/* 公式ログのみのフォールバック（推測を含めない）                         */
/* ------------------------------------------------------------------ */

function nameOf(ctx: BoutContext, side: "A" | "B"): string {
  return side === "A" ? ctx.playerA.name : ctx.playerB.name;
}

export function buildOfficialDataAnalysis(input: NarrationBoutInput): RecentBoutAnalysis {
  const { ctx, games } = input;
  const w = ctx.boutWinner;
  const l = w === "A" ? "B" : "A";
  const winner = w === "A" ? ctx.playerA : ctx.playerB;
  const loser = l === "A" ? ctx.playerA : ctx.playerB;
  const winScore = Math.max(ctx.scoreA, ctx.scoreB);
  const loseScore = Math.min(ctx.scoreA, ctx.scoreB);

  const summary = `${winner.name}選手（${winner.chara}）が${loser.name}選手（${loser.chara}）を${winScore}-${loseScore}で下した。`;
  const keyPoints: string[] = [];

  if (games.length > 0) {
    const flow = games
      .map((g, i) => `第${i + 1}ゲーム${nameOf(ctx, g.winner)}`)
      .join("→");
    keyPoints.push(`ゲーム推移: ${flow}`);
  }

  if (loseScore === 0) {
    const straight = games.every((g) => g.rounds.length === 2);
    keyPoints.push(
      straight
        ? `${winner.name}選手が1ラウンドも落とさず全ゲームをストレートで取り切った。`
        : `${winner.name}選手がゲームを1つも落とさずに勝利した。`
    );
  } else if (games.length > 0 && games[0].winner === l) {
    keyPoints.push(`第1ゲームを${loser.name}選手に先取されてからの逆転勝利。`);
  } else if (winScore + loseScore === ctx.bestOf) {
    keyPoints.push(`最終ゲームまでもつれたフルセットを${winner.name}選手が制した。`);
  }

  const comebacks = games
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => g.rounds.length === 3 && g.rounds[0] !== g.winner);
  if (comebacks.length > 0) {
    const desc = comebacks
      .map(({ g, i }) => `第${i + 1}ゲームは${nameOf(ctx, g.winner)}選手が1ラウンド目を落としてから逆転`)
      .join("、");
    keyPoints.push(`${desc}。`);
  }

  return { source: "official-data", summary, keyPoints };
}

/* ------------------------------------------------------------------ */
/* 動画解析結果からの解説生成（テキストのみのLLM呼び出し）                */
/* ------------------------------------------------------------------ */

const NarrationOutputSchema = z.object({
  matchHeadline: z.string(),
  matchSummary: z.string(),
  bouts: z.array(
    z.object({
      boutId: z.string(),
      summary: z.string(),
      keyPoints: z
        .array(z.object({ text: z.string(), supportedBy: z.array(z.string()) }))
        .default([]),
    })
  ),
});

function boutPayload(b: NarrationBoutInput) {
  const runs = b.facts && b.facts.status === "complete" ? passedRuns(b.facts).slice(0, 2) : [];
  return {
    boutId: b.ctx.boutId,
    bout: b.ctx.statusName,
    playerA: b.ctx.playerA,
    playerB: b.ctx.playerB,
    officialResult: `${nameOf(b.ctx, b.ctx.boutWinner)} が ${Math.max(b.ctx.scoreA, b.ctx.scoreB)}-${Math.min(b.ctx.scoreA, b.ctx.scoreB)} で勝利`,
    gameWinners: b.games.map((g) => nameOf(b.ctx, g.winner)),
    // 公式ラウンド推移（例: 第1ゲーム: Shuto→藤村→Shuto）。逆転・ストレート等の記述はこれと矛盾してはならない
    officialRounds: b.games.map(
      (g, i) => `第${i + 1}ゲーム: ${g.rounds.map((r) => nameOf(b.ctx, r)).join("→")}`
    ),
    videoAnalysis:
      runs.length === 2
        ? { run1: runs[0].topics, run2: runs[1].topics }
        : "なし（公式結果のみ使用。展開を創作しないこと）",
  };
}

export function narrationInputHash(match: NarrationMatchInput): string {
  const payload = JSON.stringify({ v: 3, m: match.matchId, b: match.bouts.map(boutPayload) });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function buildNarrationPrompt(match: NarrationMatchInput): string {
  return `あなたはストリートファイターリーグの試合レポートの編集者です。以下の確定情報だけを使い、チーム戦1試合分の振り返りを書いてください。

【試合】${match.awayTeam}（AWAY）vs ${match.homeTeam}（HOME）→ ${match.awayPoint}-${match.homePoint} で ${match.winnerTeam} の勝利${match.isTiebreaker ? "（延長戦で決着）" : ""}

【Bout情報】各Boutの videoAnalysis.run1 / run2 は、同じ映像を独立に2回解析した観測結果です。
${JSON.stringify(match.bouts.map(boutPayload), null, 1)}

ルール:
- keyPoints には run1 と run2 の両方で裏付けられた事実だけを書く（表現が違っても同じ出来事を指していれば一致とみなす）。片方にしか無い内容・観測に無い内容は書かない。
- 1つの keyPoint には両方のrunに共通する部分だけを書く。片方のrunにしか無い細部（技名・ゲーム番号・決着方法など）は付け足さず削る。2つのrunの記述を足し合わせて1文にしてはいけない。
- officialRounds（公式ラウンド推移）と矛盾する記述は禁止。特に「逆転」「ストレート」「フルセット」「第Nゲーム」は officialRounds で確認できる場合だけ書く。
- 各 keyPoint の supportedBy に裏付けたrunを ["run1","run2"] のように列挙する。
- 具体的な出来事（技名・システム名・状況）を含まない要点は書かない。「対戦となった」「攻防を制した」「要所で技を当てた」のような中身の無い文を入れるくらいなら keyPoints を減らす（0件も可）。
- 動画解析が「なし」のBoutは keyPoints を空にし、summary は公式結果だけで1文。
- 一般論、キャラ性能の説明、「圧巻」「劇的」など根拠のない誇張、他のBoutと同じ言い回しの使い回しは禁止。
- summary は1〜2文、keyPoints は最大3件、各1文。
- matchHeadline は30文字以内。matchSummary は試合の流れ（先鋒から大将/延長への転換）と勝敗を分けた確認済みの出来事をつなぎ、180〜350字を目安にする。材料が足りない場合は無理に水増しせず、公式記録だけの短い速報にする。

JSONのみで出力:
{"matchHeadline":"","matchSummary":"","bouts":[{"boutId":"","summary":"","keyPoints":[{"text":"","supportedBy":["run1","run2"]}]}]}`;
}

/** 対戦カードの言い直しなど、事実を何も含まない要点を除く。 */
export function isVacuousKeyPoint(text: string): boolean {
  return (
    /対戦(と|に)なった|対戦が行われた|対戦した。?$/.test(text) ||
    /^(.{0,20})(が|は)(勝利|攻防を制)した。?$/.test(text)
  );
}

/**
 * 「逆転」「ストレート」の記述を公式ラウンド推移と照合する。
 * ゲーム番号（第N/最終/最後）が書かれていればそのゲーム、無ければBout全体で判定。
 */
export function contradictsOfficialRounds(text: string, games: BoutGameDetail[]): boolean {
  if (games.length === 0) return false;
  const isComeback = (g: BoutGameDetail) => g.rounds.length === 3 && g.rounds[0] !== g.winner;
  const isStraight = (g: BoutGameDetail) => g.rounds.length === 2;

  const targets: BoutGameDetail[] = [];
  for (const m of text.matchAll(/第\s*(\d)\s*(?:ゲーム|セット)/g)) {
    const g = games[Number(m[1]) - 1];
    if (!g) return true; // 存在しないゲーム番号
    targets.push(g);
  }
  if (/(最終|最後の)\s*(?:ゲーム|セット)/.test(text)) targets.push(games[games.length - 1]);

  // 「逆転」は、ゲーム内のラウンド逆転か、第1ゲームを落としてからのBout逆転のどちらかなら許容
  const boutComeback = games.length > 1 && games[0].winner !== games[games.length - 1].winner;
  if (/逆転/.test(text)) {
    if (targets.length > 0 ? !targets.some(isComeback) : !(games.some(isComeback) || boutComeback)) {
      return true;
    }
  }
  if (/ストレート/.test(text) && targets.length > 0 && !targets.every(isStraight)) return true;
  return false;
}

export async function generateMatchNarrative(options: {
  apiKey: string;
  models: string[];
  match: NarrationMatchInput;
}): Promise<MatchNarrative | null> {
  const { apiKey, models, match } = options;
  const result = await callGemini({
    apiKey,
    models,
    prompt: buildNarrationPrompt(match),
    temperature: 0.4,
  });
  if (!result) return null;

  try {
    const parsed = NarrationOutputSchema.parse(parseJsonLoose(result.text));
    return {
      inputHash: narrationInputHash(match),
      model: result.model,
      generatedAt: new Date().toISOString(),
      matchHeadline: parsed.matchHeadline.trim(),
      matchSummary: parsed.matchSummary.trim(),
      bouts: parsed.bouts.map((b) => {
        const games = match.bouts.find((x) => x.ctx.boutId === b.boutId)?.games ?? [];
        return {
          boutId: b.boutId,
          summary: contradictsOfficialRounds(b.summary, games) ? "" : b.summary.trim(),
          // 2回の解析の両方に裏付けられ、公式ラウンド推移と矛盾しないものだけ残す
          keyPoints: b.keyPoints
            .filter((k) => k.supportedBy.includes("run1") && k.supportedBy.includes("run2"))
            .map((k) => k.text.trim())
            .filter((k) => k.length > 0 && !isVacuousKeyPoint(k) && !contradictsOfficialRounds(k, games)),
        };
      }),
    };
  } catch (err) {
    console.warn(`[Narration] invalid output from ${result.model}: ${(err as Error).message.slice(0, 160)}`);
    return null;
  }
}

/** 同一テキストの使い回しを除去する（節内で先に出たものを残す）。 */
export function dedupeAnalyses(analyses: RecentBoutAnalysis[]): void {
  const seen = new Set<string>();
  for (const a of analyses) {
    a.keyPoints = a.keyPoints.filter((k) => {
      const key = k.replace(/\s/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
