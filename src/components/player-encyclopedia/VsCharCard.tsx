import React from "react";
import type { VsCharDetail } from "@/lib/player-encyclopedia";
import { SflBoutRow, TournamentBoutRow } from "./BoutHistoryItem";

interface VsCharCardProps {
  matchup: VsCharDetail;
  matchupMode: "tournament" | "sfl2026";
  index?: number;
  highlightType?: "strong" | "close" | "neutral";
  compact?: boolean;
}

export function VsCharCard({
  matchup: m,
  matchupMode,
  index,
  highlightType = "neutral",
  compact = false,
}: VsCharCardProps) {
  const isPlayed =
    matchupMode === "tournament" ? m.playedInTournament : m.playedInSfl;
  const winRate =
    matchupMode === "tournament"
      ? m.tournamentMatchWinRate
      : m.sflBattleWinRate;

  const winRateColor =
    highlightType === "strong"
      ? "var(--success)"
      : highlightType === "close"
        ? "var(--warning)"
        : (winRate ?? 0) >= 50
          ? "var(--success)"
          : "var(--danger)";

  if (compact) {
    return (
      <div
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
          padding: "0.7rem 0.85rem",
          fontSize: "0.82rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 800,
            marginBottom: "0.35rem",
          }}
        >
          <span style={{ fontSize: "0.9rem" }}>vs {m.charName}</span>
          {isPlayed ? (
            <span
              style={{
                fontWeight: 800,
                color: (winRate ?? 0) >= 50 ? "var(--success)" : "var(--danger)",
                fontSize: "0.92rem",
              }}
            >
              勝率 {winRate?.toFixed(1)}%
            </span>
          ) : (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                background: "var(--bg-subtle)",
                padding: "0.15rem 0.45rem",
                borderRadius: "4px",
              }}
            >
              {matchupMode === "tournament"
                ? "大会未対戦 (0戦)"
                : "今期未対戦 (0戦)"}
            </span>
          )}
        </div>

        {isPlayed ? (
          <>
            <div
              style={{
                fontSize: "0.76rem",
                color: "var(--text-sub)",
                marginBottom: "0.45rem",
              }}
            >
              {matchupMode === "tournament" ? (
                <>
                  公式大会: {m.tournamentMatchesWon}勝{m.tournamentMatchesLost}敗（計
                  {m.tournamentMatchesTotal}戦） / {m.tournamentTierLabel}
                </>
              ) : (
                <>
                  バトル: {m.sflBattlesWon}勝{m.sflBattlesLost}敗 / 試合:{" "}
                  {m.sflBoutsWon}勝{m.sflBoutsLost}敗
                </>
              )}
            </div>

            <div
              style={{
                borderTop: "1px dashed var(--border-color)",
                paddingTop: "0.35rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  marginBottom: "0.2rem",
                }}
              >
                対戦履歴（計算根拠）:
              </div>

              {matchupMode === "tournament"
                ? m.tournamentMatchups.map((bout) => (
                    <TournamentBoutRow key={bout.id} bout={bout} compact />
                  ))
                : m.matchups.map((bout, bIdx) => (
                    <SflBoutRow key={bIdx} bout={bout} compact />
                  ))}
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              paddingTop: "0.2rem",
            }}
          >
            {matchupMode === "tournament"
              ? "公式大会での対戦データはありません"
              : "今期SFL本戦での対戦はまだありません"}
          </div>
        )}
      </div>
    );
  }

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
        <span
          style={{
            fontWeight: 800,
            color: winRateColor,
            fontSize: "1rem",
          }}
        >
          勝率 {winRate != null ? `${winRate.toFixed(1)}%` : "-"}
        </span>
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
          ? m.tournamentMatchups.map((bout) => (
              <TournamentBoutRow key={bout.id} bout={bout} />
            ))
          : m.matchups.map((bout, bIdx) => (
              <SflBoutRow key={bIdx} bout={bout} />
            ))}
      </div>
    </div>
  );
}
