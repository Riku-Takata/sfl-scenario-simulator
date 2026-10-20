import { z } from "zod";
import type { BoutVideoFacts, BoutVideoRun } from "../../src/lib/types";
import { callGemini, isModelExhausted, parseJsonLoose } from "./gemini-client";

/**
 * Bout単位の動画解析。
 * 1回の解析 = Bout区間 (公式チャプター) を fps1 で映像+実況音声ごと渡し、重要トピックだけを抽出。
 * 映像から読んだゲーム勝者が公式ログと一致した解析だけを採用し、合格した2回分が揃えば complete。
 */

export const REQUIRED_PASSED_RUNS = 2;
export const MAX_RUNS_PER_BOUT = 4;

export interface BoutContext {
  boutId: string;
  divisionLabel: string;
  sectionTitle: string;
  matchNumber: number;
  statusName: string;
  bestOf: number;
  /** 選手A = AWAY側、選手B = HOME側（UIの [AWAY - HOME] 表示順に合わせる） */
  playerA: { name: string; chara: string; team: string };
  playerB: { name: string; chara: string; team: string };
  officialGameWinners: Array<"A" | "B">;
  boutWinner: "A" | "B";
  scoreA: number;
  scoreB: number;
}

const RunOutputSchema = z.object({
  gameWinnersSeen: z.array(z.string()),
  topics: z
    .array(
      z.object({
        topic: z.string(),
        evidence: z.string(),
      })
    )
    .default([]),
});

export function buildBoutPrompt(ctx: BoutContext): string {
  const winnerName = ctx.boutWinner === "A" ? ctx.playerA.name : ctx.playerB.name;
  return `これは ストリートファイターリーグ ${ctx.divisionLabel} ${ctx.sectionTitle} 第${ctx.matchNumber}試合 ${ctx.statusName}（BO${ctx.bestOf}）の配信映像です。
選手A: ${ctx.playerA.name}（${ctx.playerA.chara}／${ctx.playerA.team}）
選手B: ${ctx.playerB.name}（${ctx.playerB.chara}／${ctx.playerB.team}）
公式結果: ${winnerName} が ${Math.max(ctx.scoreA, ctx.scoreB)}-${Math.min(ctx.scoreA, ctx.scoreB)} で勝利

ゲーム画面（HUD・演出）と実況音声の両方から、この対戦の「勝敗を分けた重要なトピック」だけを抽出してください。
ルール:
- 確実に確認できたことだけを書く。キャラクターの一般的な性能説明・推測・定型的な褒め言葉は禁止。
- 「第Nゲームは誰が勝った」だけのトピックは不要（勝敗は別途把握済み）。
- 網羅は不要。重要度の高い順に2〜4件。確信が持てなければ少なくてよい（0件も可）。
- タイムスタンプは不要。
- 各トピックに根拠を付ける: "映像" / "実況" / "両方"。
- 自己チェック: 各ゲームの勝者を映像から "A" / "B" / "不明" で答える。公式結果から推測して埋めないこと。

画面上の手がかり: 体力ゲージ直下の6本セグメント＝ドライブゲージ（空・灰色化＝バーンアウト）、"PUNISH COUNTER" "COUNTER" "REVERSAL" "PERFECT" の文字ポップ、SA/CAは暗転カットイン、ドライブインパクトは黒いインク状のエフェクト。
ゲーム間の待機画面・リプレイ・解説席カット・インタビューは無視する。

JSONのみで出力:
{"gameWinnersSeen":["A|B|不明"],"topics":[{"topic":"一文で具体的に（選手名を主語に）","evidence":"映像|実況|両方"}]}`;
}

/** 映像から読んだゲーム勝者が公式ログと矛盾しないか。不明は Bout のゲーム数の1/3まで許容。 */
export function evaluateGate(
  seen: Array<"A" | "B" | "不明">,
  official: Array<"A" | "B">
): { passed: boolean; reason: string } {
  if (seen.length !== official.length) {
    return { passed: false, reason: `game count ${seen.length} != official ${official.length}` };
  }
  const mismatches = seen.filter((w, i) => w !== "不明" && w !== official[i]).length;
  if (mismatches > 0) return { passed: false, reason: `${mismatches} game winner mismatch(es)` };
  const unknown = seen.filter((w) => w === "不明").length;
  if (unknown > Math.floor(official.length / 3)) {
    return { passed: false, reason: `${unknown} unknown game winner(s)` };
  }
  return { passed: true, reason: "game winners match official log" };
}

