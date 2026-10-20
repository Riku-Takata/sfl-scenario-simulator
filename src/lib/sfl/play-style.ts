/**
 * SFL公式 試合内プレイ統計 → 選手のプレイ傾向プロファイル
 *
 * 公式値はシーズン累積なので、回数系は「1バトルあたり」に、率系 (%) はそのまま使う。
 * 比較は公式サイトのランキングと同じく、同シーズンのSFL選手内での順位で行う。
 */
import type {
  SflPlayStatsData,
  SflPlayStatsMetricKey,
  SflPlayStatsSeason,
} from "../types";

export const SFL_CURRENT_SEASON = "2026";
/** 列の並びを確認できた過去シーズン (2024 以前は列定義が公開されておらず対象外) */
export const SFL_PREVIOUS_SEASON = "2025";

/** 公式 CSV の 3列目以降の並び (公式サイト statsTypes / パーサ定義で確認、2025・2026共通) */
export const SFL_PLAY_STATS_COLUMNS: SflPlayStatsMetricKey[] = [
  "dr",
  "drc",
  "di",
  "dis",
  "dir",
  "dip",
  "dp",
  "jp",
  "dre",
  "ov",
  "udn",
  "bn",
  "air",
  "tt",
  "wuds",
  "jpp",
  "hwin",
  "awin",
];

export type PlayStyleMetricId = SflPlayStatsMetricKey | "diSuccess";

interface MetricDef {
  id: PlayStyleMetricId;
  label: string;
  /** perBattle: 累積回数 ÷ 出場バトル数 / rate: 公式の % 値 / derived: 独自算出 */
  kind: "perBattle" | "rate" | "derived";
  description: string;
  high?: string;
  low?: string;
}

/** 表示順。HOME/AWAY勝率は既存のSFL戦績欄と重複するため対象外 */
export const PLAY_STYLE_METRICS: MetricDef[] = [
  { id: "dr", label: "ドライブラッシュ", kind: "perBattle", description: "ゲージ1本消費の生ドライブラッシュ", high: "ドライブラッシュで攻め込む", low: "生ラッシュは控えめ" },
  { id: "drc", label: "キャンセルラッシュ", kind: "perBattle", description: "キャンセルドライブラッシュ", high: "キャンセルラッシュで攻めを継続" },
  { id: "di", label: "ドライブインパクト", kind: "perBattle", description: "ドライブインパクトの使用", high: "インパクトを多用", low: "インパクトをほぼ撃たない" },
  { id: "diSuccess", label: "インパクト成功率", kind: "derived", description: "成功 ÷ 使用（使用5回以上）", high: "インパクトの通し上手" },
  { id: "dir", label: "インパクト返し", kind: "perBattle", description: "相手のインパクトを返した回数", high: "インパクト返しが的確" },
  { id: "dp", label: "ドライブパリィ", kind: "perBattle", description: "パリィを押した回数", high: "パリィで受ける守備型", low: "パリィに頼らない" },
  { id: "jp", label: "ジャストパリィ", kind: "perBattle", description: "暗転したジャストパリィ", high: "ジャストパリィが多い" },
  { id: "jpp", label: "ジャストパリィ(飛び道具)", kind: "perBattle", description: "飛び道具へのジャストパリィ" },
  { id: "dre", label: "ドライブリバーサル", kind: "perBattle", description: "リバーサルでの切り返し", high: "リバーサルで切り返す" },
  { id: "ov", label: "OD技", kind: "perBattle", description: "オーバードライブ技の使用", high: "OD技を積極的に使う" },
  { id: "udn", label: "ゲージ使用本数", kind: "perBattle", description: "ドライブゲージの消費ブロック数", high: "ドライブゲージを使い切る", low: "ゲージ消費が少ない" },
  { id: "bn", label: "バーンアウト", kind: "perBattle", description: "バーンアウトの発生", high: "バーンアウトしやすい", low: "ゲージ管理が堅い（バーンアウト少）" },
  { id: "air", label: "対空成功率", kind: "rate", description: "ジャンプ攻撃への対空", high: "対空が堅い", low: "対空に課題" },
  { id: "tt", label: "投げ抜け成功率", kind: "rate", description: "投げ抜けの成功", high: "投げ抜けが上手い", low: "投げを通されやすい" },
  { id: "wuds", label: "無敵技暴れ成功率", kind: "rate", description: "コンボ外で無敵技がヒット", high: "無敵技暴れが通る" },
];

/** 回数系の順位付けに必要な最低出場バトル数 */
export const MIN_BATTLES_FOR_RANK = 6;
const MIN_DI_FOR_SUCCESS = 5;
const TAG_EDGE = 0.2;
/** 少サンプルでの順位の揺れを拾わないよう、昨季比は大きな変化のみ */
const CHANGE_THRESHOLD = 0.5;

