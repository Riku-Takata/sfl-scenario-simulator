# SFL Fan Engagement Analytics — 実装計画（既存シミュレーターへの組み込み）

- 作成日: 2026-10-30
- 元資料: `SFL_Fan_Engagement_Implementation_Design_v2.md`（以下「設計書」。§番号は設計書のもの）
- 状態: Draft（Phase 0 着手前）

設計書の方針（本文を保存・表示しない、集計値だけを開示制御して出す、Flovia を Adapter の背後に置く）はそのまま守る。
変えるのは**技術スタックと配置**で、既存の sfl-scenario-simulator の構成（Astro SSG + Zod + TypeScript スクリプト + 自宅サーバー限定の収集）に合わせる。

---

## 1. 設計書からの変更点（スタック）

| 設計書 | 本計画 | 理由 |
|---|---|---|
| FastAPI Read API | **静的JSON + Astro ページ**（API サーバーを持たない） | サイトは Vercel / HomeServer の静的配信。§9.2「公開側から Flovia を呼ぶ経路を持たない」が構造的に保証される。キャッシュ無効化も不要 |
| PostgreSQL 16 | **SQLite（Node 24 組み込み `node:sqlite`）** を `D:\HomeServer\data\app-data\sfl-fan-engagement\fan.sqlite` に置く | 書き手は自宅サーバーの定期バッチ1つだけ。advisory lock はロックファイル + `BEGIN IMMEDIATE` で代替。依存追加なし |
| Python / NumPy / SciPy | **TypeScript の純関数**（`src/lib/fan/`） | ブートストラップ B=1000 × 12チーム程度は TS で十分速い。既存の `createSeededRng`（`src/lib/simulator.ts:430`）と同じ方式でシード固定 |
| Next.js | **Astro ページ + React Island** | 既存 UI・スタイル・チーム色（`standings.json`）を流用 |
| APScheduler / cron | **Windows タスクスケジューラ**（`register-sfl-*-task.ps1` と同じ型） | Buckler 連携と同じく、Flovia キー・投稿ID・HMAC 鍵を GitHub Actions に置かない |
| `match_events` 手入力 | **`src/data/matches.json` から導出** | 全60試合の日時・対戦カード・勝敗が既にある |
| `teams` / 選手名 | **`standings.json` / `master-players.json` から生成** | 12チーム・48選手が既にある。表記揺れ・公式タグだけ手で足す |

Buckler 連携（`scripts/buckler/`, README「Buckler (ランクマ) 連携」）が「自宅サーバーで非公開データを取り、集計値だけを公開する」の前例なので、これと同じ型にする。

## 2. Git に入れるもの・入れないもの

**Flovia から取ったデータは Git に入れない。ローカルで分析した結果（開示制御済みの集計値）だけを Git に入れる。** Buckler 連携と同じ型にする。

