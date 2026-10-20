# SFL 多地域対応 (AMERICAS / EMEAA) — 調査結果と設計案

> ステータス: 設計のみ合意（2026-10-20）。実装は start.gg 連携（feat/startgg-integration）のマージ後に着手する。

## 1. データ取得元の調査結果

| 地域 | 公式JSON API | 実際に使える取得元 | 状態 (2026-10-20) |
|---|---|---|---|
| JAPAN | `sf.esports.capcom.com/api/sfl2026/?data=results\|stats\|characters` | 現行どおり | 進行中 |
| EMEAA | なし（capcom APIは JP 専用。`wp-json` にも独自 post type は公開されていない） | streetfighterleague.com の HTML（WordPress） | レギュラーシーズン終了（9/2〜9/6、全30試合）。プレイオフは 10/24 ロンドン MCM |
| AMERICAS | なし | 同上。ただし 2026 シーズンのページはまだ未公開（サイトは Season 8 = 2025 のまま） | 10/23 開幕（Day1 を 10/24 とする資料もある）。決勝は 11/8 Anime Pasadena |

streetfighterleague.com で取れるもの（curl で取得可、bot ブロックなし）:
- `/standings/emeaa-2026-season-5/` … 順位、pt、勝敗、ロスター
- `/battles/season-5-emeaa-day-N/` … チーム戦ごとの HOME/AWAY、各ポイントマッチの選手・キャラ（左右）・勝者。ゲームスコアは載っていない
- `/players/<slug>-emeaa/` … 選手ごとの試合ログ。ゲームスコア（例: `3 Xian | Kimberly defeats Leshar | Terry 1`）、キャラ使用、通算成績
- `/teams/<slug>-s5-emeaa/` … チーム戦ごとのポイントマッチ勝敗（2-1 など）、battles/matches/games の集計
- `/official-rules/`（EMEAA 版）… 下記ルール

取れないもの: ラウンド数（ラウンド得失点）、勝ち抜き順の明示（ページ上の並び順で推定）。

## 2. ルール（AMERICAS/EMEAA 共通。EMEAA 公式ルールと Liquipedia で確認）
- 6チーム × 4人。毎節3人が出場。ダブルラウンドロビン（各チーム10チーム戦、全30試合）。EMEAA は5日間・1日2試合（HOME と AWAY を1回ずつ）
- 1st FT2 = 10pt、2nd FT2 = 10pt、3rd FT3 = 20pt。20-20 の場合は Extra（FT3、未出場の選手、10pt）
  → 40-0 / 30-10 / 30-20(延長) の3パターンで、JP の SCORE_OUTCOMES とそのまま一致する
- 順位決定: pt → バトル得失（=ゲーム）→ ラウンド得失 → 再戦
- 上位4チームがプレイオフ（ステップラダー）。QF: 3位vs4位 → SF: 2位vs QF勝者 → GF: 1位vs SF勝者。QF/SF は 50pt 先取、GF は 70pt 先取。優勝チームは World Championship へ
- JP は 2ディビジョン×6チームで、各ディビジョン上位3チームが PO に進む。地域ごとの差はディビジョン数・PO枠・シード特典だけなので、Config で表現できる

## 3. 設計案

### LeagueConfig（`src/lib/leagues/{jp,americas,emeaa}.ts` + `index.ts`）
```ts
type LeagueId = "jp" | "americas" | "emeaa";
interface LeagueConfig {
  id: LeagueId; label: string; seasonLabel: string;
  divisions: { id: string; label: string; color: string; seed: number }[]; // jp: s,f / 他: [{id:"main"}]
  teams: Record<string, TeamMeta>;          // TEAM_META_MAP を移動
  playerNames: Record<string, string>;      // PLAYER_NAME_MAP を移動
  scoring: { outcomes: ScoreOutcome[] };     // 全地域で同じ定義を共有
  playoff: { slots: number; perks: { rank: number; label: string }[] }; // jp: 3枠(2位HOME優先) / 他: 4枠(1位GF・2位SFシード)
  source: LeagueSourceAdapter;              // capcomJpApi | sflDotCom(manual JSON fallback)
  startggSourceEvents: { slug: string; maxPlacement: number }[];
  officialPlayerUrl(key): string;
}
```
- `DivisionIdSchema = z.enum(["s","f"])` は `z.string()` にし、`superRefine` で LeagueConfig の divisions と照合する。各 JSON に `league` フィールドを追加する
- シミュレーターのシード、「3位ボーダー」などの文言、ルート①②③ の定義を `playoff` から作る。JP の出力は今と1バイトも変わらないことをテストで固定する（JP の scenarios.json スナップショットと比較）
- `TEAM_META_MAP` / `PLAYER_NAME_MAP` は当面 `getLeague("jp").teams` の再エクスポートとして残し、依存する約25ファイルを段階的に移行する

