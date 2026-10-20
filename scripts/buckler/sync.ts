/**
 * Buckler 同期 (自宅サーバーで実行)
 *
 *   npx tsx scripts/buckler/sync.ts --mode daily      # 毎日: 前回以降の対戦ログ + 当日のスナップショット
 *   npx tsx scripts/buckler/sync.ts --mode backfill   # 初回: 公開されている範囲 (直近約100戦 × 選手, 公式ダイアグラム12か月) を取得
 *   --players fuudo,kawano   対象を絞る (試走用)
 *
 * 終了コード: 0 正常 (上限到達で打ち切った場合も含む) / 2 認証切れ (Cookie の再設定が必要) / 3 アクセス拒否・混雑の継続
 * どの段階で止まっても取得済みの分は保存され、次回は続きから再開する。
 */
import { pathToFileURL } from "node:url";
import {
  BACKFILL_PACING,
  BucklerAuthError,
  BucklerBlockedError,
  BucklerBudgetError,
  BucklerClient,
  DAILY_PACING,
} from "./client";
import { BucklerStore, type SyncState } from "./store";
import {
  normalizeDia,
  normalizePlay,
  normalizeReplay,
  type BucklerMatch,
  type RawReplay,
} from "../../src/lib/buckler/records";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

const MAX_BATTLELOG_PAGES = 10; // Buckler が公開するのは直近約100戦 (10ページ)
const DIA_VARIANT = "dia_master";

type Mode = "daily" | "backfill";

/** JST の日付 (YYYY-MM-DD) */
export function jstDate(ms = Date.now()): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 公開済みの可能性がある月 (当月は未公開のため前月から遡る) */
export function recentMonths(count: number, now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 1; i <= count; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseArgs(argv: string[]): { mode: Mode; players: string[] | null } {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = get("mode") === "backfill" ? "backfill" : "daily";
  const players = get("players")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  return { mode, players };
}

async function syncPlayer(
  client: BucklerClient,
  store: BucklerStore,
  sflKey: string,
  sid: string,
  sflKeyByCfn: Map<string, string>,
  mode: Mode
): Promise<SyncState["players"][string]> {
  const today = jstDate();
  if (!store.snapshots(sflKey).some((s) => s.date === today)) {
    const pp = await client.pageProps(`profile/${sid}/play`);
    store.appendSnapshot(sflKey, normalizePlay(pp, today, new Date().toISOString()));
  }

  const knownIds = new Set(store.matches(sflKey).map((m) => m.id));
  const fresh: BucklerMatch[] = [];
  let reachedKnown = false;
  let pagesRead = 0;
  for (let page = 1; page <= MAX_BATTLELOG_PAGES; page++) {
    const pp = await client.pageProps<{ replay_list?: RawReplay[]; total_page?: number }>(
      `profile/${sid}/battlelog`,
      { page }
    );
    pagesRead = page;
    const list = pp.replay_list ?? [];
    for (const raw of list) {
      if (knownIds.has(raw.replay_id)) {
        reachedKnown = true;
        continue;
      }
      const m = normalizeReplay(raw, sid, sflKeyByCfn);
      if (m) {
        fresh.push(m);
        knownIds.add(m.id);
      }
    }
    // 毎日の取得は既知の試合まで遡れば十分
    if (list.length === 0 || page >= (pp.total_page ?? 1)) break;
    if (mode === "daily" && reachedKnown) break;
  }
  store.appendMatches(sflKey, fresh);

  const hadHistory = knownIds.size > fresh.length;
  return {
    lastSyncAt: new Date().toISOString(),
    newMatches: fresh.length,
    gap: mode === "daily" && hadHistory && !reachedKnown && pagesRead >= MAX_BATTLELOG_PAGES,
  };
}

async function syncDia(client: BucklerClient, store: BucklerStore, mode: Mode): Promise<void> {
  const months = recentMonths(mode === "backfill" ? 12 : 2);
  for (const month of months) {
    if (store.dia(DIA_VARIANT, month)) continue;
    const raw = await client.stats<Parameters<typeof normalizeDia>[0]>(DIA_VARIANT, month);
    if (!raw) {
      console.log(`[buckler] ${DIA_VARIANT} ${month}: not published`);
      continue;
    }
    store.saveDia(normalizeDia(raw, month, DIA_VARIANT));
    console.log(`[buckler] ${DIA_VARIANT} ${month}: saved`);
  }
}

export async function runSync(argv = process.argv.slice(2)): Promise<number> {
  const { mode, players: only } = parseArgs(argv);
  const store = new BucklerStore();
  const cfn = store.cfnIds();
  const sflKeyByCfn = new Map(Object.entries(cfn.players).map(([k, v]) => [v.cfnId, k]));
  const targets = shuffle(
    Object.entries(cfn.players).filter(([k]) => !only || only.includes(k))
  );
  if (targets.length === 0) {
    console.error("[buckler] No players. Run scripts/buckler/resolve-cfn-ids.ts first.");
    return 1;
  }

  const state = store.state();
  if (!process.env.BUCKLER_AUTH_COOKIE?.trim()) {
    console.error("[buckler] BUCKLER_AUTH_COOKIE が未設定です (.env に設定してください)。");
    return 2;
  }
  const client = new BucklerClient(
    process.env.BUCKLER_AUTH_COOKIE ?? "",
    mode === "backfill" ? BACKFILL_PACING : DAILY_PACING
  );
  console.log(`[buckler] ${mode} sync: ${targets.length} players (data: ${store.dir})`);

  let exitCode = 0;
  state.lastError = null;
  state.lastErrorMessage = null;
  try {
    for (const [sflKey, { cfnId }] of targets) {
      const result = await syncPlayer(client, store, sflKey, cfnId, sflKeyByCfn, mode);
      state.players[sflKey] = result;
      store.saveState(state);
      console.log(
        `[buckler]   ${sflKey}: +${result.newMatches} matches${result.gap ? " (gap: 未取得の試合がある可能性)" : ""} [${client.requestCount} req]`
      );
    }
    if (!only) await syncDia(client, store, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof BucklerBudgetError) {
      console.warn(`[buckler] ${message}. 残りは次回の実行で続きから取得します。`);
    } else if (err instanceof BucklerAuthError) {
      state.lastError = "auth";
      state.lastErrorMessage = message;
      console.error(`[buckler] 認証切れ: ${message}。ブラウザで再ログインし、BUCKLER_AUTH_COOKIE を更新してください。`);
      exitCode = 2;
    } else if (err instanceof BucklerBlockedError) {
      state.lastError = "blocked";
      state.lastErrorMessage = message;
      console.error(`[buckler] 取得を中止しました: ${message}`);
      exitCode = 3;
    } else {
      throw err;
    }
  } finally {
    state.lastRunAt = new Date().toISOString();
    state.lastMode = mode;
    state.lastRequests = client.requestCount;
    store.saveState(state);
  }
  console.log(`[buckler] done (${client.requestCount} requests).`);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSync().then(
    (code) => process.exit(code),
    (err) => {
      console.error("[buckler] unexpected error", err);
      process.exit(1);
    }
  );
}
