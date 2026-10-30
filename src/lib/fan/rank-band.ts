/**
 * 順位帯 (設計書 §6.7)
 *
 * S の降順に並べ、帯の先頭チームと信頼区間が重なる間は同じ帯に入れる。
 * 重ならないチームが出たら、そのチームを先頭に新しい帯を始める。
 */

export interface RankInput {
  teamKey: string;
  score: number;
  ci: [number, number];
}

export interface RankResult {
  teamKey: string;
  /** 点推定の順位 (1始まり) */
  rank: number;
  bandFrom: number;
  bandTo: number;
  /** "1位" / "2–3位" */
  bandLabel: string;
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function rankBandLabel(from: number, to: number): string {
  return from === to ? `${from}位` : `${from}–${to}位`;
}

export function assignRankBands(teams: readonly RankInput[]): RankResult[] {
  const sorted = [...teams].sort(
    (a, b) => b.score - a.score || (a.teamKey < b.teamKey ? -1 : a.teamKey > b.teamKey ? 1 : 0)
  );
  const bands: RankInput[][] = [];
  for (const team of sorted) {
    const current = bands.at(-1);
    if (current && intervalsOverlap(current[0].ci, team.ci)) current.push(team);
    else bands.push([team]);
  }

  const results: RankResult[] = [];
  let rank = 1;
  for (const band of bands) {
    const from = rank;
    const to = rank + band.length - 1;
    for (const team of band) {
      results.push({ teamKey: team.teamKey, rank, bandFrom: from, bandTo: to, bandLabel: rankBandLabel(from, to) });
      rank++;
    }
  }
  return results;
}
