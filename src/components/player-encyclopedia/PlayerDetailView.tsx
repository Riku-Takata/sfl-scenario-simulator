import React, { useState } from "react";
import type { PlayerEncyclopediaEntry, VsCharDetail } from "@/lib/player-encyclopedia";
import { PlayerDetailBoutLogs } from "./PlayerDetailBoutLogs";
import { PlayerDetailHeader } from "./PlayerDetailHeader";
import { PlayerDetailStats } from "./PlayerDetailStats";
import { VsCharCard } from "./VsCharCard";
import { VsCharDetailModal } from "./VsCharDetailModal";

interface PlayerDetailViewProps {
  selectedPlayer: PlayerEncyclopediaEntry;
  players: PlayerEncyclopediaEntry[];
  onSelectPlayer: (playerKey: string) => void;
  onBackToList: () => void;
}

export function PlayerDetailView({
  selectedPlayer,
  players,
  onSelectPlayer,
  onBackToList,
}: PlayerDetailViewProps) {
  const [showAllVsChars, setShowAllVsChars] = useState<boolean>(false);
  const [selectedMatchupModal, setSelectedMatchupModal] =
    useState<VsCharDetail | null>(null);

  const strongestList = selectedPlayer.strongestMatchups;
  const closestList = selectedPlayer.closestMatchups;
  const fullCharList = selectedPlayer.vsCharacters;

  return (
    <div>
      {/* 選手基本情報ヘッダー・ナビゲーション・SNS・総合評価 */}
      <PlayerDetailHeader
        selectedPlayer={selectedPlayer}
        players={players}
        onSelectPlayer={onSelectPlayer}
        onBackToList={onBackToList}
      />

      {/* 選択された選手の詳細カルテパネル */}
      <div
        id="player-detail-panel"
        className="panel"
        style={{
          borderTop: `5px solid ${selectedPlayer.teamColor}`,
        }}
      >
        {/* 6角形パラメーター ＆ ポジション別起用実績 */}
        <PlayerDetailStats selectedPlayer={selectedPlayer} />

        {/* 対キャラクター相性セクション */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          {/* 全28キャラ一覧表示トグル */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "0.85rem",
            }}
          >
            <button
              type="button"
              onClick={() => setShowAllVsChars((prev) => !prev)}
              className="btn"
              style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
            >
              {showAllVsChars
                ? "全28キャラ一覧を閉じる"
                : "全28キャラクターとの対戦戦績一覧を表示する"}
            </button>
          </div>

          {/* セクション見出し & 説明 */}
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "0.25rem" }}>
              対キャラクター相性データ（SFL 2026 今シーズンの実戦戦績のみ）
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              今シーズン（SFL 2026）公式戦の実戦対戦ログのみから算出した相手キャラクター別のバトル勝率および対戦組み合わせ内訳です。各カードから計算根拠となった対戦カードを参照できます。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* 得意キャラ（勝ち越し） */}
            <div
              style={{
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--success)",
                  fontSize: "0.92rem",
                  marginBottom: "0.6rem",
                }}
              >
                ◎ 得意・勝ち越している相手キャラクター
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {strongestList.length > 0 ? (
                  strongestList.map((m, idx) => (
                    <VsCharCard
                      key={m.charKey}
                      matchup={m}
                      matchupMode="sfl2026"
                      index={idx}
                      highlightType="strong"
                      onClick={(item) => setSelectedMatchupModal(item)}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                    }}
                  >
                    今期SFL本戦での勝ち越し対戦データはまだありません
                  </div>
                )}
              </div>
            </div>

            {/* 苦戦・警戒が必要な相手キャラクター */}
            <div
              style={{
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--warning)",
                  fontSize: "0.92rem",
                  marginBottom: "0.6rem",
                }}
              >
                △ 苦戦・負け越している相手キャラクター
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {closestList.length > 0 ? (
                  closestList.map((m, idx) => (
                    <VsCharCard
                      key={m.charKey}
                      matchup={m}
                      matchupMode="sfl2026"
                      index={idx}
                      highlightType="close"
                      onClick={(item) => setSelectedMatchupModal(item)}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                    }}
                  >
                    今期SFL本戦での負け越し・苦戦対戦データはありません（好調）
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 全28キャラクター対戦戦績・組み合わせ一覧グリッド */}
          {showAllVsChars && (
            <div
              style={{
                marginTop: "1.25rem",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 800,
                  }}
                >
                  全28キャラクター 今シーズンSFL対戦戦績・組み合わせ内訳
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--primary)",
                    fontWeight: 700,
                  }}
                >
                  ※ 各カードをクリックすると、全対戦ログをポップアップで拡大表示します
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {fullCharList.map((vc) => (
                  <VsCharCard
                    key={vc.charKey}
                    matchup={vc}
                    matchupMode="sfl2026"
                    compact
                    onClick={(item) => setSelectedMatchupModal(item)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SFL 2026 実戦出場ログ */}
        <PlayerDetailBoutLogs
          boutLogs={selectedPlayer.boutLogs}
          onSelectPlayer={onSelectPlayer}
        />

        {/* 下部戻るボタン */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={onBackToList}
            className="btn btn-primary"
          >
            ← 選手選択一覧に戻る（全48選手）
          </button>
        </div>
      </div>

      {/* キャラクター相性・全対戦ログ詳細ポップアップモーダル */}
      <VsCharDetailModal
        isOpen={selectedMatchupModal !== null}
        onClose={() => setSelectedMatchupModal(null)}
        matchup={selectedMatchupModal}
        matchupMode="sfl2026"
        playerName={selectedPlayer.name}
      />
    </div>
  );
}
