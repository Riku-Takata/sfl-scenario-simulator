import test from "node:test";
import assert from "node:assert/strict";
import {
  capPostsPerAuthor,
  contributionsByAuthor,
  countTeam,
  engagementValue,
} from "../src/lib/fan/aggregate";
import { buildBaseline, engagementRef, purityPriorMean, type ScoreBaseline } from "../src/lib/fan/baseline";
import { bootstrapScores, confidenceInterval } from "../src/lib/fan/bootstrap";
import { assessQuality, isStale } from "../src/lib/fan/quality";
import { assignRankBands } from "../src/lib/fan/rank-band";
import {
  engagementCap,
  normalizeComponents,
  rawComponents,
  shrunkPurity,
  totalScore,
  type ScoringContext,
} from "../src/lib/fan/scoring";
import { percentileRank, quantile } from "../src/lib/fan/stats";
import { scoreWindow } from "../src/lib/fan/team-score";
import type { ClassifiedPost, SupportLabel } from "../src/lib/fan/types";

let seq = 0;
function post(
  authorKey: string,
  label: SupportLabel,
  overrides: Partial<ClassifiedPost> = {}
): ClassifiedPost {
  seq++;
  return {
    postId: `p${String(seq).padStart(5, "0")}`,
    teamKey: "cr",
    authorKey,
    createdAt: Date.UTC(2026, 9, 25) + seq * 60_000,
    label,
    supportStrength: label === "support" ? 0.8 : 0,
    reasonCode: label === "support" ? "explicit_cheering" : "not_applicable",
    engagement: null,
    engagementAgeHours: null,
    ...overrides,
  };
}

/** 応援 support 人・中立 neutral 人・判定不能 uncertain 人のチーム (1人1投稿) */
function teamPosts(
  teamKey: string,
  support: number,
  neutral: number,
  uncertain = 0,
  strength = 0.8
): ClassifiedPost[] {
  const posts: ClassifiedPost[] = [];
  for (let i = 0; i < support; i++) posts.push(post(`${teamKey}-s${i}`, "support", { teamKey, supportStrength: strength }));
  for (let i = 0; i < neutral; i++) posts.push(post(`${teamKey}-n${i}`, "neutral", { teamKey }));
  for (let i = 0; i < uncertain; i++) posts.push(post(`${teamKey}-u${i}`, "uncertain", { teamKey }));
  return posts;
}

function baselineFor(overrides: Partial<ScoreBaseline> = {}): ScoreBaseline {
  return {
    version: "test",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-28",
    volumeRaw: [1, 2, 3, 4, 5].sort((a, b) => a - b),
    intensityRaw: [0.2, 0.4, 0.6, 0.8, 1.0],
    purityPriorMean: 0.6,
    engagementRef: null,
    provisional: false,
    ...overrides,
  };
}

const NO_ENGAGEMENT: ScoringContext = { purityPriorMean: 0.6, engagementRef: null, engagementCap: null };

test("engagementValue: log(1 + likes + 2·reposts + replies + quotes)、欠損は null", () => {
  assert.equal(engagementValue({ likes: 3, reposts: 2, replies: 1, quotes: 1 }), Math.log(1 + 3 + 4 + 1 + 1));
  assert.equal(engagementValue({ likes: 3, reposts: null, replies: 1, quotes: 1 }), null);
  assert.equal(engagementValue(null), null);
});

test("capPostsPerAuthor: 著者ごとに強度の高い順で3件まで、unrelated は除く", () => {
  const posts = [
    post("a", "support", { supportStrength: 0.2 }),
    post("a", "support", { supportStrength: 0.9 }),
    post("a", "neutral"),
    post("a", "support", { supportStrength: 0.5 }),
    post("a", "support", { supportStrength: 0.7 }),
    post("b", "unrelated"),
    post("b", "criticism"),
  ];
  const kept = capPostsPerAuthor(posts);
  const a = kept.filter((p) => p.authorKey === "a").map((p) => p.supportStrength);
  assert.deepEqual(a, [0.9, 0.7, 0.5]);
  assert.deepEqual(
    kept.filter((p) => p.authorKey === "b").map((p) => p.label),
    ["criticism"]
  );
  // 入力順に依存しない
  assert.deepEqual(
    capPostsPerAuthor([...posts].reverse()).map((p) => p.postId).sort(),
    kept.map((p) => p.postId).sort()
  );
});