| 置き場所 | 中身 |
|---|---|
| ローカルのみ `D:\HomeServer\data\app-data\sfl-fan-engagement\` | `fan.sqlite`（投稿ID・ハッシュ化した著者ID・投稿ごとの分類とメトリクス・収集ログ・operation_id）、`review_buffer`（暗号化済み本文、24時間）、実行ログ、`publish-repo/`（公開用の専用クローン） |
| Git（`src/data/`） | `fan-engagement.json`（§8。開示制御を済ませた集計スナップショット）、`fan-teams.json`（検索語・表記揺れ。公開情報だけ） |
| Git（`docs/`） | Methodology、分類精度（件数と precision/recall の集計だけ）、`provider-verification.md`（本文・投稿ID・ユーザー名はマスクする） |
| どこにも保存しない | 投稿本文（メモリ上だけ。レビュー用の暗号化バッファを除く）、生の著者ID・ユーザー名 |

- 投稿ごとの分類結果は「集計値」ではなく個別投稿のデータなので、ローカルに置く。
- 公開は `scripts/fan/publish.ts` が `publish-repo` から `src/data/fan-engagement.json` だけを commit / push する（Buckler の `buckler-profiles.json` と同じ）。push 前に `FanSnapshotSchema` で検証し、§9 の漏えい検査も通す。通常の GitHub Actions・Vercel・HomeServer リリースの流れはそのまま使える。
- `.gitignore` に保険として `*.sqlite` と `fan-raw*` を足す。

**公開の扱い（決定 2026-10-30）:** このリポジトリは PUBLIC なので、`fan-engagement.json` を push した時点で集計値は一般公開になる。**Flovia の書面回答が来るまで push しない。**
- `FAN_PUBLISH` の既定は `false`。`publish.ts` は false のとき commit も push もせず、ローカルの `snapshots/` に書き出すだけにする。
- それまでの確認は HomeServer 上のローカルビルドで行う。ビルドは環境変数 `FAN_ENGAGEMENT_SNAPSHOT`（リポジトリ外のファイルパス）があればそこから読み、なければ `src/data/fan-engagement.json` を読む。リポジトリ内にファイルを置かないので、誤ってコミットされることがない。
- Flovia から許可が出たら、回答を `docs/provider-verification.md` に記録し、`FAN_PUBLISH=true`・`PUBLIC_FAN_PAGES=true` にする（Phase 7）。許可が出なければ、Adapter を X 公式 API など別の Provider に差し替える（設計書 ADR-001）。

## 3. 配置

```text
apps/sfl-scenario-simulator/
├── scripts/fan/                       # 自宅サーバー専用（Buckler と同じ扱い）
│   ├── providers/
│   │   ├── types.ts                   # XSearchProvider / EphemeralPost / SearchPage（§4.4 を TS 化）
│   │   ├── flovia-mcp.ts              # MCP Streamable HTTP クライアント（fetch で JSON-RPC tools/call）
│   │   └── mock.ts                    # 空ページ・429・5xx・不明・重複・カーソル不整合を再現
│   ├── store.ts                       # SQLite 接続・migration・保持期限の削除
│   ├── migrations/001_init.sql        # §8.2 のテーブル（本文列なし）
│   ├── budget.ts                      # flovia_status による予算ガード、消費率の学習
│   ├── collect.ts                     # run → team → page。operation_id の永続化と再送
│   ├── ephemeral-buffer.ts            # 本文をメモリ上だけで保持。toJSON/inspect をマスク。10分タイムアウト
│   ├── classify.ts                    # matcher → LLM 分類 → upsert → 本文破棄
│   ├── classifier/
│   │   ├── types.ts                   # Classifier インターフェース（テスト用の Mock と差し替え可能）
│   │   ├── claude-cli.ts              # `claude -p` を子プロセスで起動して分類する（§6）
│   │   └── prompt.ts                  # システムプロンプト・JSON Schema（prompt_version を持つ）
│   ├── score.ts                       # DB → src/lib/fan で計算 → スナップショット書き出し
│   ├── publish.ts                     # publish-repo から src/data/fan-engagement.json だけを push
│   ├── review-server.ts               # 127.0.0.1 限定の一時レビュー画面（§5.5）
│   └── run.ts                         # collect → classify → score を1回実行（タスクスケジューラから）
├── src/lib/fan/                       # 純関数（DB・ネットワークに触れない。テスト対象の中心）
│   ├── schema.ts                      # 分類出力・スナップショット・breakdown の Zod スキーマ
│   ├── matcher.ts                     # 検索語辞書による候補チーム抽出（§5.1-1）
│   ├── query.ts                       # team_search_terms → X検索クエリ
│   ├── aggregate.ts                   # 投稿者ごとの寄与上限 K=3、N_rel/N_sup/U_sup 等
│   ├── scoring.ts                     # V/T/P、縮小推定、パーセンタイル正規化、S と寄与
│   ├── bootstrap.ts                   # 投稿者単位ブートストラップ（シード固定）
│   ├── rank-band.ts                   # 信頼区間の重なりによる順位帯
│   ├── quality.ts                     # sufficient / reference / limited / insufficient / stale
│   └── disclosure.ts                  # n<10 抑制、補完抑制、丸め、suppressed_fields
├── src/data/fan-teams.json            # チームごとの検索語・表記揺れ（公開情報のみ。コミット可）
├── src/pages/fans/index.astro         # ランキング
├── src/pages/fans/[teamId].astro      # チーム詳細
├── src/pages/fans/methodology.astro   # Methodology
├── src/components/fan/                # FanLeaderboard.tsx, ScoreBar, CiBar, BreakdownCharts
└── tests/fan-*.test.ts                # npm test に追加
```

HMAC 鍵・Flovia キー・レビュー暗号鍵は `apps/sfl-scenario-simulator/.env`（gitignore 済み）に置く。

## 4. Flovia Adapter（Phase 0 で確認済みの点を反映）

公開サーバーカード（`https://api.flovia.dev/.well-known/mcp/server-card.json`、2026-10-30 取得）で、§4.1 の項目 3 と 4 の一部が埋まった。

