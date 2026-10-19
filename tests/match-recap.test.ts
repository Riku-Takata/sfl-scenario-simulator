import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  findBoutWindow,
  findMatchStartSec,
  parseChaptersFromDescription,
} from "../scripts/recap/youtube-chapters";
import { evaluateGate, type BoutContext } from "../scripts/recap/bout-video-facts";
import {
  buildOfficialDataAnalysis,
  contradictsOfficialRounds,
  isVacuousKeyPoint,
  dedupeAnalyses,
} from "../scripts/recap/narration";
import { toGameDetails } from "../scripts/4-generate-match-recaps";
import { MatchRecapsDataSchema } from "../src/lib/schema";

const DESCRIPTION = `▼タイムスタンプ
00:00 配信開始
37:00 TEAM MATCH 1 選手入場
43:52 TEAM MATCH 1 先鋒戦
54:49 中堅戦ホーム側オーダー発表
58:06 TEAM MATCH 1 中堅戦
1:09:52 大将戦ホーム側オーダー発表
1:13:19 TEAM MATCH 1 大将戦
1:28:31 勝利チームインタビュー
2:27:24 TEAM MATCH 2 延長戦
2:33:15 勝利チームインタビュー`;

function ctx(overrides: Partial<BoutContext> = {}): BoutContext {
  return {
    boutId: "div-s-sec4-m1-b0",
    divisionLabel: "Division S",
    sectionTitle: "第4節",
    matchNumber: 1,
    statusName: "先鋒戦",
    bestOf: 3,
    playerA: { name: "ACQUA", chara: "ブランカ", team: "広島 TEAM iXA" },
    playerB: { name: "2BASSA", chara: "ジュリ", team: "FUKUSHIMA IBUSHIGIN" },
    officialGameWinners: ["A", "B", "A"],
    boutWinner: "A",
    scoreA: 2,
    scoreB: 1,
    ...overrides,
  };
}

test("YouTube description chapters give bout windows bounded by the next chapter", () => {
  const chapters = parseChaptersFromDescription(DESCRIPTION);
  assert.equal(chapters.length, 10);
  assert.deepEqual(findBoutWindow(chapters, 1, 0), { startSec: 2632, endSec: 3289 });
  assert.deepEqual(findBoutWindow(chapters, 1, 2), { startSec: 4399, endSec: 5311 });
  assert.deepEqual(findBoutWindow(chapters, 2, 3), { startSec: 8844, endSec: 9195 });
  assert.equal(findBoutWindow(chapters, 3, 0), null);
  assert.equal(findMatchStartSec(chapters, 1), 2220);
});

test("gate accepts only game winners consistent with the official log", () => {
  assert.equal(evaluateGate(["A", "B", "A"], ["A", "B", "A"]).passed, true);
  assert.equal(evaluateGate(["A", "不明", "A"], ["A", "B", "A"]).passed, true);
  // 第1・第2ゲームの取り違え（実際に lite モデルで起きた誤り）
  assert.equal(evaluateGate(["B", "A", "A"], ["A", "B", "A"]).passed, false);
  // BO5 を3ゲームと誤認
  assert.equal(evaluateGate(["B", "A", "B"], ["B", "A", "A", "B", "B"]).passed, false);
  assert.equal(evaluateGate(["不明", "不明", "A"], ["A", "B", "A"]).passed, false);
});

test("official round log maps 1P to HOME (B) and 2P to AWAY (A)", () => {
  const games = toGameDetails([
    { "1p_character": "juri", "1p_mode": "", "2p_character": "blanka", "2p_mode": "", r1: "2", r2: "2", r3: "", status: 0, status_name: "" },
    { "1p_character": "juri", "1p_mode": "", "2p_character": "blanka", "2p_mode": "", r1: "2", r2: "1", r3: "1", status: 0, status_name: "" },
  ]);
  assert.deepEqual(games, [
    { winner: "A", rounds: ["A", "A"] },
    { winner: "B", rounds: ["A", "B", "B"] },
  ]);
});

