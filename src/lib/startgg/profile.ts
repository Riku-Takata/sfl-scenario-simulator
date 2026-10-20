/**
 * start.gg プレミア大会の実戦データ → 選手プロファイル (特徴量・タグ・要約)
 *
 * 入力は src/data/startgg-premier-results.json と startgg-identities.json のみで、
 * パイプライン (予測用の統計) と選手図鑑 (表示) の両方から呼ばれる純粋関数。
 */
import type {
  PremierCategory,
  StartggIdentitiesData,
  StartggPremierResultsData,
  StartggSet,
} from "../types";

export interface WinLossRecord {
  won: number;
  lost: number;
  total: number;
  /** 0..100 (%)。サンプル0件は null */
  rate: number | null;
}

export interface PremierEventResult {
  eventId: string;
  tournamentName: string;
  eventName: string;
  category: PremierCategory;
  date: string;
  numEntrants: number | null;
  isOnline: boolean;
  countryCode: string | null;
  placement: number | null;
  seed: number | null;
  setsWon: number;
  setsLost: number;
  /** 上位何%か (placement / numEntrants) */
  topPercent: number | null;
}

export interface PlayerTournamentProfile {
  sflKey: string;
  startggPlayerId: number;
  gamerTag: string;
  userSlug: string | null;
  windowStart: string;
  updatedAt: string;
  eventsCount: number;
  results: PremierEventResult[];
  bestResult: PremierEventResult | null;
  top8Count: number;
  top16Count: number;
  top32Count: number;
  avgTopPercent: number | null;
  sets: WinLossRecord;
  games: WinLossRecord;
  /** 最終ゲームまでもつれたセット */
  decidingGame: WinLossRecord;
  /** 第1ゲームを落としたセットからの勝利 */
  comeback: WinLossRecord;
  /** 第1ゲームを取ったセットをそのまま勝ち切った率 */
  closeOut: WinLossRecord;
  losersBracket: WinLossRecord;
  /** 自分よりシード上位の相手 */
  vsHigherSeed: WinLossRecord;
  /** 自分よりシード下位の相手 */
  vsLowerSeed: WinLossRecord;
  vsSflPlayers: WinLossRecord;
  offline: WinLossRecord;
  online: WinLossRecord;
  overseas: WinLossRecord;
  overseasEventsCount: number;
  recent90Days: WinLossRecord;
  /** シード由来の相手強度から推定したパフォーマンスレーティング (Elo尺度) */
  performanceRating: number | null;
  ratingSampleSets: number;
  h2h: Record<string, { opponentKey: string; won: number; lost: number }>;
  characters: {
    /** キャラ情報が登録されていたゲーム数 */
    reportedGames: number;
    used: Array<{ charKey: string; games: number; won: number }>;
    vs: Array<{ charKey: string; won: number; lost: number }>;
  };
  tags: string[];
  summary: string[];
}

function rec(won: number, lost: number): WinLossRecord {
  const total = won + lost;
  return {
    won,
    lost,
    total,
    rate: total > 0 ? Math.round((won / total) * 1000) / 10 : null,
  };
}

class Tally {
  won = 0;
  lost = 0;
  add(won: boolean) {
    if (won) this.won++;
    else this.lost++;
  }
  toRecord(): WinLossRecord {
    return rec(this.won, this.lost);
  }
}

/** シード順 → 相手強度 (Elo尺度)。上位シードほど強いとみなす */
export function seedToRating(seed: number): number {
  return 2000 - 75 * Math.log2(Math.max(1, seed));
}

/**
 * 最尤推定によるパフォーマンスレーティング
 * 事前分布として基準レート相手の2勝2敗を加え、少サンプルでの発散を抑える
 */
