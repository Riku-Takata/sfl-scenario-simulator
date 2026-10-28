import { z } from "zod";
import { BOUT_TAG_IDS } from "../../src/lib/schema";
import type {
  BoutGameDetailView,
  BoutTag,
  BoutTagId,
  BoutVisualFacts,
  RoundFinish,
  VisualRun,
} from "../../src/lib/types";
import type { BoutContext, VideoBudget } from "./bout-video-facts";
import { budgetAllows } from "./bout-video-facts";
import type { BoutGameDetail } from "./narration";
import { callGemini, isModelExhausted, isVideoQuotaExhausted, parseJsonLoose } from "./gemini-client";

/**
 * 映像からしか分からない画面上の事実（各ラウンドの決着方法・PERFECT・バーンアウト・
 * 目立った攻防のタグ）を Bout 単位で抽出する。
 * - 公式ログとラウンド勝者の並びが完全一致したゲームだけを照合済みとして扱う
 * - 値は、照合済みの解析2回以上で一致したものだけを採用する
 */

export const VISUAL_REQUIRED_RUNS = 2;
export const VISUAL_MAX_RUNS = 3;

const FINISH_VALUES = ["SA1", "SA2", "SA3", "CA", "DI", "NORMAL", "TIME"] as const;

export const TAG_LABELS: Record<BoutTagId, string> = {
  just_parry: "ジャストパリィ",
  anti_air: "対空",
  whiff_punish: "差し返し",
  drive_impact: "ドライブインパクト",
  drive_rush: "ドライブラッシュ",
  corner: "画面端の攻め",
  throw: "投げ",
  projectile: "飛び道具",
  punish_counter: "パニッシュカウンター",
  reversal: "無敵技の切り返し",
};

export function buildVisualPrompt(ctx: BoutContext): string {
  const tagList = BOUT_TAG_IDS.map((id) => `${id}=${TAG_LABELS[id]}`).join(", ");
  return `これは ストリートファイターリーグ ${ctx.divisionLabel} ${ctx.sectionTitle} 第${ctx.matchNumber}試合 ${ctx.statusName}（BO${ctx.bestOf}、各ゲーム2ラウンド先取）の配信映像です。
選手A: ${ctx.playerA.name}（${ctx.playerA.chara}）
選手B: ${ctx.playerB.name}（${ctx.playerB.chara}）

ゲーム画面だけを見て、各ゲーム・各ラウンドの決着を記録してください。推測は禁止。見えないものは "不明"。
ゲーム間の待機画面・リプレイ・解説席カット・インタビューは無視し、リプレイのKOを二重に数えないこと。

決着方法 finish の判定基準:
- SA1 / SA2 / SA3: スーパーアーツでKO（暗転と技名演出。SAゲージ1/2/3本消費）
- CA: クリティカルアーツでKO（体力が赤く点滅した側が使う、SA3相当の暗転演出）
- DI: ドライブインパクトでKO（黒いインク状エフェクトの突進）
- NORMAL: 通常技・必殺技・投げ・削りなど上記以外でKO
- TIME: タイムアップで決着
perfect: 勝者がノーダメージで画面に "PERFECT" と表示されたら true
burnout: そのゲーム中にバーンアウト（ドライブゲージが空になり灰色表示）になった選手 "A" / "B"（いなければ空配列）
tags: Bout全体で繰り返し・決定的に見られた攻防だけを、次の語彙から選んで実行した側と共に挙げる（最大4件、確信がなければ空）: ${tagList}

JSONのみで出力:
{"games":[{"rounds":[{"winner":"A|B|不明","finish":"SA1|SA2|SA3|CA|DI|NORMAL|TIME|不明","perfect":false}],"burnout":["A"]}],"tags":[{"id":"just_parry","side":"A"}]}`;
}

const RawOutputSchema = z.object({
  games: z
    .array(
      z.object({
        rounds: z
          .array(
            z.object({
              winner: z.string(),
              finish: z.string().optional(),
              perfect: z.boolean().optional(),
            })
          )
          .default([]),
        burnout: z.array(z.string()).default([]),
      })
    )
    .default([]),
  tags: z.array(z.object({ id: z.string(), side: z.string() })).default([]),
});

const side = (v: string): "A" | "B" | null => {
  const s = v.trim().toUpperCase();
  return s.startsWith("A") ? "A" : s.startsWith("B") ? "B" : null;
};

/** モデル出力を正規化し、公式ログとラウンド勝者が完全一致するゲームを記録する。 */
export function normalizeVisualRun(
  raw: unknown,
  officialGames: BoutGameDetail[],
  model: string
): VisualRun {
  const parsed = RawOutputSchema.parse(raw);
  const games = parsed.games.map((g) => ({
    rounds: g.rounds.map((r) => {
      const finish = (r.finish || "").trim().toUpperCase();
      return {
        winner: side(r.winner) ?? ("不明" as const),
        finish: (FINISH_VALUES as readonly string[]).includes(finish)
          ? (finish as RoundFinish)
          : ("不明" as const),
        perfect: r.perfect === true,
      };
    }),
    burnout: [...new Set(g.burnout.map(side).filter((s): s is "A" | "B" => s !== null))],
  }));

  const matchedGames = officialGames
    .map((og, i) => {
      const seen = games[i]?.rounds.map((r) => r.winner) ?? [];
      const match = seen.length === og.rounds.length && seen.every((w, k) => w === og.rounds[k]);
      return match ? i : -1;
    })
    .filter((i) => i >= 0);

  const tags = parsed.tags
    .map((t) => ({ id: t.id.trim() as BoutTagId, side: side(t.side) }))
    .filter(
      (t): t is { id: BoutTagId; side: "A" | "B" } =>
        (BOUT_TAG_IDS as readonly string[]).includes(t.id) && t.side !== null
    );

  return {
    model,
    analyzedAt: new Date().toISOString(),
    games,
    tags,
    matchedGames,
  };
}