- X 系ツールは1つ: **`flovia_x`**。`action` で切替（`search_recent` / `count_recent` / `post` / `quote_posts` / `user_posts` …）。
- 必須引数: **`request_text`（1〜8192字）と `purpose`（1〜500字）**。どちらも Flovia が保持・共有し得るので、**両方とも固定の汎用文**にする（例: `request_text`=「公開投稿の件数集計のための検索」、`purpose`=「SFLチーム別の公開投稿の集計」）。チーム名や研究情報は `query` 以外に入れない。
- `max_results` は search_recent で 10〜100。カーソルは `cursor`（前回の `next_cursor`、200字以内）。差分取得には `since_id` が使える → `collection_checkpoints.cursor` に加えて `last_post_id` を持つ。
- `start_time` / `end_time`（UTC、直近7日以内）、`sort_order=recency`、`count_recent` の `granularity`（minute/hour/day）。
- `operation_id` は引数として渡せる（冪等キー）。
- 予算は `flovia_status`（five_hour / week の `used_pct`, `resets_at`）。
- **未確認（実呼び出しで確認する）**: 返却フィールド、特にエンゲージメント数。検索演算子（`lang:` `-is:retweet` `OR`）が使えるか。1呼び出しあたりの消費率。`max_size` の意味。

`flovia-mcp.ts` の流れ:
1. `initialize` → セッションID（`Mcp-Session-Id`）を保持。
2. `tools/call name=flovia_status` で予算チェック。
3. `tools/call name=flovia_x {action:"search_recent", query, max_results:100, cursor|since_id, sort_order:"recency", operation_id, request_text, purpose}`。
4. レスポンスを `EphemeralPost` に正規化する。**このときに** 著者IDを `HMAC-SHA256(AUTHOR_HMAC_SECRET_<season>, id)` に変換し、ユーザー名・表示名は捨てる。
5. HTTP 429 / 上限 → `RetryAt` 付きエラー、5xx・タイムアウト → `Unknown` エラー、401/403 → `Config` エラーに分類して Collector に返す（再送判断は Collector がする）。

## 5. 収集・分類パイプライン

```text
run.ts
 ├─ ロックファイル取得（取れなければ終了）
 ├─ budget: five_hour >= 70% or week >= 60% → skip 記録
 ├─ for team in 対象チーム:
 │    for page in 1..MAX_PAGES_PER_TEAM_PER_RUN (3):
 │      op_id = sha256(run_id, team_id, page_no) を collection_pages に pending で INSERT
 │      provider.search_recent(...)   ← 5xx/不明は同じ op_id で最大3回、なお不明なら status=unknown で次回へ
 │      buffer = EphemeralBuffer(posts)          ← 本文はここだけ
 │      重複排除: observed_posts に既にある post_id を除く／同文面は正規化テキストのハッシュで1件に（ハッシュは保存しない）
 │      matcher → 候補チーム（ルール）
 │      LLM 分類（候補チームごと、ラベルとコードだけを返す）
 │      トランザクション: observed_posts, post_team_classifications, post_metrics_snapshots を upsert
 │                       collection_pages=committed, checkpoint を進める
 │      buffer.discard()
 ├─ 期限切れ削除（observed_posts.expires_at、review_buffer 24h、収集ログ180日）
 └─ score.ts → スナップショット書き出し
```

- 分類失敗は `uncertain` にせず `classification_failures(run_id, team_id, count)` に件数だけ残す（§11）。
- 本文の漏えい防止は**型で縛る**: `EphemeralPost.text` を `SecretText` クラスで包み、`toString` / `toJSON` / `util.inspect.custom` が `"[REDACTED]"` を返すようにする。LLM へ渡すときだけ `reveal()` を呼ぶ。
- 実行時刻: 設計書は JST 02:00 / 14:00。SFL の放送が火・金夜なので、**水・土 02:00 と毎日 14:00** を初期値にする（既存の recap worker 03:00/13:00/20:00 と重ならない）。