test("official-data fallback states only log-backed facts and differs per bout", () => {
  const a = buildOfficialDataAnalysis({
    ctx: ctx(),
    games: [
      { winner: "A", rounds: ["A", "A"] },
      { winner: "B", rounds: ["A", "B", "B"] },
      { winner: "A", rounds: ["B", "A", "A"] },
    ],
  });
  const b = buildOfficialDataAnalysis({
    ctx: ctx({
      boutId: "div-s-sec4-m1-b1",
      statusName: "中堅戦",
      playerA: { name: "AKIRA", chara: "キャミィ", team: "広島 TEAM iXA" },
      playerB: { name: "やない", chara: "サガット", team: "FUKUSHIMA IBUSHIGIN" },
      officialGameWinners: ["A", "B", "B"],
      boutWinner: "B",
      scoreA: 1,
      scoreB: 2,
    }),
    games: [
      { winner: "A", rounds: ["A", "A"] },
      { winner: "B", rounds: ["B", "A", "B"] },
      { winner: "B", rounds: ["B", "A", "B"] },
    ],
  });
  assert.equal(a.source, "official-data");
  assert.match(a.summary, /ACQUA選手（ブランカ）が2BASSA選手（ジュリ）を2-1/);
  assert.ok(a.keyPoints.some((k) => k.includes("第3ゲームはACQUA選手が1ラウンド目を落としてから逆転")));
  assert.ok(b.keyPoints.some((k) => k.includes("先取されてからの逆転勝利")));
  const shared = a.keyPoints.filter((k) => b.keyPoints.includes(k));
  assert.deepEqual(shared, []);
  // 旧テンプレートの創作表現を含まない
  for (const text of [a.summary, ...a.keyPoints, b.summary, ...b.keyPoints]) {
    assert.doesNotMatch(text, /対空SA|シミー|劇的KO|ミリ単位/);
  }
});

test("comeback/straight claims are checked against the official round log", () => {
  // Div S 第4節 第2試合 大将戦 Shuto 3-0: 公式ログ HAA / AHA / AHA (A=Shuto)
  const shuto = [
    { winner: "A" as const, rounds: ["B", "A", "A"] as Array<"A" | "B"> },
    { winner: "A" as const, rounds: ["A", "B", "A"] as Array<"A" | "B"> },
    { winner: "A" as const, rounds: ["A", "B", "A"] as Array<"A" | "B"> },
  ];
  assert.equal(contradictsOfficialRounds("Shutoが最終ゲームで逆転勝利した。", shuto), true);
  assert.equal(contradictsOfficialRounds("Shutoは第1ゲームを逆転で取った。", shuto), false);
  assert.equal(contradictsOfficialRounds("Shutoが第2ゲームをストレートで取った。", shuto), true);
  assert.equal(contradictsOfficialRounds("第4ゲームでShutoがCAを決めた。", shuto), true);
  assert.equal(contradictsOfficialRounds("Shutoが昇龍拳で対空を決めた。", shuto), false);
  // 1ラウンドも落とさないBoutで「逆転」は不可
  const sweep = [
    { winner: "A" as const, rounds: ["A", "A"] as Array<"A" | "B"> },
    { winner: "A" as const, rounds: ["A", "A"] as Array<"A" | "B"> },
  ];
  assert.equal(contradictsOfficialRounds("どぐらが逆転のコンボを決めた。", sweep), true);
});

test("dedupeAnalyses removes repeated key points across bouts", () => {
  const list = [
    { source: "gemini-video" as const, summary: "s1", keyPoints: ["同じ文", "固有A"] },
    { source: "gemini-video" as const, summary: "s2", keyPoints: ["同じ 文", "固有B"] },
  ];
  dedupeAnalyses(list);
  assert.deepEqual(list[0].keyPoints, ["同じ文", "固有A"]);
  assert.deepEqual(list[1].keyPoints, ["固有B"]);
});

test("generated match recaps never reuse the same sentence across bouts", () => {
  const data = MatchRecapsDataSchema.parse(
    JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "src/data/match-recaps.json"), "utf8"))
  );
  const counts = new Map<string, number>();
  for (const div of ["s", "f"] as const) {
    for (const m of data.recentSections[div]) {
      for (const b of m.bouts) {
        for (const text of [b.analysis.summary, ...b.analysis.keyPoints]) {
          counts.set(text, (counts.get(text) || 0) + 1);
        }
      }
    }
  }
  const repeated = [...counts.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(repeated, []);
});

test("vacuous key points that only restate the matchup are dropped", () => {
  assert.equal(isVacuousKeyPoint("ヤマグチとテリーの対戦となった。"), true);
  assert.equal(isVacuousKeyPoint("ひぐちが勝利した。"), true);
  assert.equal(isVacuousKeyPoint("ACQUAはジャストパリィを成功させて主導権を維持した。"), false);
});