### データ配置
- `src/data/<league>/{matches,standings,scenarios,player-stats,master-players}.json`
- JP は既存パスのまま（`src/data/*.json` を `jp` とみなす）。recap・CPT・narratives の差分を最小にするため
- 新しい地域は `src/data/americas/`、`src/data/emeaa/`
- 手入力 JSON（`src/data/<league>/manual-schedule.json`）にチーム・ロスター・日程を持たせる。スクレイプ結果があればそちらを優先する

### 取得パイプライン
- `scripts/1b-fetch-sfl-dotcom.ts --league emeaa|americas`: day ページから試合構造を、player ページからゲームスコアを取り、`matches.json` を作る。生 HTML は `raw-<league>-seed/` にキャッシュする（JP の raw-capcom-seed と同じ fallback 方式）
- ラウンド得失はデータが無いので 0 固定とし、UI では「—」と表示する
- 選手図鑑の SFL 成績（`sfl2026` ブロック）は bout から集計する。ラウンド系の指標は null 許容にする
- recap / Gemini 動画解析 / narratives は対象外（JP のみ）。後続タスクとして扱う
- GitHub Actions は現行の workflow に league ループを追加するだけにする

### ルーティング
- `src/pages/[league]/{index,simulator,players,recap?}.astro` と `[league]/team/[teamId].astro`。`getStaticPaths` で league × team を展開する
- 旧URL（`/`, `/simulator`, `/players`, `/recap`, `/team/:id`）は JP へ 308 リダイレクトする。設定は `vercel.json` の redirects と、静的ホスト（serve-static.mjs）向けの Astro `redirects` の両方に置く
- `/` は地域選択にする案と、JP にリダイレクトする案がある。タスク指示に合わせて JP リダイレクトを既定とする

### start.gg
- `SOURCE_EVENTS` を `LeagueConfig.startggSourceEvents` に移す
- EMEAA: EVO 2026、EVO France、CPT Premier（欧州・中東・アジア）、World Warrior の EMEAA 各地域
- AMERICAS: EVO 2026、CEO、Combo Breaker、CPT Premier、World Warrior の Americas 各地域
- `startgg-identities.json` は `{ jp: {...}, americas: {...}, emeaa: {...} }` にするか、キーを `league:player` にする（前者を推奨）
- EXTRA_ALIASES / TEAM_PREFIX_HINTS も league ごとに持たせる

## 4. 最初にやる地域
- EMEAA を推奨する。全試合の実データがあるので、スクレイパー・順位表・図鑑を正しく検証できる。順位表は公式の 260/250/230/200/180/140 と照合できる
- シミュレーターは残り試合 0 のため「確定」表示になる。予測が動くことは AMERICAS 開幕後に確認するか、テストで途中節までのデータを入力して確認する
- AMERICAS は手入力でロスターを入れておけば、開幕前の 0 試合状態からシミュレーターがそのまま動く

## 5. 注意点・未確定事項
- start.gg 連携（feat/startgg-integration）は未コミット・未マージ。当初の合意は「マージ後に着手」
- AMERICAS 2026 のロスター（Liquipedia 由来・未検証）
  - FlyQuest: Riddles, Samurai, JB, Bloo
  - Bait: iDom, JAK, ChrisCCH, Chris Tatarian
  - Shopify Rebellion: NuckleDu, Dual Kevin, Punk, Nephew
  - 2Game: Blaz, Brayan Job, LUGABO, shaka22
  - Red Rooster: Crossover, Craime, Caba, Uriel Velorio
  - Bandits: Enzo, NoahTheProdigy, Booce, Psycho
  - Day ごとの日程は資料によって食い違う

## 6. 実装着手時に決めること（未決）
- 取得元: streetfighterleague.com スクレイプ主＋手入力 JSON 予備で確定するか
- 最初に実装する地域: EMEAA（実データ検証向き）か AMERICAS（開幕中でシミュレーターが活きる）か
- `/` を JP リダイレクトにするか地域選択ページにするか
