import React from "react";
import type { VsCharDetail } from "@/lib/player-encyclopedia";
import { TEAM_META_MAP } from "@/lib/simulator";

export type SortKey = "point" | "overall" | "winRate" | "battleWinRate" | "vsChar";

interface PlayerFilterBarProps {
  matchupMode: "tournament" | "sfl2026";
  setMatchupMode: (mode: "tournament" | "sfl2026") => void;
  divFilter: "all" | "s" | "f";
  setDivFilter: (div: "all" | "s" | "f") => void;
  teamFilter: string;
  setTeamFilter: (team: string | ((prev: string) => string)) => void;
  vsCharFilter: string;
  setVsCharFilter: (char: string) => void;
  sortBy: SortKey;
  setSortBy: (sort: SortKey) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  allCharacters: VsCharDetail[];
}

export function PlayerFilterBar({
  matchupMode,
  setMatchupMode,
  divFilter,
  setDivFilter,
  teamFilter,
  setTeamFilter,
  vsCharFilter,
  setVsCharFilter,
  sortBy,
  setSortBy,
  searchQuery,
  setSearchQuery,
  allCharacters,
}: PlayerFilterBarProps) {
  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.9rem 1rem",
          background: "var(--bg-subtle)",
          borderRadius: "10px",
          border: "1px solid var(--border-color)",
          marginBottom: "1rem",
        }}
      >
        {/* 集計モード切替 */}
        <div
          style={{
            display: "inline-flex",
            background: "#e2e8f0",
            padding: "2px",
            borderRadius: "8px",
            gap: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setMatchupMode("tournament")}
            style={{
              padding: "0.38rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor: "pointer",
              background:
                matchupMode === "tournament" ? "var(--primary)" : "transparent",
              color:
                matchupMode === "tournament" ? "#ffffff" : "var(--text-sub)",
              boxShadow:
                matchupMode === "tournament"
                  ? "0 1px 3px rgba(0,0,0,0.15)"
                  : "none",
              transition: "all 0.15s ease",
            }}
          >
            ★ SF6公式・大型大会 通算実戦
          </button>
          <button
            type="button"
            onClick={() => setMatchupMode("sfl2026")}
            style={{
              padding: "0.38rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor: "pointer",
              background:
                matchupMode === "sfl2026" ? "var(--primary)" : "transparent",
              color:
                matchupMode === "sfl2026" ? "#ffffff" : "var(--text-sub)",
              boxShadow:
                matchupMode === "sfl2026"
                  ? "0 1px 3px rgba(0,0,0,0.15)"
                  : "none",
              transition: "all 0.15s ease",
            }}
          >
            今期 SFL 2026 実戦のみ
          </button>
        </div>

        {/* Division 切替 */}
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {[
            { id: "all", label: "全選手 (48名)" },
            { id: "s", label: "Division S (24名)" },
            { id: "f", label: "Division F (24名)" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setDivFilter(tab.id as "all" | "s" | "f");
                setTeamFilter("all");
              }}
              className="score-chip"
              style={
                divFilter === tab.id
                  ? {
                      background: "var(--text-main)",
                      color: "#ffffff",
                      borderColor: "var(--text-main)",
                    }
                  : {}
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* チーム絞り込み */}
        <select
          aria-label="チームで絞り込み"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          style={{
            padding: "0.45rem 0.7rem",
            borderRadius: "8px",
            border: "1px solid var(--border-strong)",
            background: "#ffffff",
            fontWeight: 700,
            fontSize: "0.84rem",
          }}
        >
          <option value="all">すべてのチーム (12チーム)</option>
          {Object.values(TEAM_META_MAP)
            .filter((t) => divFilter === "all" || t.division === divFilter)
            .map((t) => (
              <option key={t.key} value={t.key}>
                {t.shortName}（{t.name}）
              </option>
            ))}
        </select>

        {/* 対キャラ逆引きソート */}
        <select
          aria-label="特定キャラに対して強い選手を逆引き"
          value={vsCharFilter}
          onChange={(e) => {
            setVsCharFilter(e.target.value);
            if (e.target.value !== "none") setSortBy("vsChar");
          }}
          style={{
            padding: "0.45rem 0.7rem",
            borderRadius: "8px",
            border: "1px solid var(--primary)",
            background: "#ffffff",
            color: "var(--primary)",
            fontWeight: 800,
            fontSize: "0.84rem",
          }}
        >
          <option value="none">対キャラ相性で逆引き（指定なし）</option>
          {allCharacters.map((c) => (
            <option key={c.charKey} value={c.charKey}>
              「vs {c.charName}」に強い選手順で並べる
            </option>
          ))}
        </select>

        {/* 並び順 */}
        <select
          aria-label="並び順"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          style={{
            padding: "0.45rem 0.7rem",
            borderRadius: "8px",
            border: "1px solid var(--border-strong)",
            background: "#ffffff",
            fontWeight: 700,
            fontSize: "0.84rem",
          }}
        >
          <option value="point">SFL獲得ポイント順</option>
          <option value="overall">総合データ評価順</option>
          <option value="winRate">SFL試合勝率順</option>
          <option value="battleWinRate">バトル勝率順</option>
        </select>

        {/* フリーワード検索 */}
        <input
          type="search"
          placeholder="選手名・キャラ名・チーム名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: "0.45rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid var(--border-strong)",
            background: "#ffffff",
            fontSize: "0.85rem",
            minWidth: "190px",
            flex: 1,
          }}
        />
      </div>

      {/* チームクイックフィルターチップ */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          marginBottom: "1.25rem",
        }}
      >
        <button
          type="button"
          onClick={() => setTeamFilter("all")}
          className="score-chip"
          style={
            teamFilter === "all"
              ? {
                  background: "var(--primary)",
                  color: "#ffffff",
                  borderColor: "var(--primary)",
                }
              : {}
          }
        >
          全チーム表示
        </button>
        {Object.values(TEAM_META_MAP)
          .filter((t) => divFilter === "all" || t.division === divFilter)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() =>
                setTeamFilter((prev) => (prev === t.key ? "all" : t.key))
              }
              className="score-chip"
              style={
                teamFilter === t.key
                  ? {
                      background: t.color,
                      color: "#ffffff",
                      borderColor: t.color,
                    }
                  : {}
              }
            >
              {t.shortName}
            </button>
          ))}
      </div>
    </>
  );
}
