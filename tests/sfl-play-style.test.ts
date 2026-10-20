import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  SF6_CHARACTERS,
  normalizeSflCharKey,
  sflCharMode,
} from "../src/lib/characters";
import {
  buildPlayStyleProfiles,
  MIN_BATTLES_FOR_RANK,
  SFL_PLAY_STATS_COLUMNS,
} from "../src/lib/sfl/play-style";
import {
  buildSeason,
  countBattlesUpTo,
  parseStatsCsv,
} from "../scripts/0b-fetch-sfl-play-stats";
import { SflPlayStatsDataSchema } from "../src/lib/schema";
import type { SflPlayStatsData, SflPlayStatsMetricKey } from "../src/lib/types";

const DATA_DIR = path.resolve(process.cwd(), "src/data");

test("キャラ定義: 公式31キャラ・キー重複なし・SFLキーの正規化", () => {
  assert.equal(SF6_CHARACTERS.length, 31);
  assert.equal(new Set(SF6_CHARACTERS.map((c) => c.key)).size, 31);
  for (const key of ["alex", "ingrid", "yasmine"]) {
    assert.ok(SF6_CHARACTERS.some((c) => c.key === key), `${key} がありません`);
  }
  assert.equal(normalizeSflCharKey("deejay"), "dee_jay");
  assert.equal(normalizeSflCharKey("ken(m)"), "ken");
  assert.equal(normalizeSflCharKey("vega_mbison(c)"), "vega_mbison");
  assert.equal(normalizeSflCharKey(""), "");
  assert.equal(sflCharMode("ken(m)"), "m");
  assert.equal(sflCharMode("ken(c)"), "c");
  assert.equal(sflCharMode("ken"), null);
});

test("parseStatsCsv: 公式CSVの列を指標キーに対応付ける (末尾空白・空行を許容)", () => {
  const csv =
    "ryukichi,りゅうきち,15,10,2,1,0,0,56,5,1,10,69,6,43,33,0,13,67 ,0 \r\n\r\nbad,row,1,2";
  const rows = parseStatsCsv(csv);
  assert.deepEqual(Object.keys(rows), ["ryukichi"]);
  const m = rows.ryukichi.metrics;
  assert.equal(SFL_PLAY_STATS_COLUMNS.length, 18);
  assert.equal(m.dr, 15);
  assert.equal(m.drc, 10);
  assert.equal(m.dp, 56);
  assert.equal(m.udn, 69);
  assert.equal(m.air, 43);
  assert.equal(m.tt, 33);
  assert.equal(m.wuds, 0);
  assert.equal(m.jpp, 13);
  assert.equal(m.hwin, 67);
  assert.equal(m.awin, 0);
});

function slot(p1: string, b1: number, p2: string, b2: number) {
  return { result: { "1p": [{ player: p1, battle: b1 }], "2p": [{ player: p2, battle: b2 }] } };
}

test("countBattlesUpTo / buildSeason: stats の集計時点までのバトル数で揃える", () => {
  const schedules = [
    { post_name: "div-s-sec1", fields: { section: { match1: slot("a", 2, "b", 1), match2: { result: "" as const } } } },
    { post_name: "div-s-sec2", fields: { section: { match1: slot("a", 0, "c", 2) } } },
  ];
  assert.deepEqual(countBattlesUpTo(schedules, new Set(["div-s-sec1"])), { a: 3, b: 3 });

  const row = (k: string) => `${k},${k},${Array(18).fill(1).join(",")}`;
  const season = buildSeason(
    {
      stats: [
        { title: "第1節", slug: "div-s-sec1", stats: { stats: row("a") } },
        { title: "第2節", slug: "div-s-sec2", stats: { stats: "" } }, // 未更新の節
      ],
    },
    schedules
  );
  assert.ok(season);
  assert.equal(season.asOfSection, "div-s-sec1");
  assert.equal(season.players.a.battles, 3);
});

function seasonOf(players: Record<string, { battles: number; metrics: Partial<Record<SflPlayStatsMetricKey, number>> }>) {
  const full = Object.fromEntries(
    Object.entries(players).map(([k, p]) => [
      k,
      {
        name: k,
        battles: p.battles,
        metrics: Object.fromEntries(SFL_PLAY_STATS_COLUMNS.map((c) => [c, p.metrics[c] ?? 0])),
      },
    ])
  );
  return { asOfSection: "div-s-sec4", asOfTitle: "第4節", players: full };
}

test("buildPlayStyleProfiles: 1バトルあたり換算・SFL内順位・サンプル不足の除外", () => {
  const players: Record<string, { battles: number; metrics: Partial<Record<SflPlayStatsMetricKey, number>> }> = {};
  for (let i = 0; i < 10; i++) {
    players[`p${i}`] = { battles: 10, metrics: { dr: i * 10, di: 10, dis: i, air: 50 } };
  }
  players.rookie = { battles: MIN_BATTLES_FOR_RANK - 1, metrics: { dr: 999 } };
  const data: SflPlayStatsData = {
    updatedAt: "",
    source: "test",
    seasons: {
      "2026": seasonOf(players),
      "2025": seasonOf({ p9: { battles: 10, metrics: { dr: 0 } }, p0: { battles: 10, metrics: { dr: 90 } } }),
    },
  };
  const profiles = buildPlayStyleProfiles(data, "2026", "2025");

  const top = profiles.p9.metrics.find((m) => m.id === "dr")!;
  assert.equal(top.value, 9);
  assert.equal(top.rank, 1);
  assert.equal(top.cohortSize, 10, "出場不足の選手は順位の母集団に入らない");
  assert.ok(profiles.p9.tags.includes("ドライブラッシュで攻め込む"));
  assert.ok(profiles.p0.tags.includes("生ラッシュは控えめ"));
  assert.ok(profiles.p9.changes.some((c) => c.startsWith("ドライブラッシュが昨季より増加")));

  const diSuccess = profiles.p9.metrics.find((m) => m.id === "diSuccess")!;
  assert.equal(diSuccess.value, 90);

  const rookie = profiles.rookie.metrics.find((m) => m.id === "dr")!;
  assert.equal(rookie.value, 199.8);
  assert.equal(rookie.rank, null);
  assert.deepEqual(profiles.rookie.tags, []);
});

test("sfl-play-stats.json: Zod検証と今季48選手の収録", () => {
  const data = SflPlayStatsDataSchema.parse(
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "sfl-play-stats.json"), "utf8"))
  );
  const seed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "raw-capcom-seed.json"), "utf8"));
  for (const key of Object.keys(seed.data.players)) {
    assert.ok(data.seasons["2026"].players[key], `今季のプレイ統計に ${key} がありません`);
  }
});
