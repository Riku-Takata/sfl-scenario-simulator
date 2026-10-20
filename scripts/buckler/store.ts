/**
 * Buckler データのローカル保存 (自宅サーバーのみ。公開リポジトリには入れない)
 *
 *   {BUCKLER_DATA_DIR}/
 *     cfn-ids.json              SFL選手キー → CFN short ID
 *     matches/{sflKey}.jsonl    対戦ログ (1行1試合、追記のみ)
 *     snapshots/{sflKey}.jsonl  プロフィールの日次スナップショット (1行1日)
 *     stats/dia_master-{YYYYMM}.json  公式ダイアグラム (Master帯)
 *     state.json                最終実行・エラー・選手ごとの同期状況
 */
import fs from "node:fs";
import path from "node:path";
import type { BucklerDiaMonth, BucklerMatch, BucklerSnapshot } from "../../src/lib/buckler/records";

export function bucklerDataDir(): string {
  return path.resolve(
    process.env.BUCKLER_DATA_DIR ?? path.resolve(process.cwd(), "../../data/app-data/sfl-buckler")
  );
}

export interface CfnIdsFile {
  updatedAt: string;
  players: Record<string, { cfnId: string; source: string }>;
}

export interface SyncState {
  lastRunAt: string | null;
  lastMode: string | null;
  lastRequests: number;
  /** "auth" / "blocked" / null */
  lastError: string | null;
  lastErrorMessage: string | null;
  players: Record<
    string,
    {
      lastSyncAt: string;
      newMatches: number;
      /** 日次取得で10ページ遡っても既知の試合に届かなかった (取りこぼしの可能性) */
      gap: boolean;
    }
  >;
}

export class BucklerStore {
  constructor(readonly dir = bucklerDataDir()) {
    for (const sub of ["matches", "snapshots", "stats"]) {
      fs.mkdirSync(path.join(dir, sub), { recursive: true });
    }
  }

  private readJson<T>(file: string, fallback: T): T {
    const p = path.join(this.dir, file);
    return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : fallback;
  }

  private writeJson(file: string, data: unknown): void {
    const p = path.join(this.dir, file);
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + "\n", "utf8");
    fs.renameSync(tmp, p);
  }

  private readJsonl<T>(file: string): T[] {
    const p = path.join(this.dir, file);
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as T);
  }

  private appendJsonl(file: string, rows: unknown[]): void {
    if (rows.length === 0) return;
    fs.appendFileSync(
      path.join(this.dir, file),
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf8"
    );
  }

  cfnIds(): CfnIdsFile {
    return this.readJson<CfnIdsFile>("cfn-ids.json", { updatedAt: "", players: {} });
  }

  saveCfnIds(data: CfnIdsFile): void {
    this.writeJson("cfn-ids.json", data);
  }

  state(): SyncState {
    return this.readJson<SyncState>("state.json", {
      lastRunAt: null,
      lastMode: null,
      lastRequests: 0,
      lastError: null,
      lastErrorMessage: null,
      players: {},
    });
  }

  saveState(state: SyncState): void {
    this.writeJson("state.json", state);
  }

  matches(sflKey: string): BucklerMatch[] {
    return this.readJsonl<BucklerMatch>(`matches/${sflKey}.jsonl`);
  }

  appendMatches(sflKey: string, rows: BucklerMatch[]): void {
    this.appendJsonl(`matches/${sflKey}.jsonl`, [...rows].sort((a, b) => a.t - b.t));
  }

  snapshots(sflKey: string): BucklerSnapshot[] {
    return this.readJsonl<BucklerSnapshot>(`snapshots/${sflKey}.jsonl`);
  }

  appendSnapshot(sflKey: string, snap: BucklerSnapshot): void {
    this.appendJsonl(`snapshots/${sflKey}.jsonl`, [snap]);
  }

  dia(variant: string, month: string): BucklerDiaMonth | null {
    return this.readJson<BucklerDiaMonth | null>(`stats/${variant}-${month}.json`, null);
  }

  diaMonths(variant: string): string[] {
    return fs
      .readdirSync(path.join(this.dir, "stats"))
      .map((f) => f.match(new RegExp(`^${variant}-(\\d{6})\\.json$`))?.[1])
      .filter((m): m is string => Boolean(m))
      .sort();
  }

  saveDia(data: BucklerDiaMonth): void {
    this.writeJson(`stats/${data.variant}-${data.month}.json`, data);
  }
}
