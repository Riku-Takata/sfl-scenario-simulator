import React, { useEffect } from "react";
import type { VsCharDetail } from "@/lib/player-encyclopedia";
import { SflBoutRow, TournamentBoutRow } from "./BoutHistoryItem";

interface VsCharDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchup: VsCharDetail | null;
  matchupMode: "tournament" | "sfl2026";
  playerName: string;
}

export function VsCharDetailModal({
  isOpen,
  onClose,
  matchup: m,
  matchupMode,
  playerName,
}: VsCharDetailModalProps) {
  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !m) return null;

  const isPlayed =
    matchupMode === "tournament" ? m.playedInTournament : m.playedInSfl;
  const winRate =
    matchupMode === "tournament"
      ? m.tournamentMatchWinRate
      : m.sflBattleWinRate;
  const tierLabel =
    matchupMode === "tournament" ? m.tournamentTierLabel : m.tierLabel;

  const boutsCount =
    matchupMode === "tournament"
      ? m.tournamentMatchups.length
      : m.matchups.length;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "1.5rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
          position: "relative",
        }}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "1rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                marginBottom: "0.15rem",
              }}
            >
              {playerName} 選手 × キャラクター別詳細相性カルテ
            </div>
            <h3
              style={{
                fontSize: "1.45rem",
                fontWeight: 900,
                color: "var(--text-main)",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
              }}
            >
              <span>vs {m.charName}</span>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  padding: "0.2rem 0.55rem",
                  borderRadius: "6px",
                  background:
                    tierLabel === "大得意" || tierLabel === "勝ち越し"
                      ? "var(--success-bg)"
                      : tierLabel === "五分"
                        ? "var(--bg-subtle)"
                        : tierLabel === "苦戦"
                          ? "var(--warning-bg)"
                          : "var(--bg-subtle)",
                  color:
                    tierLabel === "大得意" || tierLabel === "勝ち越し"
                      ? "var(--success)"
                      : tierLabel === "苦戦"
                        ? "var(--warning)"
                        : "var(--text-sub)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {tierLabel}
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              fontWeight: 700,
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "0.2rem 0.5rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* モード表示 & サマリーバナー */}
        <div
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.82rem",
                fontWeight: 800,
                color: "var(--text-muted)",
              }}
            >
              {matchupMode === "tournament"
                ? "★ SF6公式・大型大会 通算実戦戦績"
                : "今期 SFL 2026 実戦のみ"}
            </span>

            {isPlayed && (
              <span
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 900,
                  color:
                    (winRate ?? 0) >= 50 ? "var(--success)" : "var(--danger)",
                }}
              >
                勝率 {winRate?.toFixed(1)}%
              </span>
            )}
          </div>

          {isPlayed ? (
            <div
              style={{
                fontSize: "0.86rem",
                color: "var(--text-sub)",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                borderTop: "1px dashed var(--border-color)",
                paddingTop: "0.5rem",
              }}
            >
              {matchupMode === "tournament" ? (
                <>
                  <div>
                    通算試合:{" "}
                    <strong>
                      {m.tournamentMatchesWon}勝 {m.tournamentMatchesLost}敗
                    </strong>
                    （合計 {m.tournamentMatchesTotal} 試合）
                  </div>
                  <div>・</div>
                  <div>
                    相性評価: <strong>{m.tournamentTierLabel}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    SFLバトル:{" "}
                    <strong>
                      {m.sflBattlesWon}勝 {m.sflBattlesLost}敗
                    </strong>
                    （合計 {m.sflBattlesTotal} バトル）
                  </div>
                  <div>・</div>
                  <div>
                    マッチ勝敗:{" "}
                    <strong>
                      {m.sflBoutsWon}勝 {m.sflBoutsLost}敗
                    </strong>
                  </div>
                  <div>・</div>
                  <div style={{ color: "var(--text-muted)" }}>
                    HOME {m.homeBattlesWon}勝{m.homeBattlesLost}敗 / AWAY{" "}
                    {m.awayBattlesWon}勝{m.awayBattlesLost}敗
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: "0.86rem",
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "0.5rem 0",
              }}
            >
              {matchupMode === "tournament"
                ? "ストリートファイター6公式・大型大会での対戦データはありません（0戦）"
                : "今期SFL 2026本戦での対戦データはありません（0戦）"}
            </div>
          )}
        </div>

        {/* 計算根拠となった対戦組み合わせログ一覧 */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.6rem",
            }}
          >
            <h4 style={{ fontSize: "0.95rem", fontWeight: 800 }}>
              {matchupMode === "tournament"
                ? `計算根拠となった大会対戦カード一覧（全${boutsCount}試合）`
                : `計算根拠となった対戦組み合わせ一覧（全${boutsCount}試合）`}
            </h4>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {matchupMode === "tournament" ? "新しい対戦順" : "節順"}
            </span>
          </div>

          {boutsCount > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                maxHeight: "380px",
                overflowY: "auto",
                paddingRight: "0.25rem",
              }}
            >
              {matchupMode === "tournament"
                ? m.tournamentMatchups.map((bout) => (
                    <TournamentBoutRow key={bout.id} bout={bout} />
                  ))
                : m.matchups.map((bout, bIdx) => (
                    <SflBoutRow key={bIdx} bout={bout} />
                  ))}
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-subtle)",
                borderRadius: "8px",
                padding: "1.25rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.84rem",
              }}
            >
              対戦ログはありません
            </div>
          )}
        </div>

        {/* モーダル下部閉じるボタン */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: "0.5rem 1.25rem" }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
