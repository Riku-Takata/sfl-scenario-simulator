# SFL 2026 シナリオ推定 ＆ 順位シミュレーター (Astro + Zod + start.gg Predictor)

**ストリートファイターリーグ: Pro-JP 2026 (Division S / Division F)** の公式試合結果と **start.gg に記録された直近1年のプレミア大会（CPT Premier / World Warrior / EVO 等）での全48選手の実戦データ** を統合し、各チームの「1位突破」「2位準決勝HOME権確保」「3位プレイオフ滑り込み」「次節の他力本願応援ガイド」および「HOME後出し被せ最適オーダー予測」を自動推計・可視化するハイブリッドWebアプリケーションです。

---

## 主な特徴

1. **Astro + React Islands + Zod による高速・型安全な静的サイト生成 (SSG)**
   - フロントエンドを **Astro (`output: "static"`) + `@astrojs/react`** で構築し、初期表示は超高速な静的HTML、インタラクティブな順位表・シミュレーター部分のみをReact Island (`client:load`) としてハイドレーションします。
   - すべてのJSONデータ（試合結果・順位表・選手マスタ・キャラ相性行列・start.gg プレミア大会実戦・選手戦績・シナリオ推計）を **`src/lib/schema.ts` の Zod スキーマ** でパイプライン生成時およびビルド時に厳密検証します。
   - **Vercel** へそのままゼロコンフィグで静的デプロイ可能でありつつ、**HomeServer (`D:\HomeServer`)** の Docker Compose (`normal` プロファイル, `127.0.0.1:3002`) でも軽量Node静的サーバー (`scripts/serve-static.mjs`) として常時稼働します。

2. **キャラ相性 × 選手対キャラ戦績 × H2H・Elo 勝敗予測エンジン (`src/lib/predictor.ts`)**
   - **① マクロ相性 ($\text{Matchup}(X, Y)$)**: 手設定の相性傾向（40ゲーム相当の事前分布）に、SFL公式戦と start.gg プレミア大会でキャラが登録されたゲームを加えてベイズ平滑化（$\alpha = 20, p_0 = 0.50$）した $28 \times 28$ キャラ相性マトリクス (`src/data/cpt-matchups-top96.json`。ファイル名は互換のため据え置き)。
   - **② 選手固有の対キャラ熟練度 ($\text{PlayerVsChar}(A, Y)_{\text{All}}$)**: SFL公式APIの選手別 `vs_char` / `use_char` 戦績と start.gg の対キャラ実戦を統合した全48選手の対キャラデータ (`src/data/player-stats.json`)。
   - **③ 直接対決・Elo・HOME後出し被せ補正 ($\text{H2H}(A, B)$)**: SFL公式戦と start.gg プレミア大会での選手間の直接対決・Eloレーティング（手設定の事前値を start.gg のパフォーマンスレーティングで更新）・SFL特有の「HOME側（後出しカウンターピック）アドバンテージ」を統合。
   - これらを重み付け合算（$w_1 = 0.40, w_2 = 0.35, w_3 = 0.25$）し、未消化カードの先鋒(10pt)・中堅(10pt)・大将(20pt)・延長(10pt)の最適被せオーダーと8通りのスコア確率分布を算出してモンテカルロ5,000回試行へ反映します。

---

## ディレクトリ構成

```text
apps/sfl-scenario-simulator/
├── astro.config.mjs               # Astro SSG + React 設定
├── Dockerfile                     # HomeServer用マルチステージDockerビルド
├── package.json
├── scripts/
│   ├── 0a-fetch-startgg.ts        # start.gg から48選手の直近1年プレミア大会の実戦を差分取得 (Zod検証)
│   ├── 0-fetch-cpt-data.ts        # SFL公式シード + start.gg プロファイルからキャラ相性 & 48選手戦績を生成 (Zod検証)
│   ├── startgg/                   # start.gg GraphQL クライアント・選手対応付け候補の生成
│   ├── 1-fetch-results.ts         # SFL 2026 公式APIから全60試合・順位表を取得 (Zod検証)
│   ├── 2-calc-scenarios.ts        # CPT予測エンジン連携モンテカルロ5,000回試行 & 4大シナリオ推計 (Zod検証)
│   ├── 3-generate-narratives.ts   # agy CLI / Gemini API / 決定論エンジンによる解説生成 (Zod検証)
│   ├── run-pipeline.ts            # 0 -> 1 -> 2 -> 3 一括実行オーケストレーター
│   └── serve-static.mjs           # Dockerコンテナ用 軽量静的配信 & /api/health サーバー
├── src/
│   ├── data/
│   │   ├── master-players.json    # 全48選手マスタ (メイン/サブキャラ・start.gg slug・Elo)
│   │   ├── cpt-matchups-top96.json# CPT Top 96 28x28 キャラ相性マトリクス (ベイズ平滑化済)
│   │   ├── player-stats.json      # 全48選手のSFL+CPT 対キャラ・使用キャラ・H2H戦績
│   │   ├── matches.json           # SFL 2026 全60試合データ
│   │   ├── standings.json         # Division S / F 順位表
│   │   └── scenarios.json         # 全12チームの4大シナリオ・星取表・次節被せオーダー予測
│   ├── lib/
│   │   ├── schema.ts              # 全データ構造の Zod スキーマ定義 (Single Source of Truth)
│   │   ├── types.ts               # z.infer による TypeScript 型エクスポート
│   │   ├── predictor.ts           # CPT Top 96 × 選手戦績 × H2H 統合勝敗予測エンジン
│   │   └── simulator.ts           # SFL公式タイブレーク計算・モンテカルロ推計エンジン
│   ├── layouts/
│   │   └── BaseLayout.astro       # 共通レイアウト
│   ├── pages/
│   │   ├── index.astro            # トップページ (Division S / F 順位表 & AI予測ダッシュボード)
│   │   ├── simulator.astro        # インタラクティブ順位シミュレーター & 1on1 相性カルキュレーター
│   │   ├── team/[teamId].astro    # チーム別詳細 (次節最適被せオーダー予測・4大シナリオ・星取表)
│   │   └── api/health.json.ts     # 静的ヘルスチェックエンドポイント
│   └── components/
│       ├── DivisionDashboard.tsx  # React Island: ディビジョン切替・順位表・節別結果&AI予測
│       └── InteractiveSimulator.tsx # React Island: スコア手動シミュレーター & 1on1 相性計算機
└── tests/
    └── simulator.test.ts          # Zodスキーマ・Predictor・Simulator 単体テスト
```