export interface PlayStyleMetricValue {
  id: PlayStyleMetricId;
  label: string;
  description: string;
  unit: "回" | "%";
  value: number | null;
  /** 1 = 最も高い。サンプル不足時は null */
  rank: number | null;
  cohortSize: number;
  /** 0..1 (1 が最も高い) */
  percentile: number | null;
  previousValue: number | null;
  previousPercentile: number | null;
}

export interface PlayerPlayStyleProfile {
  playerKey: string;
  season: string;
  asOfTitle: string;
  battles: number;
  previousSeason: string | null;
  previousBattles: number | null;
  metrics: PlayStyleMetricValue[];
  tags: string[];
  /** 昨季から順位が大きく動いた指標 */
  changes: string[];
}

function metricValue(
  id: PlayStyleMetricId,
  p: SflPlayStatsSeason["players"][string] | undefined
): number | null {
  if (!p || p.battles <= 0) return null;
  const m = p.metrics;
  if (id === "diSuccess") {
    const di = m.di ?? 0;
    return di >= MIN_DI_FOR_SUCCESS ? Math.round(((m.dis ?? 0) / di) * 1000) / 10 : null;
  }
  const def = PLAY_STYLE_METRICS.find((d) => d.id === id);
  const raw = m[id as SflPlayStatsMetricKey] ?? 0;
  return def?.kind === "rate" ? raw : Math.round((raw / p.battles) * 100) / 100;
}

function cohortValues(season: SflPlayStatsSeason, id: PlayStyleMetricId): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, p] of Object.entries(season.players)) {
    if (p.battles < MIN_BATTLES_FOR_RANK) continue;
    const v = metricValue(id, p);
    if (v != null) out.set(key, v);
  }
  return out;
}

function percentileOf(value: number, values: number[]): number {
  if (values.length <= 1) return 0.5;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return (below + (equal - 1) / 2) / (values.length - 1);
}

export function buildPlayStyleProfiles(
  data: SflPlayStatsData,
  currentSeason: string,
  previousSeason: string | null
): Record<string, PlayerPlayStyleProfile> {
  const cur = data.seasons[currentSeason];
  if (!cur) return {};
  const prev = previousSeason ? data.seasons[previousSeason] ?? null : null;

  const curCohorts = new Map(PLAY_STYLE_METRICS.map((d) => [d.id, cohortValues(cur, d.id)]));
  const prevCohorts = prev
    ? new Map(PLAY_STYLE_METRICS.map((d) => [d.id, cohortValues(prev, d.id)]))
    : null;

  const profiles: Record<string, PlayerPlayStyleProfile> = {};
  for (const [key, p] of Object.entries(cur.players)) {
    const prevP = prev?.players[key];
    const metrics: PlayStyleMetricValue[] = PLAY_STYLE_METRICS.map((def) => {
      const cohort = curCohorts.get(def.id)!;
      const values = [...cohort.values()];
      const mine = cohort.get(key);
      const prevCohort = prevCohorts?.get(def.id);
      const prevMine = prevCohort?.get(key);
      return {
        id: def.id,
        label: def.label,
        description: def.description,
        unit: def.kind === "perBattle" ? "回" : "%",
        value: metricValue(def.id, p),
        rank: mine != null ? values.filter((v) => v > mine).length + 1 : null,
        cohortSize: values.length,
        percentile: mine != null ? percentileOf(mine, values) : null,
        previousValue: metricValue(def.id, prevP),
        previousPercentile:
          prevMine != null && prevCohort ? percentileOf(prevMine, [...prevCohort.values()]) : null,
      };
    });

    const tags: Array<{ strength: number; tag: string }> = [];
    const changes: Array<{ strength: number; text: string }> = [];
    for (const def of PLAY_STYLE_METRICS) {
      const mv = metrics.find((m) => m.id === def.id)!;
      if (mv.percentile == null) continue;
      if (def.high && mv.percentile >= 1 - TAG_EDGE) {
        tags.push({ strength: mv.percentile, tag: def.high });
      } else if (def.low && mv.percentile <= TAG_EDGE) {
        tags.push({ strength: 1 - mv.percentile, tag: def.low });
      }
      if (mv.previousPercentile != null) {
        const delta = mv.percentile - mv.previousPercentile;
        if (Math.abs(delta) >= CHANGE_THRESHOLD) {
          changes.push({
            strength: Math.abs(delta),
            text: `${def.label}が昨季より${delta > 0 ? "増加" : "減少"}（SFL内 上位${Math.round((1 - mv.previousPercentile) * 100)}% → ${Math.round((1 - mv.percentile) * 100)}%）`,
          });
        }
      }
    }
    tags.sort((a, b) => b.strength - a.strength);

    profiles[key] = {
      playerKey: key,
      season: currentSeason,
      asOfTitle: cur.asOfTitle,
      battles: p.battles,
      previousSeason: prevP ? previousSeason : null,
      previousBattles: prevP?.battles ?? null,
      metrics,
      tags: tags.slice(0, 5).map((t) => t.tag),
      changes: changes
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 3)
        .map((c) => c.text),
    };
  }
  return profiles;
}
