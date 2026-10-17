# SFL 2026 シナリオ推定 ＆ 順位シミュレーター (Astro + Zod + CPT Top 96 Predictor)

**ストリートファイターリーグ: Pro-JP 2026 (Division S / Division F)** の公式試合結果と **Capcom Pro Tour (CPT) Top 96 キャラ相性マトリクス・全48選手戦績** を統合し、各チームの「1位突破」「2位準決勝HOME権確保」「3位プレイオフ滑り込み」「次節の他力本願応援ガイド」および「HOME後出し被せ最適オーダー予測」を自動推計・可視化するハイブリッドWebアプリケーションです。

---

## 主な特徴

1. **Astro + React Islands + Zod による高速・型安全な静的サイト生成 (SSG)**
   - フロントエンドを **Astro (`output: "static"`) + `@astrojs/react`** で構築し、初期表示は超高速な静的HTML、インタラクティブな順位表・シミュレーター部分のみをReact Island (`client:load`) としてハイドレーションします。
   - すべてのJSONデータ（試合結果・順位表・選手マスタ・CPT Top 96相性行列・選手戦績・シナリオ推計）を **`src/lib/schema.ts` の Zod スキーマ** でパイプライン生成時およびビルド時に厳密検証します。
   - **Vercel** へそのままゼロコンフィグで静的デプロイ可能でありつつ、**HomeServer (`D:\HomeServer`)** の Docker Compose (`normal` プロファイル, `127.0.0.1:3002`) でも軽量Node静的サーバー (`scripts/serve-static.mjs`) として常時稼働します。

2. **CPT Top 96 キャラ相性 × 選手対キャラ戦績 × H2H 高度勝敗予測エンジン (`src/lib/predictor.ts`)**
   - **① マクロ相性 ($\text{Matchup}(X, Y)_{\text{Top96}}$)**: CPT Premier 大会 Top 96 以上のマッチアップデータに対し、ベイズ平滑化（$\alpha = 20, p_0 = 0.50$）を適用した $28 \times 28$ キャラ相性マトリクス (`src/data/cpt-matchups-top96.json`)。
   - **② 選手固有の対キャラ熟練度 ($\text{PlayerVsChar}(A, Y)_{\text{All}}$)**: SFL公式APIの選手別 `vs_char` / `use_char` 戦績とCPT戦績を統合した全48選手の対キャラデータ (`src/data/player-stats.json`)。
   - **③ 直接対決・Elo・HOME後出し被せ補正 ($\text{H2H}(A, B)$)**: 選手間の直接対決戦績・Eloレーティング・SFL特有の「HOME側（後出しカウンターピック）アドバンテージ」を統合。
   - これらを重み付け合算（$w_1 = 0.40, w_2 = 0.35, w_3 = 0.25$）し、未消化カードの先鋒(10pt)・中堅(10pt)・大将(20pt)・延長(10pt)の最適被せオーダーと8通りのスコア確率分布を算出してモンテカルロ5,000回試行へ反映します。

---

## ディレクトリ構成

```text
apps/sfl-scenario-simulator/
├── astro.config.mjs               # Astro SSG + React 設定
├── Dockerfile                     # HomeServer用マルチステージDockerビルド
├── package.json
├── scripts/
│   ├── 0-fetch-cpt-data.ts        # start.gg / Capcom公式シードからCPT Top96相性 & 48選手戦績を生成 (Zod検証)
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