---

## コマンド一覧

```bash
# 開発サーバー起動 (http://localhost:3000)
npm.cmd run dev

# CPT戦績取得 → SFL公式結果取得 → シナリオ計算 → 解説生成 パイプライン一括実行
npm.cmd run pipeline:force

# 単体テスト実行 (Zod検証 + Predictor + Simulator)
npm.cmd test

# Astro 静的ビルド (dist/ に出力)
npm.cmd run build
```

### HomeServer 連携スクリプト (`D:\HomeServer\scripts`)
- `.\scripts\update-sfl-simulator.ps1 -Force -RebuildContainer`: SFL毎節終了後にデータ更新パイプラインを実行し、必要に応じてDockerコンテナを再ビルド・再起動します。

---

## start.gg 連携（プレミア大会の実戦データ）

- **対象**: CPT Premier / World Warrior / EVO 系 / Capcom Cup / 大型オフライン大会の SF6 個人戦。判定ルールは `src/lib/startgg/premier.ts`（大会名パターン・サイドイベント除外・参加人数）で、大会の追加・除外はここを編集します。
- **期間**: 直近365日の固定期間（シーズン開始日の定義が曖昧なため）。
- **取得**: `npm.cmd run fetch-startgg`（`STARTGG_API_TOKEN` が必要）。パイプラインでは約20時間に1回、前回取得以降の差分だけを取得し、`src/data/startgg-premier-results.json` に保存します。トークン未設定や取得失敗時は既存データで続行します。
- **選手の対応付け**: `src/data/startgg-identities.json` が SFL選手キー → start.gg player id の確定表です。選手の入れ替え時は `npm.cmd run resolve-startgg-identities` で候補（大型大会のgamerTag・チームプレフィックス照合）を出し、人が確認して追記します。
- **プロファイル**: `src/lib/startgg/profile.ts` が大会別成績・セット/ゲーム勝率・最終ゲーム勝率・逆転率・ルーザーズ側・格上シード相手・SFL選手同士の対戦・パフォーマンスレーティングを算出し、SFL選手48人の中で際立つ特徴をタグ化します。選手図鑑の詳細と予測エンジン（Elo・対キャラ・H2H）の両方で使います。
- **制約**:
  - Capcom Cup 本戦や EWC 本戦など、start.gg 外で運営される大会は含まれません。
  - 使用キャラは主催者が登録したゲームにしか無く（全ゲームの1割弱）、オンライン大会ではほぼ未登録のため、対キャラ傾向は参考値です。

---

## SFL公式 試合内プレイ統計

- **取得元**: `https://sf.esports.capcom.com/api/sfl20xx/?data=stats`（ログイン不要）。節ごとに全選手の**シーズン累積値**がCSVで返ります。`npm.cmd run fetch-sfl-play-stats` で取得し、`src/data/sfl-play-stats.json` に保存します（パイプラインではSFL結果の更新時に実行）。
- **指標（18項目）**: ドライブラッシュ（生／キャンセル）、ドライブインパクト（使用／成功／返し／パリィ受け）、ドライブパリィ、ジャストパリィ（暗転／飛び道具）、ドライブリバーサル、OD技、ゲージ使用本数、バーンアウト、対空・投げ抜け・無敵技暴れの成功率、HOME/AWAY勝率。列の意味は公式サイトの統計定義から確認したもので、2025・2026シーズンで同じ並びです。2024シーズン以前は列定義が公開されていないため対象外です。
- **プロファイル**（`src/lib/sfl/play-style.ts`）: 回数系は、stats の集計時点の節までに出場したバトル数で割って1バトルあたりに換算します。6バトル以上出場した選手の中で順位を付け、上位/下位20%の項目を傾向タグにします。昨季と比べて順位が大きく動いた項目も表示します。
- **キャラ定義**: `src/lib/characters.ts` が唯一の定義元です（公式の31キャラ）。SFL公式のキー表記の揺れ（`deejay`、`ken(m)` など）は `normalizeSflCharKey` で吸収します。
