/** 統計の小道具 (外部ライブラリなし) */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 昇順ソート済み配列の分位点 (線形補間)。空配列は null */
export function quantileSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = Math.min(Math.max(q, 0), 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function quantile(values: readonly number[], q: number): number | null {
  return quantileSorted([...values].sort((a, b) => a - b), q);
}

/**
 * 基準分布に対するパーセンタイル順位 (0〜100)。同値は半分ずつ数える。
 * 基準が空のときは比較できないので例外にする (呼び出し側で基準を用意する)。
 */
export function percentileRank(value: number, sortedBaseline: readonly number[]): number {
  if (sortedBaseline.length === 0) throw new Error("percentileRank: baseline is empty");
  let below = 0;
  let equal = 0;
  for (const b of sortedBaseline) {
    if (b < value) below++;
    else if (b === value) equal++;
    else break;
  }
  return ((below + equal / 2) / sortedBaseline.length) * 100;
}

/** simulator.ts の createSeededRng と同じ mulberry32 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列から決定的なシードを作る (FNV-1a 32bit) */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