## 6. 分類: Claude Code CLI を自宅サーバーで呼び出す

**API は使わない。** 自宅サーバーにログイン済みの Claude Code CLI（2026-10-30 時点 2.1.158）を、`run.ts` から子プロセスとして起動する。既存の recap 執筆で Codex CLI を「隔離した作業フォルダ・ツール不使用」で呼んでいるのと同じ型にする。

### 6.1 呼び出し方

```text
cwd: data/app-data/sfl-fan-engagement/classifier-sandbox/   （空のフォルダ。CLAUDE.md・設定ファイルを置かない）
claude -p
  --no-session-persistence           # 会話を ~/.claude/projects に保存しない（本文がディスクに残るのを防ぐ）
  --tools ""                         # 組み込みツールを全部無効にする（ファイル・シェル・Web なし）
  --strict-mcp-config --mcp-config '{"mcpServers":{}}'   # MCP サーバーを読み込まない（要動作確認）
  --setting-sources project          # ユーザー設定の hooks・プラグインを読み込まない（hook が入力を記録するのを防ぐ）
  --system-prompt-file prompt.md     # 既定のシステムプロンプトを置き換える（分類指針 §5.4 と出力規則だけ）
  --output-format json --json-schema <§5.2 の配列スキーマ>
  --model <評価で決める>
  stdin: 分類対象のバッチ（本文はコマンドライン引数に入れない。プロセス一覧に出るため）
```

- `--bare` は使えない。bare モードは `ANTHROPIC_API_KEY` だけで認証し、ログイン（OAuth）を読まないため。
- 入力には投稿ID・著者IDを入れない。バッチ内の一時番号（`#1`〜`#25`）と本文と候補チームだけを渡し、返ってきた番号を呼び出し側で投稿に結び付ける。
- 1回あたり 20〜25投稿をまとめて送る（起動のオーバーヘッドと利用枠の節約）。返ってきた JSON は Zod で検証する。番号の欠け・重複・`reason` の自由記述などで検証に落ちたバッチは、半分に分けて1回だけ再試行し、それでも落ちた分は「分類失敗」として件数だけ記録する。
- 子プロセスの stdout / stderr はメモリ上で受け取る。ログには終了コード・所要時間・件数だけを書き、stderr の中身は書かない（本文の断片が混ざり得るため）。
- タイムアウトは1バッチ 120秒。利用上限に当たったら（CLI が上限のメッセージを返したら）その実行の分類を止める。未分類の本文は再取得できないので、**分類が止まったページは `collection_pages` を committed にせず**、チェックポイントも進めない。次回、同じ範囲を取り直す（Flovia の消費は増えるが、データは欠けない）。
- `classifier_version` = `claude-cli:<model>:<prompt_version>`。

### 6.2 実装前に確認すること

1. **学習への利用設定**（設計書 §5.5）: サブスクリプションのログインで使う Claude Code は、claude.ai のアカウント設定（プライバシー設定の「Claude の改善に協力する」）に従う。**この設定がオフになっていることを確認し、`docs/provider-verification.md` に記録する。** オンのままだと設計書の条件を満たさない。
2. **ディスクに本文が残らないこと**: `--no-session-persistence` を付けても `~/.claude/` 配下（projects・debug ログ・shell snapshot 等）に入力が書かれないことを、目印文字列を入れたダミー入力で確かめる。これを §9 の漏えいテストに加える。
3. **利用枠の共有**: サブスクリプションの利用上限は、普段の対話での利用と共有になる。1日の分類量（MVP 3チームで最大 約1,800件 → 25件ずつで約70回）が日常の作業を圧迫しないか、最初の2週間の実測で確認する。分類の実行は、普段使わない時間帯（02:00）に寄せる。
4. **フラグの動作**: `--strict-mcp-config` / `--setting-sources project` を組み合わせても、ログイン情報で認証できること。

### 6.3 評価

一時レビュー画面（§5.5）で 3チーム × 約100件に人手ラベルを付け、モデル（`haiku` / `sonnet` など）とプロンプトの組み合わせを比べて決める。受け入れの目安は設計書 §12.2 のとおり（応援判定 precision ≥ 0.90、チーム同定 precision ≥ 0.95、reason_code macro-F1 ≥ 0.70）。