function normalizeWinner(w: string): "A" | "B" | "不明" {
  const v = w.trim().toUpperCase();
  if (v === "A" || v.startsWith("A")) return "A";
  if (v === "B" || v.startsWith("B")) return "B";
  return "不明";
}

function normalizeEvidence(e: string): "映像" | "実況" | "両方" {
  if (e.includes("両")) return "両方";
  if (e.includes("実況") || e.includes("音声")) return "実況";
  return "映像";
}

export function passedRuns(facts: BoutVideoFacts): BoutVideoRun[] {
  return facts.runs.filter((r) => r.gatePassed);
}

/** 合格済みの解析と別のモデルを優先し、2回の解析を独立させる。 */
export function pickModelOrder(facts: BoutVideoFacts, models: string[]): string[] {
  const usedPassed = new Set(passedRuns(facts).map((r) => r.model));
  const available = models.filter((m) => !isModelExhausted(m));
  return [
    ...available.filter((m) => !usedPassed.has(m)),
    ...available.filter((m) => usedPassed.has(m)),
  ];
}

export interface VideoBudget {
  maxCalls: number;
  maxVideoSeconds: number;
  calls: number;
  videoSeconds: number;
  /**
   * この時刻 (epoch ms) 以降は新しい動画解析を始めない。無料枠切れや 503 が続く日に
   * パイプライン全体が長時間止まらないようにするため。残りは翌日以降の実行に持ち越す。
   */
  deadlineMs?: number;
}

export function budgetAllows(budget: VideoBudget, seconds: number): boolean {
  if (budget.deadlineMs !== undefined && Date.now() >= budget.deadlineMs) return false;
  return budget.calls < budget.maxCalls && budget.videoSeconds + seconds <= budget.maxVideoSeconds;
}

/**
 * 1 Bout について、合格2回が揃うまで（予算と試行上限の範囲で）解析を進める。
 * facts は呼び出し側のキャッシュオブジェクトをそのまま更新する。
 */
export async function advanceBoutAnalysis(options: {
  apiKey: string;
  models: string[];
  ctx: BoutContext;
  facts: BoutVideoFacts;
  budget: VideoBudget;
  fps: number;
}): Promise<void> {
  const { apiKey, models, ctx, facts, budget, fps } = options;
  const youtubeUrl = `https://www.youtube.com/watch?v=${facts.videoId}`;
  const seconds = facts.endSec - facts.startSec;

  while (
    facts.status === "pending" &&
    passedRuns(facts).length < REQUIRED_PASSED_RUNS &&
    facts.runs.length < MAX_RUNS_PER_BOUT
  ) {
    const order = pickModelOrder(facts, models);
    if (order.length === 0 || !budgetAllows(budget, seconds)) return;

    console.log(
      `[Video] ${ctx.boutId} ${ctx.statusName} ${ctx.playerA.name} vs ${ctx.playerB.name} (${facts.startSec}-${facts.endSec}s) try ${order[0]}...`
    );
    budget.calls += 1;
    budget.videoSeconds += seconds;
    const result = await callGemini({
      apiKey,
      models: order,
      prompt: buildBoutPrompt(ctx),
      video: { youtubeUrl, startSec: facts.startSec, endSec: facts.endSec, fps },
    });
    if (!result) return; // 全モデル混雑・上限。次回の実行で再開する

    let run: BoutVideoRun;
    try {
      const parsed = RunOutputSchema.parse(parseJsonLoose(result.text));
      const seen = parsed.gameWinnersSeen.map(normalizeWinner);
      const gate = evaluateGate(seen, ctx.officialGameWinners);
      run = {
        model: result.model,
        analyzedAt: new Date().toISOString(),
        gameWinnersSeen: seen,
        gatePassed: gate.passed,
        gateReason: gate.reason,
        topics: parsed.topics
          .map((t) => ({ topic: t.topic.trim(), evidence: normalizeEvidence(t.evidence) }))
          .filter((t) => t.topic.length > 0),
      };
    } catch (err) {
      run = {
        model: result.model,
        analyzedAt: new Date().toISOString(),
        gameWinnersSeen: [],
        gatePassed: false,
        gateReason: `invalid output: ${(err as Error).message.slice(0, 120)}`,
        topics: [],
      };
    }
    facts.runs.push(run);
    console.log(`[Video] ${ctx.boutId} ${run.model}: gate ${run.gatePassed ? "PASS" : "FAIL"} (${run.gateReason}), ${run.topics.length} topics`);
  }

  if (passedRuns(facts).length >= REQUIRED_PASSED_RUNS) facts.status = "complete";
  else if (facts.runs.length >= MAX_RUNS_PER_BOUT) facts.status = "failed";
}
