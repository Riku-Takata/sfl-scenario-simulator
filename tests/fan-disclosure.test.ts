import test from "node:test";
import assert from "node:assert/strict";
import { applyDisclosure, discloseTeamCounts, roundToTens } from "../src/lib/fan/disclosure";

test("applyDisclosure: 10 未満 (0 を含む) を抑制する", () => {
  const { values, suppressed } = applyDisclosure({ a: 9, b: 10, c: 0 }, []);
  assert.deepEqual(values, { a: null, b: 10, c: null });
  assert.deepEqual(suppressed, ["a", "c"]);
});

test("applyDisclosure: 抑制が1つだけのグループは、次に小さいセルも抑制する", () => {
  const { values, suppressed } = applyDisclosure(
    { total: 100, s: 70, n: 25, c: 5 },
    [{ total: "total", parts: ["s", "n", "c"] }]
  );
  assert.deepEqual(values, { total: 100, s: 70, n: null, c: null });
  assert.deepEqual(suppressed, ["c", "n"]);
});

test("applyDisclosure: 抑制が2つ以上あるグループには何もしない", () => {
  const { suppressed } = applyDisclosure(
    { total: 100, s: 85, n: 8, c: 7 },
    [{ total: "total", parts: ["s", "n", "c"] }]
  );
  assert.deepEqual(suppressed, ["c", "n"]);
});

test("applyDisclosure: 補完抑制は別のグループへ連鎖する", () => {
  // g1 で x が一次抑制 → y を補完抑制 → g2 では y だけが抑制なので z を抑制
  const { suppressed } = applyDisclosure(
    { t1: 60, x: 5, y: 20, w: 35, t2: 100, z: 30, v: 50 },
    [
      { total: "t1", parts: ["x", "y", "w"] },
      { total: "t2", parts: ["y", "z", "v"] },
    ]
  );
  assert.deepEqual(suppressed, ["x", "y", "z"]);
});

test("applyDisclosure: グループに存在しないキーがあれば例外", () => {
  assert.throws(() => applyDisclosure({ a: 20 }, [{ total: "a", parts: ["missing"] }]));
});

test("roundToTens: 10 の位に丸める", () => {
  assert.equal(roundToTens(243), 240);
  assert.equal(roundToTens(245), 250);
  assert.equal(roundToTens(10), 10);
});

test("discloseTeamCounts: relevant = support + neutral + criticism で補完抑制し、応援者数を丸める", () => {
  const disclosed = discloseTeamCounts({
    relevant: 438,
    support: 312,
    neutral: 98,
    criticism: 28,
    uncertain: 41,
    uniqueSupporters: 243,
  });
  assert.deepEqual(disclosed.counts, {
    relevant: 438,
    support: 312,
    neutral: 98,
    criticism: 28,
    uncertain: 41,
    uniqueSupporters: 240,
  });
  assert.deepEqual(disclosed.suppressed, []);

  const small = discloseTeamCounts({
    relevant: 60,
    support: 45,
    neutral: 12,
    criticism: 3,
    uncertain: 4,
    uniqueSupporters: 8,
  });
  assert.deepEqual(small.counts, {
    relevant: 60,
    support: 45,
    neutral: null,
    criticism: null,
    uncertain: null,
    uniqueSupporters: null,
  });
  assert.deepEqual(small.suppressed, [
    "counts.criticism",
    "counts.neutral",
    "counts.uncertain",
    "counts.uniqueSupporters",
  ]);
});
