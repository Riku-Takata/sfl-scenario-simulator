import React from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";

interface PlayerCardProps {
  player: PlayerEncyclopediaEntry;
  matchupMode: "tournament" | "sfl2026";
  vsCharFilter: string;
  onSelect: (playerKey: string) => void;
}

export function PlayerCard({
  player: p,
  matchupMode,
  vsCharFilter,
  onSelect,
}: PlayerCardProps) {
  const vsTarget =
    vsCharFilter !== "none"
      ? p.vsCharacters.find((c) => c.charKey === vsCharFilter)
      : null;

  return (
    <div
      onClick={() => onSelect(p.playerKey)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(p.playerKey);
        }
      }}
      style={{
        background: "#ffffff",
        border: "1px solid var(--border-color)",
        borderLeft: `5px solid ${p.teamColor}`,
        borderRadius: "10px",
        padding: "1.05rem",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.4rem",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              color: "var(--text-muted)",
            }}
          >
            Div.{p.division.toUpperCase()} / {p.teamShort}
          </span>
          <div
            style={{
              fontSize: "1.15rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "baseline",
              gap: "0.4rem",
            }}
          >
            <span>{p.name}</span>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {p.nameEn}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: "var(--primary)",
            }}
          >
            {p.parameters.overallGrade}
          </span>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              fontWeight: 700,
            }}
          >
            {p.parameters.overallScore}点
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.4rem",
          marginBottom: "0.6rem",
        }}
      >
        <span
          className="badge"
          style={{
            background: "var(--primary-light)",
            color: "var(--primary)",
            fontSize: "0.78rem",
          }}
        >
          {p.mainCharName}
        </span>
        {p.subCharNames.map((sc) => (
          <span
            key={sc}
            style={{
              fontSize: "0.74rem",
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            / {sc}
          </span>
        ))}
      </div>

      {/* 特徴タグプレビュー */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.3rem",
          marginBottom: "0.65rem",
        }}
      >
        {p.featureTags.slice(0, 2).map((t) => (
          <span
            key={t}
            style={{
              fontSize: "0.72rem",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              padding: "0.15rem 0.45rem",
              borderRadius: "4px",
              color: "var(--text-sub)",
              fontWeight: 700,
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* 対戦キャラ指定時の相性バッジ */}
      {vsTarget && (
        <div
          style={{
            background:
              matchupMode === "tournament"
                ? vsTarget.playedInTournament
                  ? (vsTarget.tournamentMatchWinRate ?? 0) >= 50
                    ? "var(--success-bg)"
                    : "var(--warning-bg)"
                  : "var(--bg-subtle)"
                : vsTarget.playedInSfl
                  ? (vsTarget.sflBattleWinRate ?? 0) >= 50
                    ? "var(--success-bg)"
                    : "var(--warning-bg)"
                  : "var(--bg-subtle)",
            border: `1px solid ${
              matchupMode === "tournament"
                ? vsTarget.playedInTournament
                  ? (vsTarget.tournamentMatchWinRate ?? 0) >= 50
                    ? "var(--success-border)"
                    : "var(--warning-border)"
                  : "var(--border-color)"
                : vsTarget.playedInSfl
                  ? (vsTarget.sflBattleWinRate ?? 0) >= 50
                    ? "var(--success-border)"
                    : "var(--warning-border)"
                  : "var(--border-color)"
            }`,
            borderRadius: "6px",
            padding: "0.45rem 0.65rem",
            marginBottom: "0.6rem",
            fontSize: "0.8rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>vs {vsTarget.charName} 相性:</span>
            <span>
              {matchupMode === "tournament" ? (
                vsTarget.playedInTournament ? (
                  <strong
                    style={{
                      color:
                        (vsTarget.tournamentMatchWinRate ?? 0) >= 50
                          ? "var(--success)"
                          : "var(--danger)",
                    }}
                  >
                    勝率 {vsTarget.tournamentMatchWinRate?.toFixed(1)}% (
                    {vsTarget.tournamentMatchesWon}勝
                    {vsTarget.tournamentMatchesLost}敗)
                  </strong>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>
                    大会未対戦 (0戦)
                  </span>
                )
              ) : vsTarget.playedInSfl ? (
                <strong
                  style={{
                    color:
                      (vsTarget.sflBattleWinRate ?? 0) >= 50
                        ? "var(--success)"
                        : "var(--danger)",
                  }}
                >
                  勝率 {vsTarget.sflBattleWinRate?.toFixed(1)}% (
                  {vsTarget.sflBattlesWon}勝{vsTarget.sflBattlesLost}敗)
                </strong>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>
                  今期未対戦 (0戦)
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* SFL戦績ダイジェスト */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.35rem",
          background: "var(--bg-subtle)",
          padding: "0.45rem 0.6rem",
          borderRadius: "6px",
          textAlign: "center",
          fontSize: "0.78rem",
          marginBottom: "0.55rem",
        }}
      >
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            勝敗
          </div>
          <div style={{ fontWeight: 800 }}>
            {p.sfl.victory}勝{p.sfl.losses}敗
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            獲得pt
          </div>
          <div style={{ fontWeight: 800, color: "var(--primary)" }}>
            {p.sfl.point}pt
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            バトル勝率
          </div>
          <div style={{ fontWeight: 800 }}>
            {p.sfl.battleWinRate.toFixed(1)}%
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          paddingTop: "0.35rem",
          borderTop: "1px dashed var(--border-color)",
        }}
      >
        <span>
          {matchupMode === "tournament" ? "大会得意: " : "今期得意: "}
          {(matchupMode === "tournament"
            ? p.tournamentStrongestMatchups
            : p.strongestMatchups
          ).length > 0
            ? (matchupMode === "tournament"
                ? p.tournamentStrongestMatchups
                : p.strongestMatchups
              )
                .slice(0, 2)
                .map((m) => m.charName)
                .join("・")
            : matchupMode === "tournament"
              ? "大会未対戦"
              : "今期未対戦"}
        </span>
        <span style={{ color: "var(--primary)", fontWeight: 800 }}>
          この選手を詳しく見る →
        </span>
      </div>
    </div>
  );
}
