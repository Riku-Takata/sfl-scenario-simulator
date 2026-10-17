import React from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { TEAM_META_MAP } from "@/lib/simulator";

interface PlayerDetailHeaderProps {
  selectedPlayer: PlayerEncyclopediaEntry;
  players: PlayerEncyclopediaEntry[];
  onSelectPlayer: (playerKey: string) => void;
  onBackToList: () => void;
}

export function PlayerDetailHeader({
  selectedPlayer,
  players,
  onSelectPlayer,
  onBackToList,
}: PlayerDetailHeaderProps) {
  const xHandle = selectedPlayer.snsLinks.x
    ? `@${selectedPlayer.snsLinks.x.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").split(/[/?#]/)[0]}`
    : null;

  return (
    <>
      {/* 上部ナビゲーション */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "1.15rem",
          padding: "0.85rem 1.15rem",
          background: "#ffffff",
          border: "1px solid var(--border-color)",
          borderRadius: "10px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <button
          type="button"
          onClick={onBackToList}
          className="btn btn-primary"
        >
          ← 選手選択一覧に戻る（全48選手）
        </button>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            別の選手へ直接切替:
          </span>
          <select
            aria-label="別の選手を選択"
            value={selectedPlayer.playerKey}
            onChange={(e) => onSelectPlayer(e.target.value)}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontWeight: 800,
              fontSize: "0.86rem",
              color: "var(--text-main)",
            }}
          >
            {Object.values(TEAM_META_MAP).map((tm) => (
              <optgroup
                key={tm.key}
                label={`[Div.${tm.division.toUpperCase()}] ${tm.shortName} (${tm.name})`}
              >
                {players
                  .filter((p) => p.teamKey === tm.key)
                  .map((p) => (
                    <option key={p.playerKey} value={p.playerKey}>
                      {p.name}（{p.mainCharName} / {p.sfl.point}pt）
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* 選手基本情報ヘッダー */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: "1.1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.4rem",
            }}
          >
            <span
              className="badge"
              style={{
                background: selectedPlayer.teamColor,
                color: "#ffffff",
                fontWeight: 800,
              }}
            >
              Division {selectedPlayer.division.toUpperCase()} /{" "}
              {selectedPlayer.teamShort}
            </span>
            <a
              href={`/team/${selectedPlayer.teamKey}`}
              style={{
                fontSize: "0.84rem",
                fontWeight: 700,
                color: "var(--primary)",
              }}
            >
              {selectedPlayer.teamName} のチーム突破条件を見る →
            </a>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "1.65rem", fontWeight: 800 }}>
              {selectedPlayer.name}
            </h2>
            <span
              style={{
                fontSize: "0.95rem",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              ({selectedPlayer.nameEn})
            </span>
            <span
              className="badge"
              style={{
                background: "var(--primary-light)",
                color: "var(--primary)",
                fontSize: "0.85rem",
              }}
            >
              メイン: {selectedPlayer.mainCharName}
            </span>
            {selectedPlayer.subCharNames.length > 0 && (
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "var(--text-sub)",
                  fontWeight: 600,
                }}
              >
                サブ: {selectedPlayer.subCharNames.join(" / ")}
              </span>
            )}
          </div>

          {/* 客観データ特徴バッジ */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem",
              marginTop: "0.65rem",
            }}
          >
            {selectedPlayer.featureTags.map((tag) => (
              <span
                key={tag}
                className="badge"
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-main)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* 選手公式SNS・配信チャンネル導線 */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.85rem",
              paddingTop: "0.75rem",
              borderTop: "1px dashed var(--border-color)",
            }}
          >
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 800,
                color: "var(--text-muted)",
                marginRight: "0.15rem",
              }}
            >
              選手SNS・配信をフォローして応援:
            </span>
            {selectedPlayer.snsLinks.x && (
              <a
                href={selectedPlayer.snsLinks.x}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "#0f172a",
                  color: "#ffffff",
                  textDecoration: "none",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span>𝕏</span>
                <span>{xHandle ? `X (${xHandle})` : "X (旧Twitter)"}</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
              </a>
            )}
            {selectedPlayer.snsLinks.youtube && (
              <a
                href={selectedPlayer.snsLinks.youtube}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  textDecoration: "none",
                }}
              >
                <span>▶</span>
                <span>YouTube チャンネル</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
              </a>
            )}
            {selectedPlayer.snsLinks.twitch && (
              <a
                href={selectedPlayer.snsLinks.twitch}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "#f5f3ff",
                  border: "1px solid #ddd6fe",
                  color: "#7c3aed",
                  textDecoration: "none",
                }}
              >
                <span>📺</span>
                <span>Twitch 配信</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
              </a>
            )}
            {selectedPlayer.snsLinks.instagram && (
              <a
                href={selectedPlayer.snsLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "#fdf2f8",
                  border: "1px solid #fbcfe8",
                  color: "#db2777",
                  textDecoration: "none",
                }}
              >
                <span>Instagram</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
              </a>
            )}
            <a
              href={selectedPlayer.snsLinks.sflOfficial}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "8px",
                fontSize: "0.8rem",
                fontWeight: 800,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-sub)",
                textDecoration: "none",
              }}
            >
              <span>SFL公式選手ページ</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
            </a>
          </div>
        </div>

        {/* 総合データ評価ボックス */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "0.75rem 1.15rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--text-muted)",
              }}
            >
              総合データ評価
            </div>
            <div
              style={{
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "var(--primary)",
                lineHeight: 1.1,
              }}
            >
              {selectedPlayer.parameters.overallGrade}{" "}
              <span
                style={{
                  fontSize: "1rem",
                  color: "var(--text-sub)",
                  fontWeight: 700,
                }}
              >
                ({selectedPlayer.parameters.overallScore}/100)
              </span>
            </div>
          </div>
          <div
            style={{
              borderLeft: "1px solid var(--border-color)",
              paddingLeft: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--text-muted)",
              }}
            >
              SFL 2026 成績
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
              {selectedPlayer.sfl.victory}勝{selectedPlayer.sfl.losses}敗（
              <span style={{ color: "var(--primary)" }}>
                {selectedPlayer.sfl.point}pt
              </span>
              ）
            </div>
          </div>
        </div>
      </div>

      {/* 同チーム選手クイック切替バー */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.4rem",
          marginBottom: "1.25rem",
        }}
      >
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "var(--text-muted)",
          }}
        >
          同チーム（{selectedPlayer.teamShort}）の選手:
        </span>
        {players
          .filter((p) => p.teamKey === selectedPlayer.teamKey)
          .map((tm) => (
            <button
              key={tm.playerKey}
              type="button"
              onClick={() => onSelectPlayer(tm.playerKey)}
              className="score-chip"
              style={
                tm.playerKey === selectedPlayer.playerKey
                  ? {
                      background: "var(--text-main)",
                      color: "#ffffff",
                      borderColor: "var(--text-main)",
                    }
                  : {}
              }
            >
              {tm.name}（{tm.mainCharName} / {tm.sfl.point}pt）
            </button>
          ))}
      </div>
    </>
  );
}
