/**
 * 1ゲーム勝率 → n本先取の勝率・決着スコア分布
 */

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** n本先取で勝つ確率 */
export function seriesWinProb(p: number, firstTo: number): number {
  const q = 1 - p;
  let total = 0;
  // 相手が k 本取った状態で最後の1本を取る
  for (let k = 0; k < firstTo; k++) {
    total += binom(firstTo - 1 + k, k) * p ** firstTo * q ** k;
  }
  return total;
}

/** 決着スコア (自分の本数, 相手の本数) ごとの確率 */
export function seriesScoreDist(p: number, firstTo: number): Array<{ my: number; opp: number; prob: number }> {
  const q = 1 - p;
  const out: Array<{ my: number; opp: number; prob: number }> = [];
  for (let k = 0; k < firstTo; k++) {
    const ways = binom(firstTo - 1 + k, k);
    out.push({ my: firstTo, opp: k, prob: ways * p ** firstTo * q ** k });
    out.push({ my: k, opp: firstTo, prob: ways * q ** firstTo * p ** k });
  }
  return out;
}

/** 決着済みの n本先取の結果から、1ゲーム勝率を逆算 (二分探索) */
export function gameProbFromSeries(seriesProb: number, firstTo: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (seriesWinProb(mid, firstTo) < seriesProb) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
