import React from "react";
import type { VsCharDetail } from "@/lib/player-encyclopedia";
import { SflBoutRow, TournamentBoutRow } from "./BoutHistoryItem";

interface VsCharCardProps {
  matchup: VsCharDetail;
  matchupMode: "tournament" | "sfl2026";
  index?: number;
  highlightType?: "strong" | "close" | "neutral";
  compact?: boolean;
  onClick?: (matchup: VsCharDetail) => void;
}

export function VsCharCard({
  matchup: m,
  matchupMode,
  index,
  highlightType = "neutral",
  compact = false,
  onClick,
}: VsCharCardProps) {
  const isPlayed =
    matchupMode === "tournament" ? m.playedInTournament : m.playedInSfl;
  const winRate =
    matchupMode === "tournament"
      ? m.tournamentMatchWinRate
      : m.sflBattleWinRate;
  const tierLabel =
    matchupMode === "tournament" ? m.tournamentTierLabel : m.tierLabel;

  const winRateColor =
    highlightType === "strong"
      ? "var(--success)"
      : highlightType === "close"
        ? "var(--warning)"
        : (winRate ?? 0) >= 50
          ? "var(--success)"
          : "var(--danger)";

  const boutsCount =
    matchupMode === "tournament"
      ? m.tournamentMatchups.length
      : m.matchups.length;

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick?.(m)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.(m);
          }
        }}
        style={{
          background: "#ffffff",
          border: `1px solid ${
            isPlayed
              ? (winRate ?? 0) >= 50
                ? "var(--success-border)"
                : "var(--warning-border)"
              : "var(--border-color)"
          }`,
          borderRadius: "8px",
          padding: "0.75rem 0.85rem",
          fontSize: "0.82rem",
          cursor: "pointer",
          transition: "transform 0.1s ease, box-shadow 0.15s ease, border-color 0.15s ease",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 800,
              marginBottom: "0.35rem",
            }}
          >
            <span style={{ fontSize: "0.92rem", color: "var(--text-main)" }}>
              vs {m.charName}
            </span>
            {isPlayed ? (
              <span
                style={{
                  fontWeight: 800,
                  color: (winRate ?? 0) >= 50 ? "var(--success)" : "var(--danger)",
                  fontSize: "0.95rem",
                }}
              >
                勝率 {winRate?.toFixed(1)}%
              </span>
            ) : (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  background: "var(--bg-subtle)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                }}
              >
                {matchupMode === "tournament" ? "未対戦 (0戦)" : "未対戦 (0戦)"}
              </span>
            )}
          </div>

          {isPlayed ? (
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--text-sub)",
                marginBottom: "0.55rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {matchupMode === "tournament"
                  ? `${m.tournamentMatchesWon}勝${m.tournamentMatchesLost}敗 (計${m.tournamentMatchesTotal}戦)`
                  : `${m.sflBattlesWon}勝${m.sflBattlesLost}敗 (計${m.sflBattlesTotal}戦)`}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background:
                    tierLabel === "大得意" || tierLabel === "勝ち越し"
                      ? "var(--success-bg)"
                      : tierLabel === "苦戦"
                        ? "var(--warning-bg)"
                        : "var(--bg-subtle)",
                  color:
                    tierLabel === "大得意" || tierLabel === "勝ち越し"
                      ? "var(--success)"
                      : tierLabel === "苦戦"
                        ? "var(--warning)"
                        : "var(--text-sub)",
                }}
              >
                {tierLabel}
              </span>
            </div>
          ) : (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                padding: "0.15rem 0 0.55rem 0",
              }}
            >
              対戦データなし
            </div>
          )}
        </div>

        {/* クリックしてポップアップを開く誘導 */}
        <div
          style={{
            borderTop: "1px dashed var(--border-color)",
            paddingTop: "0.45rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "var(--primary)",
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          <span>{isPlayed ? `全対戦ログ (${boutsCount}件)` : "詳細カルテ"}</span>
          <span style={{ fontSize: "0.8rem" }}>詳細を見る →</span>
        </div>
      </div>
    );
  }

  // 通常カード（得意・苦戦表示用）
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "0.65rem 0.85rem",
        borderRadius: "8px",
        border: "1px solid var(--border-color)",
        fontSize: "0.86rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.35rem",
        }}
      >
        <strong style={{ fontSize: "0.95rem" }}>
          {index != null ? `${index + 1}. ` : ""}vs {m.charName}
        </strong>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontWeight: 800,
              color: winRateColor,
              fontSize: "1rem",
            }}
          >
            勝率 {winRate != null ? `${winRate.toFixed(1)}%` : "-"}
          </span>
          {onClick && (
            <button
              type="button"
              onClick={() => onClick(m)}
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                padding: "0.15rem 0.45rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--primary)",
                cursor: "pointer",
              }}
            >
              ポップアップで拡大 ↗
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.4rem",
          fontSize: "0.78rem",
          color: "var(--text-sub)",
          marginBottom: "0.45rem",
        }}
      >
        {matchupMode === "tournament" ? (
          <>
            <span>
              公式大会:{" "}
              <strong>
                {m.tournamentMatchesWon}勝{m.tournamentMatchesLost}敗
              </strong>
              （計{m.tournamentMatchesTotal}戦）
            </span>
            <span>/</span>
            <span>
              評価:{" "}
              <strong style={{ color: "var(--text-main)" }}>
                {m.tournamentTierLabel}
              </strong>
            </span>
          </>
        ) : (
          <>
            <span>
              SFLバトル:{" "}
              <strong>
                {m.sflBattlesWon}勝{m.sflBattlesLost}敗
              </strong>
              （計{m.sflBattlesTotal}戦）
            </span>
            <span>/</span>
            <span>
              試合:{" "}
              <strong>
                {m.sflBoutsWon}勝{m.sflBoutsLost}敗
              </strong>
            </span>
            <span>/</span>
            <span style={{ color: "var(--text-muted)" }}>
              HOME {m.homeBattlesWon}勝{m.homeBattlesLost}敗・AWAY{" "}
              {m.awayBattlesWon}勝{m.awayBattlesLost}敗
            </span>
          </>
        )}
      </div>

      <div
        style={{
          borderTop: "1px dashed var(--border-color)",
          paddingTop: "0.4rem",
        }}
      >
        <div
          style={{
            fontSize: "0.74rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            marginBottom: "0.25rem",
          }}
        >
          {matchupMode === "tournament"
            ? `計算根拠となった大会対戦カード (${m.tournamentMatchups.length}試合):`
            : "計算根拠となった対戦組み合わせ:"}
        </div>

        {matchupMode === "tournament"
          ? m.tournamentMatchups.slice(0, 5).map((bout) => (
              <TournamentBoutRow key={bout.id} bout={bout} />
            ))
          : m.matchups.slice(0, 5).map((bout, bIdx) => (
              <SflBoutRow key={bIdx} bout={bout} />
            ))}

        {boutsCount > 5 && onClick && (
          <button
            type="button"
            onClick={() => onClick(m)}
            style={{
              width: "100%",
              marginTop: "0.35rem",
              padding: "0.35rem",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              fontSize: "0.76rem",
              fontWeight: 700,
              color: "var(--primary)",
              cursor: "pointer",
            }}
          >
            他 {boutsCount - 5} 件の対戦ログをポップアップで全件表示 ↗
          </button>
        )}
      </div>
    </div>
  );
}
