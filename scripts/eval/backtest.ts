/**
 * 予測モデルのバックテスト
 *
 * 各ボウトを「その試合日より前に分かっていた情報だけ」で予測し直し、モデルを比較する。
 * - 学習: SFL 2025 (レギュラー + プレイオフ + 決勝)
 * - 検証: SFL 2026 レギュラーシーズン
 * 使用キャラは実際に使われたキャラを与える (キャラ選択の予測は別途評価する)。
 *
 *   npx tsx scripts/eval/backtest.ts
 *   出力: docs/model-eval-report.md (本番パラメータは Step 0 が src/data/model-v2.json に学習・保存する)
 */
import fs from "node:fs";
import path from "node:path";
import { getCompetitiveArchetypeBias } from "../0-fetch-cpt-data";
import {
  BucklerDiaDataSchema,
  StartggIdentitiesDataSchema,
  StartggPremierResultsDataSchema,
} from "../../src/lib/schema";
import type { SflBout } from "../../src/lib/model/history";
import { FeatureState, jstDayStart } from "../../src/lib/model/state";
import {
  boutFeatures,
  calibration,
  evaluate,
  fitV2,
  v1Combined,
  v1Series,
  v2Bout,
  type BoutFeatures,
  type Metrics,
  type V2Params,
} from "../../src/lib/model/bout-model";

const ROOT = process.cwd();
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", f), "utf8"));

function matchupPrior(): { fn: (a: string, b: string) => number; label: string } {
  const file = path.join(ROOT, "src/data/buckler-dia.json");
  if (fs.existsSync(file)) {
    const dia = BucklerDiaDataSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    const idx = new Map(dia.chars.map((c, i) => [c, i]));
    return {
      fn: (a, b) => {
        const i = idx.get(a);
        const j = idx.get(b);
        const v = i != null && j != null ? dia.matrix[i]?.[j] : null;
        return v ?? getCompetitiveArchetypeBias(a, b);
      },
      label: `Capcom公式ダイアグラム (${dia.month})`,
    };
  }
  return { fn: getCompetitiveArchetypeBias, label: "手設定の相性事前分布" };
}

function buildDataset(useStartgg: boolean) {
  const bouts: SflBout[] = read("sfl-bout-history.json").bouts;
  const state = new FeatureState();
  state.addSflBouts(bouts);
  if (useStartgg) {
    state.addStartgg(
      StartggPremierResultsDataSchema.parse(read("startgg-premier-results.json")),
      StartggIdentitiesDataSchema.parse(read("startgg-identities.json"))
    );
  }
  const prior = matchupPrior();
  const rows: Array<{ bout: SflBout; f: BoutFeatures; y: boolean }> = [];
  for (const b of bouts) {
    state.advanceTo(jstDayStart(b.date));
    const firstTo = Math.max(b.homeBattles, b.awayBattles);
    rows.push({
      bout: b,
      f: boutFeatures(state, b.homePlayer, b.awayPlayer, b.homeChar, b.awayChar, firstTo, prior.fn),
      y: b.homeBattles > b.awayBattles,
    });
  }
  return { rows, priorLabel: prior.label };
}

function fmt(m: Metrics): string {
  return `| ${m.n} | ${m.logLoss.toFixed(4)} | ${m.brier.toFixed(4)} | ${(m.accuracy * 100).toFixed(1)}% |`;
}