## 7. スコア計算で設計書を補う点

実装前に決めておかないと、実装ごとに解釈が分かれる箇所。

1. **正規化基準の時間窓を揃える**（§6.4）: 基準分布は「日次値」だが、ランキングは7日窓。7日窓の V をそのまま日次分布に当てるとパーセンタイルが常に高くなる。→ **基準分布は「毎日計算した直近7日窓の値」28日分 × 全チーム**にする（窓の長さを揃える）。
2. **ブートストラップで再標本化する集合**（§6.6）: 「応援者を復元抽出」だと P の分母（関連投稿）が動かない。→ **関連投稿を1件以上持つ投稿者全体**（ハッシュ化ID）を復元抽出し、V/T/P/S をまとめて再計算する。
3. **エンゲージメントの観測時点**（§6.3）: `since_id` の差分取得では各投稿を1回しか見ないため、投稿直後に取った投稿ほど like が少ない。→ `post_metrics_snapshots` に投稿からの経過時間を持たせ、T には「観測時点で投稿後 12 時間以上経っていた投稿」だけを使う。そもそも Flovia がエンゲージメント数を返さなければ `T = mean(h)` で確定。
4. **winsorize と E_ref の単位**: 「当日の95パーセンタイル」→ **集計窓内の全チームの95パーセンタイル**。`E_ref` は基準期間の e* の中央値。
5. **順位帯**: 「直前の帯の代表チーム」→ **帯の先頭チーム**と信頼区間が重なれば同じ帯に入れる（貪欲法、先頭から）。
6. **補完抑制**: 「合計 = 部分の和」の関係（例: `relevant = support + neutral + criticism`、時間帯セルの和 = support）を `disclosure.ts` に**加法グループとして宣言**し、各グループで抑制セルがちょうど1つなら次に小さいセルも抑制する。leaderboard の `counts` と breakdown の分布は同じグループ定義を共有する。
7. **少数窓**: 28日未満は利用できる期間の基準を使い `baseline_provisional=true`（品質 `reference`）。

これらは `docs/fan-engagement-methodology.md`（Methodology ページの元）に書き、`score_version` を `v2.0` で固定する。

## 8. 公開データの形

スナップショットは設計書 §9.1 のレスポンスと同じ形のJSONを `src/data/fan-engagement.json` の1ファイルにまとめる（Git に入るのはこれだけ。Astro ページはこれを読むだけ）。

```text
fan-engagement.json
  meta: { generatedAt, scoreVersion, baselineVersion, classifierVersion, disclaimer, dataStatus }
  windows: { "7d": { leaderboard: [...], teams: { [teamKey]: breakdown } } }
  timeseries: { [teamKey]: [{ date, score, ci, quality }] }   # 28日
  methodology: { weights, thresholds, classifierEval }
```

- Zod スキーマ（`src/lib/fan/schema.ts`）で**生成時とビルド時の両方**で検証する（既存データと同じ）。スキーマに本文・URL・投稿ID・ハッシュ化IDのフィールドを持たせないので、混入したら検証で落ちる。
- 「試合週」「シーズン累計」の窓（§10.1）は MVP では出さない（Flovia は直近7日しか取れず、シーズン累計は保存済み分類から再計算になるため Phase 7 で）。

## 9. テスト

`npm test` に追加し、既存の `node --test` で回す。

| ファイル | 内容 |
|---|---|
| `tests/fan-scoring.test.ts` | 寄与上限、縮小推定（N_rel=0）、パーセンタイル正規化、S と寄与の和、ブートストラップの再現性（シード固定）、順位帯 |
| `tests/fan-disclosure.test.ts` | n<10 抑制、補完抑制、丸め（243→240）、`suppressed_fields` |
| `tests/fan-collector.test.ts` | Mock Provider で 429 / 5xx / 不明 / 重複 / 空ページ、同じ `operation_id` の再利用、中断からの再開 |
| `tests/fan-leakage.test.ts` | 作例テキスト（目印文字列入り）を流し、SQLite の全テーブル・ログ出力・例外メッセージ・スナップショットJSONに目印が無いこと。生の著者IDが Adapter の外に出ないこと |
| `tests/fan-classifier.test.ts` | Claude CLI の呼び出しを偽の子プロセスで置き換え、引数（`--no-session-persistence` `--tools ""` 等）が必ず付くこと、本文が argv に入らず stdin だけで渡ること、検証に落ちた出力の分割再試行、上限到達時にページを committed にしないこと |
| 手動（Phase 4 で1回） | 実際の `claude -p` に目印入りのダミー投稿を渡し、`~/.claude/` 配下と classifier-sandbox に目印が残らないこと |

