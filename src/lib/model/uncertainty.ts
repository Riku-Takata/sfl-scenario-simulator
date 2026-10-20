/**
 * 実力値の不確実性 (予測モデル v2 の 2.6)
 *
 * 実力値は数十〜数百ゲームからの推定なので誤差がある。根拠のゲーム数が少ない選手ほど幅を大きくし、
 * シーズン全体のシミュレーションでは「実力値の世界」を複数サンプルして、その誤差を確率に反映する。
 * 同じ世界の中では選手の強さが全試合で共通なので、チームの好不調が試合をまたいで連動する。
 */

export interface UncertaintyParams {
  /** 根拠ゲーム数 0 のときの標準偏差 (レーティング点) */
  sigma0: number;
  /** 何ゲームで分散が半分になるか */
  halfGames: number;
}

export const DEFAULT_UNCERTAINTY: UncertaintyParams = { sigma0: 100, halfGames: 40 };

export function ratingSigma(games: number, params: UncertaintyParams = DEFAULT_UNCERTAINTY): number {
  return params.sigma0 / Math.sqrt(1 + games / params.halfGames);
}

/** 再現性のある乱数 (mulberry32) */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準正規乱数 (Box-Muller) */
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 実力値の世界を K 個サンプル (各世界: 選手キー → レーティング) */
export function sampleRatingWorlds(
  ratings: Record<string, number>,
  games: Record<string, number>,
  k: number,
  seed: number,
  params: UncertaintyParams = DEFAULT_UNCERTAINTY
): Array<Record<string, number>> {
  const rng = seededRng(seed);
  const worlds: Array<Record<string, number>> = [];
  for (let i = 0; i < k; i++) {
    const w: Record<string, number> = {};
    for (const [p, r] of Object.entries(ratings)) {
      w[p] = params.sigma0 > 0 ? r + gaussian(rng) * ratingSigma(games[p] ?? 0, params) : r;
    }
    worlds.push(w);
  }
  return worlds;
}