const sideToTeam = (s: "A" | "B"): "home" | "away" => (s === "A" ? "away" : "home");

/**
 * 公式ログのゲーム推移に、照合済みの解析2回以上で一致した値だけを重ねる。
 * A = AWAY、B = HOME。
 */
export function buildVerifiedGames(
  officialGames: BoutGameDetail[],
  runs: VisualRun[]
): BoutGameDetailView[] {
  return officialGames.map((og, gi) => {
    const matched = runs.filter((r) => r.matchedGames.includes(gi)).map((r) => r.games[gi]);
    const agreed = matched.length >= VISUAL_REQUIRED_RUNS;

    const rounds = og.rounds.map((w, ri) => {
      const round: BoutGameDetailView["rounds"][number] = { winner: sideToTeam(w) };
      if (!agreed) return round;
      const finishes = matched.map((g) => g.rounds[ri]?.finish);
      const finishCounts = new Map<string, number>();
      for (const f of finishes) if (f && f !== "不明") finishCounts.set(f, (finishCounts.get(f) || 0) + 1);
      const top = [...finishCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= VISUAL_REQUIRED_RUNS) round.finish = top[0] as RoundFinish;
      const perfectVotes = matched.filter((g) => g.rounds[ri]?.perfect).length;
      if (perfectVotes >= VISUAL_REQUIRED_RUNS) round.perfect = true;
      return round;
    });

    const game: BoutGameDetailView = {
      winner: sideToTeam(og.winner),
      rounds,
    };
    if (og.homeChara) game.homeChara = og.homeChara;
    if (og.awayChara) game.awayChara = og.awayChara;
    if (agreed) {
      const burnout = (["A", "B"] as const).filter(
        (s) => matched.filter((g) => g.burnout.includes(s)).length >= VISUAL_REQUIRED_RUNS
      );
      if (burnout.length > 0) game.burnout = burnout.map(sideToTeam);
    }
    return game;
  });
}

/** タグは、全ゲームが公式ログと一致した解析のうち2回以上で一致したものだけ。 */
export function buildVerifiedTags(officialGames: BoutGameDetail[], runs: VisualRun[]): BoutTag[] {
  const reliable = runs.filter((r) => r.matchedGames.length === officialGames.length);
  const counts = new Map<string, number>();
  for (const r of reliable) {
    for (const key of new Set(r.tags.map((t) => `${t.id}:${t.side}`))) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= VISUAL_REQUIRED_RUNS)
    .map(([key]) => {
      const [id, s] = key.split(":");
      return { id: id as BoutTagId, side: sideToTeam(s as "A" | "B") };
    });
}

function isSettled(facts: BoutVisualFacts, gameCount: number): boolean {
  const fullyMatched = facts.runs.filter((r) => r.matchedGames.length === gameCount).length;
  return fullyMatched >= VISUAL_REQUIRED_RUNS || facts.runs.length >= VISUAL_MAX_RUNS;
}

/** 前回と別のモデルを優先して解析を1回ずつ進め、2回の完全一致か試行上限で complete にする。 */
export async function advanceVisualAnalysis(options: {
  apiKey: string;
  models: string[];
  ctx: BoutContext;
  officialGames: BoutGameDetail[];
  facts: BoutVisualFacts;
  budget: VideoBudget;
  fps: number;
}): Promise<void> {
  const { apiKey, models, ctx, officialGames, facts, budget, fps } = options;
  const seconds = facts.endSec - facts.startSec;

  while (facts.status === "pending" && !isSettled(facts, officialGames.length)) {
    const used = new Set(facts.runs.filter((r) => r.matchedGames.length > 0).map((r) => r.model));
    const available = isVideoQuotaExhausted() ? [] : models.filter((m) => !isModelExhausted(m));
    const order = [...available.filter((m) => !used.has(m)), ...available.filter((m) => used.has(m))];
    if (order.length === 0 || !budgetAllows(budget, seconds)) return;

    console.log(`[Visual] ${ctx.boutId} ${ctx.statusName} (${facts.startSec}-${facts.endSec}s) try ${order[0]}...`);
    budget.calls += 1;
    budget.videoSeconds += seconds;
    const result = await callGemini({
      purpose: "visual",
      apiKey,
      models: order,
      prompt: buildVisualPrompt(ctx),
      video: {
        youtubeUrl: `https://www.youtube.com/watch?v=${facts.videoId}`,
        startSec: facts.startSec,
        endSec: facts.endSec,
        fps,
      },
      temperature: 0.2,
    });
    if (!result) return; // 全モデル混雑・上限。次回の実行で再開

    let run: VisualRun;
    try {
      run = normalizeVisualRun(parseJsonLoose(result.text), officialGames, result.model);
    } catch (err) {
      run = {
        model: result.model,
        analyzedAt: new Date().toISOString(),
        games: [],
        tags: [],
        matchedGames: [],
        error: (err as Error).message.slice(0, 160),
      };
    }
    facts.runs.push(run);
    console.log(
      `[Visual] ${ctx.boutId} ${run.model}: ${run.matchedGames.length}/${officialGames.length} games match official log${run.error ? ` (error: ${run.error})` : ""}`
    );
  }

  if (isSettled(facts, officialGames.length)) facts.status = "complete";
}