export function estimatePerformanceRating(
  games: Array<{ oppRating: number; won: boolean }>,
  priorRating = 1600
): number | null {
  if (games.length === 0) return null;
  const all = [
    ...games,
    { oppRating: priorRating, won: true },
    { oppRating: priorRating, won: true },
    { oppRating: priorRating, won: false },
    { oppRating: priorRating, won: false },
  ];
  const score = (r: number) =>
    all.reduce(
      (sum, g) => sum + (g.won ? 1 : 0) - 1 / (1 + 10 ** ((g.oppRating - r) / 400)),
      0
    );
  let lo = 800;
  let hi = 3200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (score(mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

function isDecidingGame(s: StartggSet): boolean {
  const lo = Math.min(s.myScore, s.oppScore);
  const hi = Math.max(s.myScore, s.oppScore);
  return lo >= 1 && hi - lo === 1;
}

const DAY = 24 * 60 * 60;

export function buildTournamentProfiles(
  results: StartggPremierResultsData,
  identities: StartggIdentitiesData,
  displayNames: Record<string, string> = {},
  nowSec = Math.floor(Date.now() / 1000)
): Record<string, PlayerTournamentProfile> {
  const sflKeyByPlayerId = new Map<number, string>();
  for (const [key, ident] of Object.entries(identities.players)) {
    sflKeyByPlayerId.set(ident.startggPlayerId, key);
  }

  const profiles: Record<string, PlayerTournamentProfile> = {};
  for (const [sflKey, p] of Object.entries(results.players)) {
    const sets = p.sets.filter((s) => results.events[s.eventId]?.category);

    const setT = new Tally();
    const gameT = new Tally();
    const deciding = new Tally();
    const comeback = new Tally();
    const closeOut = new Tally();
    const losers = new Tally();
    const higher = new Tally();
    const lower = new Tally();
    const vsSfl = new Tally();
    const offline = new Tally();
    const online = new Tally();
    const overseas = new Tally();
    const recent = new Tally();
    const h2h: PlayerTournamentProfile["h2h"] = {};
    const usedChars = new Map<string, { games: number; won: number }>();
    const vsChars = new Map<string, { won: number; lost: number }>();
    const perEvent = new Map<string, { won: number; lost: number }>();
    const ratingGames: Array<{ oppRating: number; won: boolean }> = [];
    let reportedGames = 0;

    for (const s of sets) {
      const ev = results.events[s.eventId];
      setT.add(s.won);
      for (let i = 0; i < s.myScore; i++) gameT.add(true);
      for (let i = 0; i < s.oppScore; i++) gameT.add(false);
      if (isDecidingGame(s)) deciding.add(s.won);
      if (s.games.length > 0) {
        if (s.games[0].won) closeOut.add(s.won);
        else comeback.add(s.won);
      }
      if (s.round != null && s.round < 0) losers.add(s.won);
      if (s.mySeed != null && s.oppSeed != null && s.mySeed !== s.oppSeed) {
        (s.oppSeed < s.mySeed ? higher : lower).add(s.won);
      }
      if (s.oppSeed != null) {
        ratingGames.push({ oppRating: seedToRating(s.oppSeed), won: s.won });
      }

      const oppKey = s.oppPlayerId != null ? sflKeyByPlayerId.get(s.oppPlayerId) : undefined;
      if (oppKey && oppKey !== sflKey) {
        vsSfl.add(s.won);
        const h = (h2h[oppKey] ??= { opponentKey: oppKey, won: 0, lost: 0 });
        if (s.won) h.won++;
        else h.lost++;
      }

      if (ev.isOnline) online.add(s.won);
      else offline.add(s.won);
      if (!ev.isOnline && ev.countryCode && ev.countryCode !== "JP") overseas.add(s.won);
      if (s.completedAt >= nowSec - 90 * DAY) recent.add(s.won);

      const pe = perEvent.get(s.eventId) ?? { won: 0, lost: 0 };
      if (s.won) pe.won++;
      else pe.lost++;
      perEvent.set(s.eventId, pe);

      for (const g of s.games) {
        if (!g.myChar) continue;
        reportedGames++;
        const u = usedChars.get(g.myChar) ?? { games: 0, won: 0 };
        u.games++;
        if (g.won) u.won++;
        usedChars.set(g.myChar, u);
        if (g.oppChar) {
          const v = vsChars.get(g.oppChar) ?? { won: 0, lost: 0 };
          if (g.won) v.won++;
          else v.lost++;
          vsChars.set(g.oppChar, v);
        }
      }
    }

    const placementByEvent = new Map(p.placements.map((pl) => [pl.eventId, pl]));
    const eventResults: PremierEventResult[] = [...perEvent.entries()]
      .map(([eventId, wl]) => {
        const ev = results.events[eventId];
        const pl = placementByEvent.get(eventId);
        const placement = pl?.placement ?? null;
        return {
          eventId,
          tournamentName: ev.tournamentName,
          eventName: ev.eventName,
          category: ev.category as PremierCategory,
          date: ev.startDate,
          numEntrants: ev.numEntrants,
          isOnline: Boolean(ev.isOnline),
          countryCode: ev.countryCode,
          placement,
          seed: pl?.seed ?? null,
          setsWon: wl.won,
          setsLost: wl.lost,
          topPercent:
            placement != null && ev.numEntrants
              ? Math.round((placement / ev.numEntrants) * 1000) / 10
              : null,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const placed = eventResults.filter((r) => r.placement != null);
    const bestResult =
      [...placed].sort(
        (a, b) =>
          (a.placement ?? 0) - (b.placement ?? 0) ||
          (b.numEntrants ?? 0) - (a.numEntrants ?? 0)
      )[0] ?? null;
    const topPercents = placed
      .map((r) => r.topPercent)
      .filter((v): v is number => v != null);

    const profile: PlayerTournamentProfile = {
      sflKey,
      startggPlayerId: p.startggPlayerId,
      gamerTag: p.gamerTag,
      userSlug: identities.players[sflKey]?.userSlug ?? null,
      windowStart: results.windowStart,
      updatedAt: results.updatedAt,
      eventsCount: eventResults.length,
      results: eventResults,
      bestResult,
      top8Count: placed.filter((r) => (r.placement ?? 99) <= 8).length,
      top16Count: placed.filter((r) => (r.placement ?? 99) <= 16).length,
      top32Count: placed.filter((r) => (r.placement ?? 99) <= 32).length,
      avgTopPercent:
        topPercents.length > 0
          ? Math.round((topPercents.reduce((a, b) => a + b, 0) / topPercents.length) * 10) / 10
          : null,
      sets: setT.toRecord(),
      games: gameT.toRecord(),
      decidingGame: deciding.toRecord(),
      comeback: comeback.toRecord(),
      closeOut: closeOut.toRecord(),
      losersBracket: losers.toRecord(),
      vsHigherSeed: higher.toRecord(),
      vsLowerSeed: lower.toRecord(),
      vsSflPlayers: vsSfl.toRecord(),
      offline: offline.toRecord(),
      online: online.toRecord(),
      overseas: overseas.toRecord(),
      overseasEventsCount: eventResults.filter(
        (r) => !r.isOnline && r.countryCode && r.countryCode !== "JP"
      ).length,
      recent90Days: recent.toRecord(),
      performanceRating: estimatePerformanceRating(ratingGames),
      ratingSampleSets: ratingGames.length,
      h2h,
      characters: {
        reportedGames,
        used: [...usedChars.entries()]
          .map(([charKey, v]) => ({ charKey, ...v }))
          .sort((a, b) => b.games - a.games),
        vs: [...vsChars.entries()]
          .map(([charKey, v]) => ({ charKey, ...v }))
          .sort((a, b) => b.won + b.lost - (a.won + a.lost)),
      },
      tags: [],
      summary: [],
    };
    profile.summary = generateTournamentSummary(profile, displayNames);
    profiles[sflKey] = profile;
  }

  const cohort = Object.values(profiles);
  for (const profile of cohort) {
    profile.tags = generateTournamentTags(profile, cohort);
  }
  return profiles;
}

interface CohortMetric {
  minTotal: number;
  /** 差分指標: high は正の値、low は負の値のときのみ */
  signed?: boolean;
  value: (p: PlayerTournamentProfile) => { v: number; n: number } | null;
  high?: (p: PlayerTournamentProfile) => string;
  low?: (p: PlayerTournamentProfile) => string;
}

function rateOf(r: WinLossRecord): { v: number; n: number } | null {
  return r.rate == null ? null : { v: r.rate, n: r.total };
}

/** SFL選手同士で比較して際立つ特徴 (上位/下位 20%) をタグにする */
const COHORT_METRICS: CohortMetric[] = [
  {
    minTotal: 8,
    value: (p) => rateOf(p.decidingGame),
    high: (p) => `最終ゲームに強い (${p.decidingGame.won}勝${p.decidingGame.lost}敗)`,
    low: (p) =>
      (p.decidingGame.rate ?? 0) < 50
        ? `最終ゲームで競り負けがち (${p.decidingGame.won}勝${p.decidingGame.lost}敗)`
        : `最終ゲームの勝率は伸び悩み (${p.decidingGame.won}勝${p.decidingGame.lost}敗)`,
  },
  {
    minTotal: 6,
    value: (p) => rateOf(p.comeback),
    high: (p) => `逆転力 (先取され${p.comeback.total}セット中${p.comeback.won}勝)`,
    low: (p) => `先行されると苦しい (先取され${p.comeback.total}セット中${p.comeback.won}勝)`,
  },
  {
    minTotal: 8,
    value: (p) => rateOf(p.losersBracket),
    high: (p) => `ルーザーズの粘り (${p.losersBracket.won}勝${p.losersBracket.lost}敗)`,
  },
  {
    minTotal: 5,
    value: (p) => rateOf(p.vsHigherSeed),
    high: (p) => `格上シード食い (${p.vsHigherSeed.won}勝${p.vsHigherSeed.lost}敗)`,
  },
  {
    minTotal: 6,
    value: (p) => rateOf(p.vsSflPlayers),
    high: (p) => `SFL勢に強い (${p.vsSflPlayers.won}勝${p.vsSflPlayers.lost}敗)`,
    low: (p) => `SFL勢相手に苦戦 (${p.vsSflPlayers.won}勝${p.vsSflPlayers.lost}敗)`,
  },
  {
    minTotal: 20,
    value: (p) => rateOf(p.vsLowerSeed),
    high: (p) => `取りこぼし少 (格下相手${p.vsLowerSeed.rate}%)`,
  },
  {
    minTotal: 1,
    value: (p) => (p.eventsCount > 0 ? { v: p.overseasEventsCount, n: 1 } : null),
    high: (p) => `海外遠征組 (${p.overseasEventsCount}大会)`,
  },
  {
    minTotal: 10,
    signed: true,
    value: (p) =>
      p.offline.total >= 10 &&
      p.online.total >= 10 &&
      p.offline.rate != null &&
      p.online.rate != null &&
      // 差が小さい場合は特徴とみなさない
      Math.abs(p.offline.rate - p.online.rate) >= 5
        ? { v: p.offline.rate - p.online.rate, n: Math.min(p.offline.total, p.online.total) }
        : null,
    high: (p) => `オフラインで真価 (オフライン${p.offline.rate}% / オンライン${p.online.rate}%)`,
    low: (p) => `オンライン大会に強い (オンライン${p.online.rate}% / オフライン${p.offline.rate}%)`,
  },
];

const COHORT_EDGE = 0.2;

function percentileRank(value: number, values: number[]): number {
  if (values.length <= 1) return 0.5;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return (below + (equal - 1) / 2) / (values.length - 1);
}

/** 実績タグ + SFL選手内で際立つ特徴タグ (優先度順・最大6件) */
export function generateTournamentTags(
  p: PlayerTournamentProfile,
  cohort: PlayerTournamentProfile[]
): string[] {
  const tags: string[] = [];
  const best = p.bestResult;
  if (best?.placement === 1) tags.push(`${best.tournamentName} 優勝`);
  if (p.top8Count >= 2) tags.push(`プレミアTop8常連 (${p.top8Count}回)`);
  else if (p.top16Count >= 3) tags.push(`プレミア上位安定 (Top16 ${p.top16Count}回)`);

  const base = p.sets.rate ?? 50;
  const recent = p.recent90Days;
  if (recent.total >= 10 && recent.rate != null) {
    if (recent.rate - base >= 8) tags.push(`直近90日好調 (セット勝率${recent.rate}%)`);
    else if (base - recent.rate >= 8) tags.push(`直近90日やや不調 (セット勝率${recent.rate}%)`);
  }

  const distinctive: Array<{ strength: number; tag: string }> = [];
  for (const m of COHORT_METRICS) {
    const mine = m.value(p);
    if (!mine || mine.n < m.minTotal) continue;
    const values = cohort
      .map((c) => m.value(c))
      .filter((x): x is { v: number; n: number } => x != null && x.n >= m.minTotal)
      .map((x) => x.v);
    if (values.length < 5) continue;
    const pr = percentileRank(mine.v, values);
    const highOk = !m.signed || mine.v > 0;
    const lowOk = !m.signed || mine.v < 0;
    if (m.high && highOk && pr >= 1 - COHORT_EDGE) {
      distinctive.push({ strength: pr, tag: m.high(p) });
    } else if (m.low && lowOk && pr <= COHORT_EDGE) {
      distinctive.push({ strength: 1 - pr, tag: m.low(p) });
    }
  }
  distinctive.sort((a, b) => b.strength - a.strength);
  tags.push(...distinctive.map((d) => d.tag));
  return tags.slice(0, 6);
}

export function generateTournamentSummary(
  p: PlayerTournamentProfile,
  displayNames: Record<string, string>
): string[] {
  if (p.eventsCount === 0) {
    return ["直近1年のプレミア大会出場記録は start.gg 上に見つかりませんでした。"];
  }
  const lines: string[] = [];
  const best = p.bestResult;
  lines.push(
    `直近1年でプレミア大会に${p.eventsCount}大会出場` +
      (best?.placement != null
        ? `、最高成績は${best.tournamentName}の${best.placement}位（${best.numEntrants ?? "?"}人中）`
        : "") +
      `。Top8入り${p.top8Count}回、Top32入り${p.top32Count}回。`
  );
  lines.push(
    `セット勝率${p.sets.rate ?? "-"}%（${p.sets.won}勝${p.sets.lost}敗）、ゲーム勝率${p.games.rate ?? "-"}%。` +
      (p.decidingGame.total > 0
        ? `最終ゲームまでもつれたセットは${p.decidingGame.won}勝${p.decidingGame.lost}敗。`
        : "")
  );
  if (p.vsSflPlayers.total > 0) {
    const rivals = Object.values(p.h2h)
      .sort((a, b) => b.won + b.lost - (a.won + a.lost))
      .slice(0, 3)
      .map((h) => `${displayNames[h.opponentKey] ?? h.opponentKey} ${h.won}-${h.lost}`);
    lines.push(
      `SFL選手との対戦は${p.vsSflPlayers.won}勝${p.vsSflPlayers.lost}敗（${rivals.join(" / ")}）。`
    );
  }
  if (p.characters.reportedGames > 0) {
    lines.push(
      `キャラクター情報が登録されたゲームは${p.characters.reportedGames}件（全${p.games.total}ゲーム中）のみのため、対キャラ傾向は参考値。`
    );
  }
  return lines;
}
