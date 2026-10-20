/**
 * 時系列の特徴量状態 (予測モデル v2 の土台)
 *
 * SFL 公式戦と start.gg プレミア大会の結果を時刻順に流し込み、
 * 任意の時点で「それまでに分かっていた情報」だけから特徴量を取り出せるようにする。
 * - 実力値: ゲーム単位の Elo (情報源ごとに重みを変える)
 * - 対キャラ戦績・直接対決: 時点までの累積
 */
import type { SflBout } from "./history";
import type { StartggPremierResultsData, StartggIdentitiesData } from "../types";
import { seedToRating } from "../startgg/profile";

export interface RatingParams {
  /** 初期レーティング (start.gg のシード由来の相手強度と同じ尺度) */
  initial: number;
  /** 1ゲームあたりの K */
  k: number;
  weightSfl: number;
  weightOffline: number;
  weightOnline: number;
}

export const DEFAULT_RATING_PARAMS: RatingParams = {
  initial: 1650,
  k: 16,
  weightSfl: 1.0,
  weightOffline: 0.8,
  weightOnline: 0.6,
};

type Event =
  | { kind: "sfl"; t: number; bout: SflBout }
  | {
      kind: "startgg";
      t: number;
      player: string;
      /** SFL選手同士なら相手キー、それ以外は null (シードから相手強度を推定) */
      opp: string | null;
      oppSeed: number | null;
      won: number;
      lost: number;
      online: boolean;
      games: Array<{ won: boolean; myChar: string | null; oppChar: string | null }>;
    };

/** JST の日付 0時 (UNIX秒) */
export function jstDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`) / 1000;
}

function expected(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

export class FeatureState {
  private ratings = new Map<string, number>();
  /** player -> oppChar -> {w, n} (ゲーム単位) */
  private vsChar = new Map<string, Map<string, { w: number; n: number }>>();
  /** "a|b" (a<b) -> a 視点の {w, n} (ボウト・セット単位) */
  private h2h = new Map<string, { w: number; n: number }>();
  private events: Event[] = [];
  private cursor = 0;

  constructor(private readonly params: RatingParams = DEFAULT_RATING_PARAMS) {}

  addSflBouts(bouts: SflBout[]): void {
    for (const b of bouts) this.events.push({ kind: "sfl", t: jstDayStart(b.date) + 12 * 3600, bout: b });
  }

  addStartgg(results: StartggPremierResultsData, identities: StartggIdentitiesData): void {
    const keyById = new Map(Object.entries(identities.players).map(([k, v]) => [v.startggPlayerId, k]));
    const seen = new Set<string>();
    for (const [player, p] of Object.entries(results.players)) {
      for (const s of p.sets) {
        const ev = results.events[s.eventId];
        if (!ev?.category) continue;
        const opp = s.oppPlayerId != null ? keyById.get(s.oppPlayerId) ?? null : null;
        // SFL選手同士のセットは両者の記録に重複して入っているため1回だけ
        if (opp) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
        }
        this.events.push({
          kind: "startgg",
          t: s.completedAt,
          player,
          opp,
          oppSeed: s.oppSeed,
          won: s.myScore,
          lost: s.oppScore,
          online: Boolean(ev.isOnline),
          games: s.games,
        });
      }
    }
  }

  /** 指定時刻 (UNIX秒) より前のイベントをすべて反映する */
  advanceTo(t: number): void {
    if (this.cursor === 0) this.events.sort((a, b) => a.t - b.t);
    while (this.cursor < this.events.length && this.events[this.cursor].t < t) {
      this.apply(this.events[this.cursor++]);
    }
  }

  rating(player: string): number {
    return this.ratings.get(player) ?? this.params.initial;
  }

  vsCharRecord(player: string, oppChar: string): { w: number; n: number } {
    return this.vsChar.get(player)?.get(oppChar) ?? { w: 0, n: 0 };
  }

  /** a 視点の直接対決 (ボウト・セット単位) */
  h2hRecord(a: string, b: string): { w: number; n: number } {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const r = this.h2h.get(key) ?? { w: 0, n: 0 };
    return a < b ? r : { w: r.n - r.w, n: r.n };
  }

  private addVsChar(player: string, oppChar: string, w: number, n: number): void {
    if (!oppChar) return;
    const m = this.vsChar.get(player) ?? new Map();
    const r = m.get(oppChar) ?? { w: 0, n: 0 };
    r.w += w;
    r.n += n;
    m.set(oppChar, r);
    this.vsChar.set(player, m);
  }

  private addH2h(a: string, b: string, aWon: boolean): void {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const r = this.h2h.get(key) ?? { w: 0, n: 0 };
    r.n++;
    if ((a < b) === aWon) r.w++;
    this.h2h.set(key, r);
  }

  private updatePair(a: string, b: string, aWins: number, bWins: number, weight: number): void {
    const ra = this.rating(a);
    const rb = this.rating(b);
    const n = aWins + bWins;
    const delta = this.params.k * weight * (aWins - n * expected(ra, rb));
    this.ratings.set(a, ra + delta);
    this.ratings.set(b, rb - delta);
  }

  private apply(e: Event): void {
    if (e.kind === "sfl") {
      const b = e.bout;
      this.updatePair(b.homePlayer, b.awayPlayer, b.homeBattles, b.awayBattles, this.params.weightSfl);
      this.addVsChar(b.homePlayer, b.awayChar, b.homeBattles, b.homeBattles + b.awayBattles);
      this.addVsChar(b.awayPlayer, b.homeChar, b.awayBattles, b.homeBattles + b.awayBattles);
      this.addH2h(b.homePlayer, b.awayPlayer, b.homeBattles > b.awayBattles);
      return;
    }
    const weight = e.online ? this.params.weightOnline : this.params.weightOffline;
    if (e.opp) {
      this.updatePair(e.player, e.opp, e.won, e.lost, weight);
      this.addH2h(e.player, e.opp, e.won > e.lost);
    } else if (e.oppSeed != null) {
      const r = this.rating(e.player);
      const n = e.won + e.lost;
      this.ratings.set(
        e.player,
        r + this.params.k * weight * (e.won - n * expected(r, seedToRating(e.oppSeed)))
      );
    }
    for (const g of e.games) {
      if (g.oppChar) this.addVsChar(e.player, g.oppChar, g.won ? 1 : 0, 1);
      if (e.opp && g.myChar) this.addVsChar(e.opp, g.myChar, g.won ? 0 : 1, 1);
    }
  }
}
