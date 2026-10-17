import React from "react";
import type { PlayerBoutLog, Sf6TournamentBout } from "@/lib/player-encyclopedia";
import { CHAR_NAME_JP_MAP } from "@/lib/player-encyclopedia";

interface TournamentBoutRowProps {
  bout: Sf6TournamentBout;
  compact?: boolean;
}

export function TournamentBoutRow({ bout, compact = false }: TournamentBoutRowProps) {
  if (compact) {
    return (
      <div
        style={{
          fontSize: "0.74rem",
          background: "var(--bg-subtle)",
          padding: "0.25rem 0.45rem",
          borderRadius: "4px",
          marginBottom: "0.2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: "0.3rem",
          }}
        >
          [{bout.category}] {bout.tournamentName} vs {bout.opponentPlayerName}
        </span>
        <strong
          style={{
            color: bout.won ? "var(--success)" : "var(--danger)",
            whiteSpace: "nowrap",
          }}
        >
          {bout.myScore}-{bout.opponentScore}
        </strong>
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: "0.78rem",
        background: "var(--bg-subtle)",
        padding: "0.35rem 0.55rem",
        borderRadius: "6px",
        marginBottom: "0.25rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: "rgba(37, 99, 235, 0.12)",
              color: "var(--primary)",
              fontSize: "0.68rem",
              fontWeight: 800,
              padding: "0.1rem 0.35rem",
              borderRadius: "3px",
            }}
          >
            {bout.category}
          </span>
          <span style={{ fontWeight: 800 }}>{bout.tournamentName}</span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {bout.round}
          </span>
        </div>
        <div
          style={{
            color: "var(--text-sub)",
            fontSize: "0.76rem",
            marginTop: "0.1rem",
          }}
        >
          {CHAR_NAME_JP_MAP[bout.myChar] || bout.myChar} vs{" "}
          <strong>{bout.opponentPlayerName}</strong>（
          {bout.opponentTeam ? `${bout.opponentTeam} / ` : ""}
          {CHAR_NAME_JP_MAP[bout.opponentChar] || bout.opponentChar}）
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: "65px" }}>
        <span
          style={{
            fontWeight: 800,
            color: bout.won ? "var(--success)" : "var(--danger)",
            fontSize: "0.85rem",
          }}
        >
          {bout.myScore} - {bout.opponentScore} {bout.won ? "勝利" : "敗北"}
        </span>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {bout.date}
        </div>
      </div>
    </div>
  );
}

interface SflBoutRowProps {
  bout: PlayerBoutLog;
  compact?: boolean;
}

export function SflBoutRow({ bout, compact = false }: SflBoutRowProps) {
  if (compact) {
    return (
      <div
        style={{
          fontSize: "0.74rem",
          background: "var(--bg-subtle)",
          padding: "0.25rem 0.45rem",
          borderRadius: "4px",
          marginBottom: "0.2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {bout.sectionTitle} vs {bout.opponentPlayerName}（{bout.opponentTeamShort}）
        </span>
        <strong
          style={{
            color: bout.won ? "var(--success)" : "var(--danger)",
          }}
        >
          {bout.myBattle}-{bout.opponentBattle}
        </strong>
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: "0.78rem",
        background: "var(--bg-subtle)",
        padding: "0.35rem 0.55rem",
        borderRadius: "6px",
        marginBottom: "0.25rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <span style={{ fontWeight: 800 }}>
          {bout.sectionTitle} {bout.statusName}
        </span>
        <span
          style={{
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            marginLeft: "0.3rem",
          }}
        >
          [{bout.side.toUpperCase()}]
        </span>
        <div
          style={{
            color: "var(--text-sub)",
            fontSize: "0.76rem",
            marginTop: "0.1rem",
          }}
        >
          {CHAR_NAME_JP_MAP[bout.myChar] || bout.myChar} vs{" "}
          <strong>{bout.opponentPlayerName}</strong>（{bout.opponentTeamShort}）
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span
          style={{
            fontWeight: 800,
            color: bout.won ? "var(--success)" : "var(--danger)",
          }}
        >
          {bout.myBattle} - {bout.opponentBattle} {bout.won ? "勝利" : "敗北"}
        </span>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          +{bout.myPoint}pt
        </div>
      </div>
    </div>
  );
}