function main() {
  const withSgg = buildDataset(true);
  const sflOnly = buildDataset(false);
  const train = withSgg.rows.filter((r) => r.bout.season === "2025");
  const test = withSgg.rows.filter((r) => r.bout.season === "2026" && r.bout.stage === "regular");
  const testSflOnly = sflOnly.rows.filter((r) => r.bout.season === "2026" && r.bout.stage === "regular");

  const params: V2Params = fitV2(train.map(({ f, y }) => ({ f, y })));
  // 対キャラ戦績・直接対決を使わない単純版 (少サンプルでの過学習の確認用)
  const fitSimple = (data: Array<{ f: BoutFeatures; y: boolean }>) => {
    const zeroed = data.map(({ f, y }) => ({ f: { ...f, vsHome: 0.5, vsAway: 0.5, h2h: 0.5 }, y }));
    return fitV2(zeroed);
  };
  const paramsSimple = fitSimple(train);
  const simple = (f: BoutFeatures, w: V2Params) => v2Bout({ ...f, vsHome: 0.5, vsAway: 0.5, h2h: 0.5 }, w);
  // 節ごとの学習し直し: 各試合日より前の全ボウト (2025 + 2026 の過去節) で推定
  const rollingParams = new Map<string, V2Params>();
  for (const date of [...new Set(test.map((r) => r.bout.date))]) {
    const past = withSgg.rows.filter((r) => r.bout.date < date).map(({ f, y }) => ({ f, y }));
    rollingParams.set(date, fitSimple(past));
  }
  const paramsSflOnly = fitV2(
    sflOnly.rows.filter((r) => r.bout.season === "2025").map(({ f, y }) => ({ f, y }))
  );

  const models: Array<{ name: string; desc: string; rows: typeof test; p: (f: BoutFeatures) => number }> = [
    { name: "M0", desc: "常に50%", rows: test, p: () => 0.5 },
    { name: "M1", desc: "v1（現行の合成式）", rows: test, p: v1Combined },
    { name: "M2", desc: "v1 + 2本/3本先取換算", rows: test, p: v1Series },
    { name: "M3", desc: "v2 ロジスティック（SFLのみで実力推定）", rows: testSflOnly, p: (f) => v2Bout(f, paramsSflOnly) },
    { name: "M4", desc: "v2 ロジスティック（SFL + start.gg で実力推定）", rows: test, p: (f) => v2Bout(f, params) },
    { name: "M5", desc: "v2 単純版（実力・相性・HOMEのみ）", rows: test, p: (f) => simple(f, paramsSimple) },
  ];

  const results = models.map((m) => {
    const preds = m.rows.map((r) => ({ p: m.p(r.f), y: r.y }));
    return { ...m, metrics: evaluate(preds), calib: calibration(preds) };
  });
  {
    const preds = test.map((r) => ({ p: simple(r.f, rollingParams.get(r.bout.date)!), y: r.y }));
    results.push({
      name: "M6",
      desc: "v2 単純版・節ごとに学習し直し",
      rows: test,
      p: () => 0.5,
      metrics: evaluate(preds),
      calib: calibration(preds),
    });
  }
  const trainMetrics = evaluate(train.map((r) => ({ p: v2Bout(r.f, params), y: r.y })));

  const lines: string[] = [];
  lines.push("# 予測モデル バックテスト結果", "");
  lines.push(`生成: ${new Date().toISOString()}（\`npx tsx scripts/eval/backtest.ts\`）`, "");
  lines.push(
    "各ボウトを、その試合日より前に分かっていた情報だけで予測し直して比較した。使用キャラは実際のキャラを与えている（キャラ選択の予測は含まない）。",
    `キャラ相性の事前分布: ${withSgg.priorLabel}`,
    "",
    `- 学習: SFL 2025（${train.length}ボウト）`,
    `- 検証: SFL 2026 レギュラーシーズン（${test.length}ボウト）`,
    "",
    "## 検証期間の成績（小さいほど良い: 対数損失・Brier）",
    "",
    "| モデル | 内容 | ボウト数 | 対数損失 | Brier | 的中率 |",
    "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.desc} ${fmt(r.metrics)}`),
    "",
    `参考: M4 の学習期間（2025）での成績 ${fmt(trainMetrics)}`,
    "",
    "## 推定したパラメータ（M4）",
    "",
    "| 項目 | 値 | 意味 |",
    "|---|---|---|",
    `| rating | ${params.rating.toFixed(3)} | レーティング差の効き（1.0 で Elo どおり） |`,
    `| matchup | ${params.matchup.toFixed(3)} | キャラ相性の効き |`,
    `| home | ${params.home.toFixed(3)} | HOME（後出し）の1ゲームあたりの補正（ロジット） |`,
    `| vsChar | ${params.vsChar.toFixed(3)} | 対キャラ戦績の効き |`,
    `| h2h | ${params.h2h.toFixed(3)} | 直接対決の効き |`,
    "",
    "## キャリブレーション（検証期間）",
    ""
  );
  for (const r of results.filter((x) => x.name !== "M0")) {
    lines.push(`### ${r.name} ${r.desc}`, "", "| 予測区間 | ボウト数 | 予測の平均 | 実際の勝率 |", "|---|---|---|---|");
    for (const c of r.calib) {
      lines.push(`| ${c.range} | ${c.n} | ${(c.predicted * 100).toFixed(1)}% | ${(c.actual * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }
  lines.push(
    "## 注意",
    "",
    `- 検証は${test.length}ボウトと少なく、指標の差には誤差が大きい。節が進むたびに再実行して判断する。`,
    "- start.gg のデータは 2025-10-20 以降のみのため、2025年の学習期間では start.gg の効果はほぼ入っていない。",
    "- Buckler のデータは過去にさかのぼれないため、このバックテストには含めていない。"
  );

  fs.writeFileSync(path.join(ROOT, "docs/model-eval-report.md"), lines.join("\n") + "\n", "utf8");
  for (const r of results) {
    console.log(
      `${r.name} ${r.desc.padEnd(34)} n=${r.metrics.n} logloss=${r.metrics.logLoss.toFixed(4)} brier=${r.metrics.brier.toFixed(4)} acc=${(r.metrics.accuracy * 100).toFixed(1)}%`
    );
  }
  console.log("M4 params", params);
  console.log("M3 params", paramsSflOnly);
}

main();
