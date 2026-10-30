/**
 * 開示制御 (設計書 §7・ADR-007)
 *
 * - 一次抑制: DISCLOSURE_MIN_CELL 未満のセルを null にする (0 も抑制する)
 * - 補完抑制: 「合計 = 部分の和」の関係 (加法グループ) で、抑制したセルが1つだけだと
 *   残りから逆算できる。その場合は残りの公開セルのうち最小のものも抑制する。
 *   1つのセルが複数のグループに属し得るので、変化がなくなるまで繰り返す。
 * - 丸め: ユニーク応援者数は 10 の位に丸める
 */
import { DISCLOSURE_MIN_CELL } from "./config";
import type { TeamCounts } from "./types";

/** total = Σ parts。値はキー (例: "counts.relevant") で指す */
export interface AdditiveGroup {
  total: string;
  parts: string[];
}

export interface DisclosureResult {
  values: Record<string, number | null>;
  /** 抑制したキー (キー順) */
  suppressed: string[];
}

export function applyDisclosure(
  values: Readonly<Record<string, number>>,
  groups: readonly AdditiveGroup[],
  minCell: number = DISCLOSURE_MIN_CELL
): DisclosureResult {
  for (const group of groups) {
    for (const key of [group.total, ...group.parts]) {
      if (!(key in values)) throw new Error(`applyDisclosure: unknown key in group: ${key}`);
    }
  }

  const suppressed = new Set<string>();
  for (const [key, value] of Object.entries(values)) {
    if (value < minCell) suppressed.add(key);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      const members = [group.total, ...group.parts];
      if (members.filter((key) => suppressed.has(key)).length !== 1) continue;
      const next = members
        .filter((key) => !suppressed.has(key))
        .sort((a, b) => values[a] - values[b] || (a < b ? -1 : a > b ? 1 : 0))[0];
      if (next !== undefined) {
        suppressed.add(next);
        changed = true;
      }
    }
  }

  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(values)) out[key] = suppressed.has(key) ? null : value;
  return { values: out, suppressed: [...suppressed].sort() };
}

/** 10 の位に丸める (243 → 240、245 → 250) */
export function roundToTens(value: number): number {
  return Math.round(value / 10) * 10;
}

export type DisclosedTeamCounts = { [K in keyof TeamCounts]: number | null };

/**
 * ランキングと内訳で公開するチームの件数。
 * relevant = support + neutral + criticism の関係で補完抑制し、ユニーク応援者数は丸める。
 */
export function discloseTeamCounts(
  counts: TeamCounts,
  prefix = "counts",
  minCell: number = DISCLOSURE_MIN_CELL
): { counts: DisclosedTeamCounts; suppressed: string[] } {
  const key = (name: keyof TeamCounts) => `${prefix}.${name}`;
  const { values, suppressed } = applyDisclosure(
    {
      [key("relevant")]: counts.relevant,
      [key("support")]: counts.support,
      [key("neutral")]: counts.neutral,
      [key("criticism")]: counts.criticism,
      [key("uncertain")]: counts.uncertain,
    },
    [{ total: key("relevant"), parts: [key("support"), key("neutral"), key("criticism")] }],
    minCell
  );

  const supportersSuppressed = counts.uniqueSupporters < minCell;
  return {
    counts: {
      relevant: values[key("relevant")],
      support: values[key("support")],
      neutral: values[key("neutral")],
      criticism: values[key("criticism")],
      uncertain: values[key("uncertain")],
      uniqueSupporters: supportersSuppressed ? null : roundToTens(counts.uniqueSupporters),
    },
    suppressed: supportersSuppressed ? [...suppressed, key("uniqueSupporters")].sort() : suppressed,
  };
}