フィクスチャは作例テキストのみ（実投稿はコミットしない）。

## 10. ロードマップ（PR 単位）

| # | PR | 内容 | 前提 |
|---|---|---|---|
| 0 | （コードなし） | Flovia 登録、`flovia_status` 確認、search_recent を1〜3回試し返却フィールド・演算子・消費率を `docs/provider-verification.md` に記録（本文はマスク）。§2.2 の3点を書面で問い合わせ | ユーザーが登録・問い合わせ |
| 1 | `fan: pure scoring library` | `src/lib/fan/*` とテスト。§7 の補足を含む | なし（今すぐ着手可） |
| 2 | `fan: store, mock provider, collector` | SQLite migration、Mock、collector、予算ガード、漏えいテスト | 1 |
| 3 | `fan: Flovia MCP provider` | `flovia-mcp.ts`、実レスポンスの正規化 | Phase 0 の結果 |
| 4 | `fan: classifier + review` | matcher、`fan-teams.json`、Claude CLI 分類器、一時レビュー画面、評価セット | §6.2 の確認（学習設定・ディスク残存） |
| 5 | `fan: snapshot + pages` | score.ts、`src/data/fan-engagement.json` のスキーマ、`/fans/` 3ページ（`PUBLIC_FAN_PAGES` で出し分け） | 1, 2 |
| 6 | `fan: scheduled run + publish` | `register-sfl-fan-task.ps1`、`publish.ts`（`FAN_PUBLISH` が true のときだけ push）、監視・通知、保持期限削除 | 3, 4, 5 |
| 7 | `fan: public release` | `FAN_PUBLISH=true`・`PUBLIC_FAN_PAGES=true` にする | **Flovia の書面許可** |

PR 1 と 2 は Flovia の確認を待たずに進められる（Mock で下流を作る、設計書 §4.1 末尾の方針どおり）。

PR 1 の範囲（実装済み）: `src/lib/fan/` の types / config / stats / aggregate / baseline / scoring / bootstrap / rank-band / quality / disclosure / team-score。`matcher.ts`・`query.ts` は PR 4、Zod の `schema.ts` はスナップショットの形を決める PR 5 で足す。`stale` は閲覧時点で決まるので、スナップショットには入れず表示側で `isStale` を使う。B=1000・1,200人のブートストラップは約80ms（設計書 §12.4 の 2秒以内）。

## 11. MVP の対象チーム

決定（2026-10-30）: **`cr`（Crazy Raccoon）・`zeta`（ZETA DIVISION Geekly）・`ibsg`（FUKUSHIMA IBUSHIGIN）**。3チームとも Division S なので、試合日が同じ（火・金）で、露出量の差が出にくい。

検索語での注意（`fan-teams.json` を作るとき）:
- **ZETA DIVISION / Crazy Raccoon** はどちらも複数タイトルのチーム（VALORANT など）なので、チーム名だけでは他タイトルの投稿が大量に混ざる。チーム名は必ず SFL / SF6 関連語（`ストリートファイターリーグ` `#SFリーグ` `SF6`）との AND にする。選手名（`master-players.json` の4人ずつ）は単独でも候補に入れてよい。
- 「CR」「ZETA」の略称は単独では使わない（略称だけの投稿は matcher の候補にも入れない）。
- IBUSHIGIN は SFL 以外での曖昧さが小さい。`イブシギン` `いぶしぎん` などの表記揺れを入れる。
- チーム同定の precision はチームごとに別々に評価する（ZETA と CR が低く出る見込み）。

## 12. 残っている決めごと

1. §6.2-1 の学習設定の確認（claude.ai のアカウント設定。本人にしかできない）。
2. Flovia への書面問い合わせ（Phase 0）。回答が公開開始の条件になる。