test("contributionsByAuthor / countTeam: 件数・ユニーク応援者・使えるエンゲージメントだけを集める", () => {
  const counts = { likes: 10, reposts: 0, replies: 0, quotes: 0 };
  const authors = contributionsByAuthor([
    post("a", "support", { engagement: counts, engagementAgeHours: 24 }),
    post("a", "support", { engagement: counts, engagementAgeHours: 2 }), // 観測が早すぎる
    post("b", "support", { engagement: { ...counts, quotes: null }, engagementAgeHours: 24 }), // 欠損
    post("c", "neutral", { engagement: counts, engagementAgeHours: 24 }), // 応援以外は使わない
    post("d", "criticism"),
    post("e", "uncertain"),
  ]);
  assert.deepEqual(
    authors.map((a) => [a.authorKey, a.engagements.length]),
    [["a", 1], ["b", 0], ["c", 0], ["d", 0], ["e", 0]]
  );
  assert.deepEqual(countTeam(authors), {
    relevant: 5,
    support: 3,
    neutral: 1,
    criticism: 1,
    uncertain: 1,
    uniqueSupporters: 2,
  });
});

test("shrunkPurity: 関連投稿0件なら事前平均、件数が増えると生の比率に近づく", () => {
  assert.equal(shrunkPurity(0, 0, 0.6), 0.6);
  assert.equal(shrunkPurity(5, 10, 0.6), (5 + 12) / (10 + 20));
  assert.ok(Math.abs(shrunkPurity(900, 1000, 0.6) - 0.9) < 0.01);
});

test("percentileRank: 同値は半分ずつ、範囲外は 0 / 100、空の基準は例外", () => {
  const base = [1, 2, 2, 3];
  assert.equal(percentileRank(0, base), 0);
  assert.equal(percentileRank(2, base), ((1 + 1) / 4) * 100);
  assert.equal(percentileRank(10, base), 100);
  assert.throws(() => percentileRank(1, []));
  assert.equal(quantile([3, 1, 2], 0.5), 2);
});

test("rawComponents: T はエンゲージメントの有無で式が切り替わる", () => {
  const authors = contributionsByAuthor([
    post("a", "support", { supportStrength: 1.0 }),
    post("b", "support", { supportStrength: 0.5 }),
    post("c", "neutral"),
  ]);
  const plain = rawComponents(authors, NO_ENGAGEMENT);
  assert.equal(plain.volumeRaw, Math.log(3));
  assert.equal(plain.intensityRaw, 0.75);
  assert.equal(plain.purityRaw, 2 / 3);
  assert.equal(plain.engagementAvailable, false);

  // 基準がエンゲージメントを使うが、このチームには使える値が無い → e の項は 1 (基準の中央値)
  const noValues = rawComponents(authors, { ...NO_ENGAGEMENT, engagementRef: 2 });
  assert.equal(noValues.intensityRaw, 0.6 * 0.75 + 0.4 * 1);
  assert.equal(noValues.engagementAvailable, false);
});

test("rawComponents: e は集計窓の上限で winsorize してから E_ref で割る", () => {
  const big = { likes: 1000, reposts: 0, replies: 0, quotes: 0 };
  const authors = contributionsByAuthor([
    post("a", "support", { supportStrength: 1, engagement: big, engagementAgeHours: 24 }),
  ]);
  const cap = 2;
  const raw = rawComponents(authors, { purityPriorMean: 0.6, engagementRef: 1, engagementCap: cap });
  assert.equal(raw.intensityRaw, 0.6 * 1 + 0.4 * cap);
  assert.equal(raw.engagementAvailable, true);
  assert.equal(engagementCap([authors]), Math.log(1001));
});

test("totalScore: S は寄与の合計で、重みは 0.40 / 0.35 / 0.25", () => {
  const { score, contribution } = totalScore({ volume: 80, intensity: 60, purity: 40 });
  assert.equal(contribution.volume, 32);
  assert.equal(contribution.intensity, 21);
  assert.equal(contribution.purity, 10);
  assert.equal(score, contribution.volume + contribution.intensity + contribution.purity);
});

test("buildBaseline: p̄・E_ref・暫定フラグ、空の基準は例外", () => {
  const baseline = buildBaseline({
    version: "b2026-10",
    periodStart: "2026-10-20",
    periodEnd: "2026-10-29",
    days: 10,
    entries: [
      { volumeRaw: 3, intensityRaw: 0.7, relevant: 100, support: 70 },
      { volumeRaw: 1, intensityRaw: 0.5, relevant: 50, support: 20 },
    ],
    engagementRef: engagementRef([1, 3, 2]),
  });
  assert.deepEqual(baseline.volumeRaw, [1, 3]);
  assert.equal(baseline.purityPriorMean, 90 / 150);
  assert.equal(baseline.engagementRef, 2);
  assert.equal(baseline.provisional, true);
  assert.equal(purityPriorMean([]), 0.5);
  assert.equal(engagementRef([]), null);
  assert.throws(() =>
    buildBaseline({ version: "x", periodStart: "", periodEnd: "", days: 28, entries: [], engagementRef: null })
  );
});

