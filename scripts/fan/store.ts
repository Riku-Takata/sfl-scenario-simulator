/**
 * ファン応援指数のローカル保存 (自宅サーバーのみ。公開リポジトリには入れない)
 *
 *   {FAN_DATA_DIR}/fan.sqlite
 *
 * 投稿本文の列は持たない (設計書 §8・ADR-005)。投稿ID・HMAC 化した著者キー・分類ラベル・
 * 数値だけを保存し、expires_at を過ぎたら削除する。
 * チーム・検索語は src/data/fan-teams.json (公開情報)、試合日は matches.json から読むので DB には持たない。
 */
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ClassifiedPost, EngagementCounts, ReasonCode, SupportLabel } from "../../src/lib/fan/types";
import type { QuotaStatus } from "./providers/types";

/** 7日窓 + 28日の基準期間 (Flovia の回答に応じて短縮する) */
export const POST_RETENTION_DAYS = 35;
export const RUN_LOG_RETENTION_DAYS = 180;

export function fanDataDir(): string {
  return path.resolve(
    process.env.FAN_DATA_DIR ?? path.resolve(process.cwd(), "../../data/app-data/sfl-fan-engagement")
  );
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE observed_posts (
    post_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    author_key TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX observed_posts_created_at ON observed_posts(created_at);
  CREATE INDEX observed_posts_expires_at ON observed_posts(expires_at);

  CREATE TABLE post_metrics_snapshots (
    post_id TEXT NOT NULL REFERENCES observed_posts(post_id) ON DELETE CASCADE,
    observed_at INTEGER NOT NULL,
    likes INTEGER,
    reposts INTEGER,
    replies INTEGER,
    quotes INTEGER,
    PRIMARY KEY (post_id, observed_at)
  );

  CREATE TABLE post_team_classifications (
    post_id TEXT NOT NULL REFERENCES observed_posts(post_id) ON DELETE CASCADE,
    team_key TEXT NOT NULL,
    label TEXT NOT NULL CHECK (label IN ('support','neutral','criticism','unrelated','uncertain')),
    support_strength REAL NOT NULL,
    confidence REAL NOT NULL,
    reason_code TEXT NOT NULL,
    classifier_version TEXT NOT NULL,
    classified_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, team_key, classifier_version)
  );
  CREATE INDEX post_team_classifications_team ON post_team_classifications(team_key, label);

  CREATE TABLE collection_runs (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    call_count INTEGER NOT NULL DEFAULT 0,
    quota_5h_before REAL,
    quota_5h_after REAL,
    quota_week_before REAL,
    quota_week_after REAL,
    error_code TEXT,
    retry_at TEXT
  );

  -- operation_id ごとに1行。結果不明のページを後の実行で再送するときは同じ行を使い回す
  CREATE TABLE collection_pages (
    operation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    team_key TEXT NOT NULL,
    page_no INTEGER NOT NULL,
    request_key TEXT NOT NULL,
    cursor_in TEXT,
    since_id_in TEXT,
    cursor_out TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending','committed','unknown','failed')),
    failure TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER,
    updated_at INTEGER NOT NULL,
    committed_at INTEGER
  );
  CREATE INDEX collection_pages_request ON collection_pages(request_key, status);

  -- since_id: ここまで取り切った最新の投稿ID
  -- pending_cursor / pending_upper: 取得途中の続き (上限で打ち切ったとき)。取り切ったら since_id を pending_upper に進める
  CREATE TABLE collection_checkpoints (
    team_key TEXT NOT NULL,
    query_hash TEXT NOT NULL,
    since_id TEXT,
    pending_cursor TEXT,
    pending_upper TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (team_key, query_hash)
  );

  CREATE TABLE collection_team_runs (
    run_id TEXT NOT NULL,
    team_key TEXT NOT NULL,
    pages_committed INTEGER NOT NULL DEFAULT 0,
    posts_new INTEGER NOT NULL DEFAULT 0,
    duplicates_merged INTEGER NOT NULL DEFAULT 0,
    classification_failures INTEGER NOT NULL DEFAULT 0,
    truncated INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, team_key)
  );
  `,
];

export interface Checkpoint {
  teamKey: string;
  queryHash: string;
  sinceId: string | null;
  pendingCursor: string | null;
  pendingUpper: string | null;
}

export interface PageStart {
  operationId: string;
  runId: string;
  teamKey: string;
  pageNo: number;
  requestKey: string;
  cursorIn: string | null;
  sinceIdIn: string | null;
  now: number;
}

export interface StoredClassification {
  teamKey: string;
  label: SupportLabel;
  supportStrength: number;
  confidence: number;
  reasonCode: ReasonCode;
}

export interface PageCommit {
  operationId: string;
  runId: string;
  teamKey: string;
  now: number;
  classifierVersion: string;
  cursorOut: string | null;
  itemCount: number;
  checkpoint: Checkpoint;
  /** 新しく分類した投稿 */
  newPosts: {
    postId: string;
    createdAt: number;
    authorKey: string;
    engagement: EngagementCounts | null;
    classifications: StoredClassification[];
  }[];
  /** 既に保存済みの投稿の最新エンゲージメント (分類はし直さない) */
  knownMetrics: { postId: string; engagement: EngagementCounts }[];
  duplicatesMerged: number;
  classificationFailures: number;
}

export interface RunFinish {
  finishedAt: number;
  status: string;
  callCount: number;
  quotaAfter: QuotaStatus | null;
  errorCode: string | null;
  retryAt: string | null;
}

export class FanStore {
  private constructor(readonly db: DatabaseSync) {}

  static open(file: string): FanStore {
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const store = new FanStore(db);
    store.migrate();
    return store;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const version = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // --- runs ---

  startRun(id: string, startedAt: number, quota: QuotaStatus | null): void {
    this.db
      .prepare(
        `INSERT INTO collection_runs (id, started_at, status, quota_5h_before, quota_week_before)
         VALUES (?, ?, 'running', ?, ?)`
      )
      .run(id, startedAt, quota?.fiveHourUsedPct ?? null, quota?.weekUsedPct ?? null);
  }

  finishRun(id: string, finish: RunFinish): void {
    this.db
      .prepare(
        `UPDATE collection_runs SET finished_at = ?, status = ?, call_count = ?, quota_5h_after = ?,
           quota_week_after = ?, error_code = ?, retry_at = ? WHERE id = ?`
      )
      .run(
        finish.finishedAt,
        finish.status,
        finish.callCount,
        finish.quotaAfter?.fiveHourUsedPct ?? null,
        finish.quotaAfter?.weekUsedPct ?? null,
        finish.errorCode,
        finish.retryAt,
        id
      );
  }

  /** 使用率の増分と呼び出し回数 (予算学習用)。新しい順 */
  quotaHistory(limit: number): { calls: number; fiveHourDelta: number; weekDelta: number }[] {
    const rows = this.db
      .prepare(
        `SELECT call_count, quota_5h_before, quota_5h_after, quota_week_before, quota_week_after
         FROM collection_runs
         WHERE call_count > 0 AND quota_5h_before IS NOT NULL AND quota_5h_after IS NOT NULL
           AND quota_week_before IS NOT NULL AND quota_week_after IS NOT NULL
         ORDER BY started_at DESC LIMIT ?`
      )
      .all(limit) as {
      call_count: number;
      quota_5h_before: number;
      quota_5h_after: number;
      quota_week_before: number;
      quota_week_after: number;
    }[];
    return rows.map((r) => ({
      calls: r.call_count,
      fiveHourDelta: r.quota_5h_after - r.quota_5h_before,
      weekDelta: r.quota_week_after - r.quota_week_before,
    }));
  }

  // --- pages ---

  /** 前回の実行が途中で止まって pending のまま残ったページは、結果不明として扱う */
  recoverInterruptedPages(now: number): number {
    return Number(
      this.db
        .prepare(`UPDATE collection_pages SET status = 'unknown', updated_at = ? WHERE status = 'pending'`)
        .run(now).changes
    );
  }

  /** 同じ内容のリクエストで結果不明のまま残っている operation_id (再送に使う) */
  findUnknownOperation(requestKey: string): string | null {
    const row = this.db
      .prepare(
        `SELECT operation_id FROM collection_pages WHERE request_key = ? AND status = 'unknown'
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(requestKey) as { operation_id: string } | undefined;
    return row?.operation_id ?? null;
  }

  /** 呼び出し前に pending で書き込む。既存の operation_id (結果不明の再送) なら同じ行を使い回す */
  beginPage(page: PageStart): void {
    this.db
      .prepare(
        `INSERT INTO collection_pages
           (operation_id, run_id, team_key, page_no, request_key, cursor_in, since_id_in, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
         ON CONFLICT(operation_id) DO UPDATE SET
           run_id = excluded.run_id, page_no = excluded.page_no, status = 'pending', updated_at = excluded.updated_at`
      )
      .run(
        page.operationId,
        page.runId,
        page.teamKey,
        page.pageNo,
        page.requestKey,
        page.cursorIn,
        page.sinceIdIn,
        page.now
      );
  }

  countAttempt(operationId: string): void {
    this.db.prepare(`UPDATE collection_pages SET attempts = attempts + 1 WHERE operation_id = ?`).run(operationId);
  }

  markPage(operationId: string, status: "unknown" | "failed", failure: string, now: number): void {
    this.db
      .prepare(`UPDATE collection_pages SET status = ?, failure = ?, updated_at = ? WHERE operation_id = ?`)
      .run(status, failure, now, operationId);
  }

  pageStatus(operationId: string): string | null {
    const row = this.db.prepare(`SELECT status FROM collection_pages WHERE operation_id = ?`).get(operationId) as
      | { status: string }
      | undefined;
    return row?.status ?? null;
  }

  // --- checkpoints ---

  getCheckpoint(teamKey: string, queryHash: string): Checkpoint {
    const row = this.db
      .prepare(
        `SELECT since_id, pending_cursor, pending_upper FROM collection_checkpoints
         WHERE team_key = ? AND query_hash = ?`
      )
      .get(teamKey, queryHash) as
      | { since_id: string | null; pending_cursor: string | null; pending_upper: string | null }
      | undefined;
    return {
      teamKey,
      queryHash,
      sinceId: row?.since_id ?? null,
      pendingCursor: row?.pending_cursor ?? null,
      pendingUpper: row?.pending_upper ?? null,
    };
  }

  saveCheckpoint(cp: Checkpoint, now: number): void {
    this.db
      .prepare(
        `INSERT INTO collection_checkpoints (team_key, query_hash, since_id, pending_cursor, pending_upper, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_key, query_hash) DO UPDATE SET since_id = excluded.since_id,
           pending_cursor = excluded.pending_cursor, pending_upper = excluded.pending_upper,
           updated_at = excluded.updated_at`
      )
      .run(cp.teamKey, cp.queryHash, cp.sinceId, cp.pendingCursor, cp.pendingUpper, now);
  }

  // --- posts ---

  knownPostIds(postIds: readonly string[]): Set<string> {
    const known = new Set<string>();
    const stmt = this.db.prepare(`SELECT 1 FROM observed_posts WHERE post_id = ?`);
    for (const id of postIds) if (stmt.get(id)) known.add(id);
    return known;
  }

  /** 分類結果・チェックポイント・ページ状態を1つのトランザクションで書く */
  commitPage(commit: PageCommit): void {
    this.transaction(() => {
      const insertPost = this.db.prepare(
        `INSERT OR IGNORE INTO observed_posts (post_id, created_at, author_key, first_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      const insertMetrics = this.db.prepare(
        `INSERT OR REPLACE INTO post_metrics_snapshots (post_id, observed_at, likes, reposts, replies, quotes)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insertClassification = this.db.prepare(
        `INSERT OR REPLACE INTO post_team_classifications
           (post_id, team_key, label, support_strength, confidence, reason_code, classifier_version, classified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const writeMetrics = (postId: string, e: EngagementCounts) =>
        insertMetrics.run(postId, commit.now, e.likes, e.reposts, e.replies, e.quotes);

      for (const post of commit.newPosts) {
        insertPost.run(
          post.postId,
          post.createdAt,
          post.authorKey,
          commit.now,
          post.createdAt + POST_RETENTION_DAYS * 86_400_000
        );
        if (post.engagement) writeMetrics(post.postId, post.engagement);
        for (const c of post.classifications) {
          insertClassification.run(
            post.postId,
            c.teamKey,
            c.label,
            c.supportStrength,
            c.confidence,
            c.reasonCode,
            commit.classifierVersion,
            commit.now
          );
        }
      }
      for (const m of commit.knownMetrics) writeMetrics(m.postId, m.engagement);

      this.db
        .prepare(
          `UPDATE collection_pages SET status = 'committed', cursor_out = ?, item_count = ?, failure = NULL,
             updated_at = ?, committed_at = ? WHERE operation_id = ?`
        )
        .run(commit.cursorOut, commit.itemCount, commit.now, commit.now, commit.operationId);
      this.saveCheckpoint(commit.checkpoint, commit.now);
      this.db
        .prepare(
          `INSERT INTO collection_team_runs
             (run_id, team_key, pages_committed, posts_new, duplicates_merged, classification_failures)
           VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT(run_id, team_key) DO UPDATE SET
             pages_committed = pages_committed + 1,
             posts_new = posts_new + excluded.posts_new,
             duplicates_merged = duplicates_merged + excluded.duplicates_merged,
             classification_failures = classification_failures + excluded.classification_failures`
        )
        .run(
          commit.runId,
          commit.teamKey,
          commit.newPosts.length,
          commit.duplicatesMerged,
          commit.classificationFailures
        );
    });
  }

  markTeamTruncated(runId: string, teamKey: string, truncated: boolean): void {
    this.db
      .prepare(
        `INSERT INTO collection_team_runs (run_id, team_key, truncated) VALUES (?, ?, ?)
         ON CONFLICT(run_id, team_key) DO UPDATE SET truncated = excluded.truncated`
      )
      .run(runId, teamKey, truncated ? 1 : 0);
  }

  /** 集計窓 [fromMs, toMs) のチームの分類済み投稿 (エンゲージメントは最新の観測値) */
  classifiedPosts(teamKey: string, fromMs: number, toMs: number, classifierVersion: string): ClassifiedPost[] {
    const rows = this.db
      .prepare(
        `SELECT p.post_id, p.created_at, p.author_key, c.label, c.support_strength, c.reason_code,
                m.observed_at, m.likes, m.reposts, m.replies, m.quotes
         FROM post_team_classifications c
         JOIN observed_posts p ON p.post_id = c.post_id
         LEFT JOIN post_metrics_snapshots m ON m.post_id = p.post_id AND m.observed_at = (
           SELECT MAX(observed_at) FROM post_metrics_snapshots WHERE post_id = p.post_id)
         WHERE c.team_key = ? AND c.classifier_version = ? AND p.created_at >= ? AND p.created_at < ?
         ORDER BY p.created_at, p.post_id`
      )
      .all(teamKey, classifierVersion, fromMs, toMs) as {
      post_id: string;
      created_at: number;
      author_key: string;
      label: SupportLabel;
      support_strength: number;
      reason_code: ReasonCode;
      observed_at: number | null;
      likes: number | null;
      reposts: number | null;
      replies: number | null;
      quotes: number | null;
    }[];
    return rows.map((r) => ({
      postId: r.post_id,
      teamKey,
      authorKey: r.author_key,
      createdAt: r.created_at,
      label: r.label,
      supportStrength: r.support_strength,
      reasonCode: r.reason_code,
      engagement:
        r.observed_at === null ? null : { likes: r.likes, reposts: r.reposts, replies: r.replies, quotes: r.quotes },
      engagementAgeHours: r.observed_at === null ? null : (r.observed_at - r.created_at) / 3_600_000,
    }));
  }

  /** 保持期限を過ぎた投稿 (分類・メトリクスはカスケード) と古い収集ログを削除する */
  deleteExpired(now: number): { posts: number; runs: number } {
    return this.transaction(() => {
      const posts = Number(this.db.prepare(`DELETE FROM observed_posts WHERE expires_at < ?`).run(now).changes);
      const cutoff = now - RUN_LOG_RETENTION_DAYS * 86_400_000;
      const oldRuns = `SELECT id FROM collection_runs WHERE started_at < ?`;
      this.db
        .prepare(`DELETE FROM collection_pages WHERE status != 'unknown' AND run_id IN (${oldRuns})`)
        .run(cutoff);
      this.db.prepare(`DELETE FROM collection_team_runs WHERE run_id IN (${oldRuns})`).run(cutoff);
      const runs = Number(this.db.prepare(`DELETE FROM collection_runs WHERE started_at < ?`).run(cutoff).changes);
      return { posts, runs };
    });
  }
}