test("bootstrapScores: 同じシードなら同じ結果、信頼区間は点推定を含む", () => {
  const authors = contributionsByAuthor([...teamPosts("cr", 60, 30), ...teamPosts("cr", 0, 0, 5)]);
  const baseline = baselineFor();
  const point = totalScore(normalizeComponents(rawComponents(authors, NO_ENGAGEMENT), baseline)).score;
  const a = bootstrapScores(authors, NO_ENGAGEMENT, baseline, { seed: 42, iterations: 300 });
  const b = bootstrapScores(authors, NO_ENGAGEMENT, baseline, { seed: 42, iterations: 300 });
  const c = bootstrapScores(authors, NO_ENGAGEMENT, baseline, { seed: 43, iterations: 300 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const ci = confidenceInterval(a)!;
  assert.ok(ci[0] <= point && point <= ci[1], `${ci} が ${point} を含まない`);
  assert.deepEqual(bootstrapScores([], NO_ENGAGEMENT, baseline, { seed: 1 }), []);
  assert.equal(confidenceInterval([]), null);
});

test("assignRankBands: 帯の先頭チームと信頼区間が重なる間だけ同じ帯", () => {
  const ranks = assignRankBands([
    { teamKey: "c", score: 74, ci: [70, 79] }, // b とは重なるが a とは重ならない
    { teamKey: "a", score: 85, ci: [80, 90] },
    { teamKey: "b", score: 80, ci: [75, 85] },
    { teamKey: "d", score: 50, ci: [40, 60] },
  ]);
  assert.deepEqual(
    ranks.map((r) => [r.teamKey, r.rank, r.bandLabel]),
    [
      ["a", 1, "1–2位"],
      ["b", 2, "1–2位"],
      ["c", 3, "3位"],
      ["d", 4, "4位"],
    ]
  );
});

test("assessQuality: insufficient > limited > reference > sufficient", () => {
  const base = { relevant: 100, uncertain: 0, classificationFailures: 0, truncated: false, baselineProvisional: false };
  assert.equal(assessQuality(base), "sufficient");
  assert.equal(assessQuality({ ...base, relevant: 9, truncated: true }), "insufficient");
  assert.equal(assessQuality({ ...base, truncated: true }), "limited");
  // (判定不能 + 分類失敗) / 全体 = 50 / 150 > 0.3
  assert.equal(assessQuality({ ...base, uncertain: 30, classificationFailures: 20 }), "limited");
  assert.equal(assessQuality({ ...base, relevant: 49 }), "reference");
  assert.equal(assessQuality({ ...base, baselineProvisional: true }), "reference");
});

test("isStale: 最終更新から36時間以上", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  assert.equal(isStale("2026-10-29T00:00:01Z", now), false);
  assert.equal(isStale("2026-10-29T00:00:00Z", now), true);
});

test("scoreWindow: データ不足のチームはスコアなし、他は順位と信頼区間付き、結果は決定的", () => {
  const input = {
    windowKey: "7d:2026-10-30",
    baseline: baselineFor(),
    iterations: 200,
    teams: [
      { teamKey: "cr", posts: teamPosts("cr", 120, 30), truncated: false, classificationFailures: 0 },
      { teamKey: "zeta", posts: teamPosts("zeta", 20, 20, 2, 0.5), truncated: false, classificationFailures: 0 },
      { teamKey: "ibsg", posts: teamPosts("ibsg", 4, 3), truncated: false, classificationFailures: 0 },
    ],
  };
  const first = scoreWindow(input);
  assert.deepEqual(scoreWindow(input), first);

  const [cr, zeta, ibsg] = first;
  assert.equal(cr.quality, "sufficient");
  assert.equal(zeta.quality, "reference");
  assert.equal(ibsg.quality, "insufficient");
  assert.equal(ibsg.score, null);
  assert.equal(ibsg.rank, null);
  assert.deepEqual(ibsg.counts.relevant, 7);

  assert.ok(cr.score! > zeta.score!);
  assert.equal(cr.rank, 1);
  assert.equal(zeta.rank, 2);
  assert.equal(cr.rankBand, "1位");
  const sum = cr.contribution!.volume + cr.contribution!.intensity + cr.contribution!.purity;
  assert.ok(Math.abs(sum - cr.score!) < 1e-9);
  assert.equal(cr.components!.purityRaw, 120 / 150);
});
