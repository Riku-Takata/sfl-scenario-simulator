import React, { useEffect, useMemo, useState } from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { CHAR_NAME_JP_MAP } from "@/lib/player-encyclopedia";
import { TEAM_META_MAP } from "@/lib/simulator";

interface Props {
  players: PlayerEncyclopediaEntry[];
}

type SortKey = "point" | "overall" | "winRate" | "battleWinRate" | "vsChar";

function RadarChartSvg({
  params,
  color,
}: {
  params: PlayerEncyclopediaEntry["parameters"];
  color: string;
}) {
  const size = 250;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 84;

  const axes = [
    { label: "ポイント獲得", value: params.pointEfficiency },
    { label: "大将・勝負強さ", value: params.clutchPower },
    { label: "HOME制圧力", value: params.homeControl },
    { label: "AWAY突破力", value: params.awayResilience },
    { label: "ラウンド支配", value: params.roundDominance },
    { label: "対応キャラ幅", value: params.matchupCoverage },
  ];

  const getPoint = (index: number, val: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const gridLevels = [25, 50, 75, 100];
  const dataPoints = axes.map((a, i) => getPoint(i, a.value));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
      role="img"
      aria-label="選手パラメーター6角形レーダーチャート"
    >
      {/* 背景グリッド */}
      {gridLevels.map((lvl) => {
        const pts = axes
          .map((_, i) => {
            const p = getPoint(i, lvl);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={pts}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={lvl === 100 ? 1.5 : 1}
            strokeDasharray={lvl === 50 ? "3 2" : undefined}
          />
        );
      })}

      {/* 軸線 */}
      {axes.map((_, i) => {
        const end = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        );
      })}

      {/* データポリゴン */}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2.5}
      />

      {/* 頂点ドット & ラベル */}
      {axes.map((a, i) => {
        const pt = dataPoints[i];
        const labelPt = getPoint(i, 122);
        return (
          <g key={a.label}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10.5"
              fontWeight="700"
              fill="#334155"
            >
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PlayerEncyclopedia({ players }: Props) {
  const [divFilter, setDivFilter] = useState<"all" | "s" | "f">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [vsCharFilter, setVsCharFilter] = useState<string>("none");
  const [sortBy, setSortBy] = useState<SortKey>("point");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string>(
    players[0]?.playerKey ?? "mena"
  );
  const [showAllVsChars, setShowAllVsChars] = useState<boolean>(false);

  // URLクエリ (?player=xxx) からの初期選択反映
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qPlayer = params.get("player");
    const qTeam = params.get("team");
    if (qPlayer && players.some((p) => p.playerKey === qPlayer)) {
      setSelectedPlayerKey(qPlayer);
    }
    if (qTeam && Object.hasOwn(TEAM_META_MAP, qTeam)) {
      setTeamFilter(qTeam);
    }
  }, [players]);

  const handleSelectPlayer = (pKey: string, scroll = true) => {
    setSelectedPlayerKey(pKey);
    if (typeof window !== "undefined") {
      const nextUrl = `${window.location.pathname}?player=${pKey}`;
      window.history.replaceState(null, "", nextUrl);
      if (scroll) {
        const el = document.getElementById("player-detail-panel");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  // 全28キャラクター選択肢
  const allCharacters = useMemo(() => {
    const first = players[0];
    if (!first) return [];
    return [...first.vsCharacters].sort((a, b) =>
      a.charName.localeCompare(b.charName, "ja")
    );
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = players.filter((p) => {
      if (divFilter !== "all" && p.division !== divFilter) return false;
      if (teamFilter !== "all" && p.teamKey !== teamFilter) return false;
      if (q) {
        const matchName =
          p.name.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.teamShort.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.mainCharName.toLowerCase().includes(q) ||
          p.subCharNames.some((sc) => sc.toLowerCase().includes(q));
        if (!matchName) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (vsCharFilter !== "none") {
        const rateA =
          a.vsCharacters.find((c) => c.charKey === vsCharFilter)
            ?.estimatedWinRate ?? 0;
        const rateB =
          b.vsCharacters.find((c) => c.charKey === vsCharFilter)
            ?.estimatedWinRate ?? 0;
        if (rateB !== rateA) return rateB - rateA;
      }
      if (sortBy === "overall") {
        return (
          b.parameters.overallScore - a.parameters.overallScore ||
          b.sfl.point - a.sfl.point
        );
      }
      if (sortBy === "winRate") {
        return b.sfl.winRate - a.sfl.winRate || b.sfl.point - a.sfl.point;
      }
      if (sortBy === "battleWinRate") {
        return (
          b.sfl.battleWinRate - a.sfl.battleWinRate ||
          b.sfl.point - a.sfl.point
        );
      }
      return (
        b.sfl.point - a.sfl.point ||
        b.parameters.overallScore - a.parameters.overallScore
      );
    });

    return list;
  }, [players, divFilter, teamFilter, vsCharFilter, sortBy, searchQuery]);

  const selectedPlayer = useMemo(
    () =>
      players.find((p) => p.playerKey === selectedPlayerKey) ??
      filteredPlayers[0] ??
      players[0],
    [players, selectedPlayerKey, filteredPlayers]
  );

  if (!selectedPlayer) return null;

  const paramList = [
    {
      label: "ポイント獲得力",
      value: selectedPlayer.parameters.pointEfficiency,
      desc: `1出場平均 ${selectedPlayer.sfl.avgPointPerEntry}pt / 合計 ${selectedPlayer.sfl.point}pt`,
    },
    {
      label: "大将・勝負強さ",
      value: selectedPlayer.parameters.clutchPower,
      desc: `大将戦 ${selectedPlayer.positions.anchor.entries}戦${selectedPlayer.positions.anchor.wins}勝 / 延長 ${selectedPlayer.positions.tiebreaker.entries}戦${selectedPlayer.positions.tiebreaker.wins}勝`,
    },
    {
      label: "HOME後出し制圧力",
      value: selectedPlayer.parameters.homeControl,
      desc: `HOME推定勝率 ${selectedPlayer.sfl.homeWinRate.toFixed(1)}%（実戦 ${selectedPlayer.sfl.homeEntries}戦${selectedPlayer.sfl.homeWins}勝）`,
    },
    {
      label: "AWAY先出し突破力",
      value: selectedPlayer.parameters.awayResilience,
      desc: `AWAY推定勝率 ${selectedPlayer.sfl.awayWinRate.toFixed(1)}%（実戦 ${selectedPlayer.sfl.awayEntries}戦${selectedPlayer.sfl.awayWins}勝）`,
    },
    {
      label: "ラウンド支配力",
      value: selectedPlayer.parameters.roundDominance,
      desc: `バトル勝率 ${selectedPlayer.sfl.battleWinRate.toFixed(1)}% / ラウンド取得率 ${selectedPlayer.sfl.roundWinRate.toFixed(1)}%`,
    },
    {
      label: "対応キャラ幅",
      value: selectedPlayer.parameters.matchupCoverage,
      desc: `全28キャラ中 ${selectedPlayer.vsCharacters.filter((c) => c.estimatedWinRate >= 50).length}キャラに対して勝率50%以上`,
    },
  ];

  return (
    <div>
      {/* 1. 選手 상세カルテ（選択中の選手） */}
      <div
        id="player-detail-panel"
        className="panel"
        style={{
          borderTop: `5px solid ${selectedPlayer.teamColor}`,
          scrollMarginTop: "80px",
        }}
      >
        {/* 選手ヘッダー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "1.25rem",
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
                onClick={() => handleSelectPlayer(tm.playerKey, false)}
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

        {/* 2カラム：左＝6角形パラメーター / 右＝客観データ分析レポート＆ポジション別成績 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* 左：6角形レーダーチャート ＆ 指標バー */}
          <div
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "1.1rem",
            }}
          >
            <h3
              style={{
                fontSize: "0.98rem",
                fontWeight: 800,
                marginBottom: "0.5rem",
              }}
            >
              戦績ベース・6角形パラメーター（主観ゼロ・統計算出）
            </h3>
            <RadarChartSvg
              params={selectedPlayer.parameters}
              color={selectedPlayer.teamColor}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
                marginTop: "0.5rem",
              }}
            >
              {paramList.map((pm) => (
                <div key={pm.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                    }}
                  >
                    <span>{pm.label}</span>
                    <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                      {pm.value} / 100
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "7px",
                      background: "#e2e8f0",
                      borderRadius: "999px",
                      overflow: "hidden",
                      margin: "0.2rem 0",
                    }}
                  >
                    <div
                      style={{
                        width: `${pm.value}%`,
                        height: "100%",
                        background:
                          pm.value >= 75
                            ? "var(--success)"
                            : pm.value >= 60
                              ? "var(--primary)"
                              : "var(--warning)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {pm.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右：データから見る選手の特徴 ＆ ポジション別起用実績 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1.1rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.98rem",
                  fontWeight: 800,
                  marginBottom: "0.65rem",
                }}
              >
                公式戦績データから見る「{selectedPlayer.name}」の特徴
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                  color: "var(--text-sub)",
                }}
              >
                {selectedPlayer.objectiveSummary.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "0.65rem 0.85rem",
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* ポジション別出場・勝敗テーブル */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1.1rem",
                minWidth: 0,
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  marginBottom: "0.65rem",
                }}
              >
                SFL 2026 ポジション別起用・獲得ポイント内訳
              </h3>
              <div
                className="table-scroll"
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  overflowX: "auto",
                }}
              >
                <table
                  className="standings-table"
                  style={{
                    minWidth: "100%",
                    width: "100%",
                    background: "#ffffff",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: "0.6rem 0.75rem" }}>ポジション</th>
                      <th style={{ padding: "0.6rem 0.65rem", textAlign: "center" }}>配点</th>
                      <th style={{ padding: "0.6rem 0.65rem", textAlign: "center" }}>出場数</th>
                      <th style={{ padding: "0.6rem 0.65rem", textAlign: "center" }}>勝敗</th>
                      <th style={{ padding: "0.6rem 0.65rem", textAlign: "right" }}>勝率</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>獲得pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        name: "先鋒戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.vanguard,
                      },
                      {
                        name: "中堅戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.middle,
                      },
                      {
                        name: "大将戦",
                        pt: "20pt",
                        rec: selectedPlayer.positions.anchor,
                      },
                      {
                        name: "延長戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.tiebreaker,
                      },
                    ].map((row, idx, arr) => (
                      <tr key={row.name}>
                        <td
                          style={{
                            padding: "0.65rem 0.75rem",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.name}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            color: "var(--text-muted)",
                            fontSize: "0.82rem",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.pt}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.entries}戦
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            fontWeight: 700,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.wins}勝{row.rec.losses}敗
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            textAlign: "right",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.entries > 0 ? `${row.rec.winRate}%` : "-"}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.75rem",
                            fontWeight: 800,
                            color: "var(--primary)",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.points}pt
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* 対キャラクター相性セクション：「このキャラに対してはこれくらい強い！」 */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                対キャラクター相性データ（このキャラに対してどれくらい強いか）
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                過去の公式大会・SFL実戦ログから算出された、相手キャラクター別の推定勝率とSFL実戦バトル成績です。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAllVsChars((prev) => !prev)}
              className="btn"
            >
              {showAllVsChars
                ? "全28キャラ一覧を閉じる"
                : "全28キャラクターとの相性一覧を表示する"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* 得意キャラ TOP 5 */}
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
                ◎ 得意としている相手キャラクター TOP 5
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {selectedPlayer.strongestMatchups.map((m, idx) => (
                  <div
                    key={m.charKey}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#ffffff",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.86rem",
                    }}
                  >
                    <div>
                      <strong style={{ marginRight: "0.4rem" }}>
                        {idx + 1}. vs {m.charName}
                      </strong>
                      {(m.sflBoutsWon > 0 || m.sflBoutsLost > 0) && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          （SFL実戦 {m.sflBattlesWon}勝{m.sflBattlesLost}敗）
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontWeight: 800,
                        color: "var(--success)",
                        fontSize: "0.95rem",
                      }}
                    >
                      勝率 {m.estimatedWinRate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 接戦・要注意キャラ TOP 5 */}
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
                △ 接戦・警戒が必要な相手キャラクター TOP 5
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {selectedPlayer.closestMatchups.map((m, idx) => (
                  <div
                    key={m.charKey}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#ffffff",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.86rem",
                    }}
                  >
                    <div>
                      <strong style={{ marginRight: "0.4rem" }}>
                        {idx + 1}. vs {m.charName}
                      </strong>
                      {(m.sflBoutsWon > 0 || m.sflBoutsLost > 0) && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          （SFL実戦 {m.sflBattlesWon}勝{m.sflBattlesLost}敗）
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontWeight: 800,
                        color: "var(--warning)",
                        fontSize: "0.95rem",
                      }}
                    >
                      勝率 {m.estimatedWinRate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 全28キャラクター相性一覧グリッド */}
          {showAllVsChars && (
            <div
              style={{
                marginTop: "1rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: "0.6rem",
              }}
            >
              {selectedPlayer.vsCharacters.map((vc) => (
                <div
                  key={vc.charKey}
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                    fontSize: "0.82rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 800,
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span>vs {vc.charName}</span>
                    <span
                      style={{
                        color:
                          vc.estimatedWinRate >= 52
                            ? "var(--success)"
                            : vc.estimatedWinRate < 48
                              ? "var(--danger)"
                              : "var(--text-main)",
                      }}
                    >
                      {vc.estimatedWinRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="prob-bar-wrap" style={{ width: "100%" }}>
                    <div
                      className="prob-bar-fill"
                      style={{
                        width: `${Math.min(100, vc.estimatedWinRate)}%`,
                        background:
                          vc.estimatedWinRate >= 52
                            ? "var(--success)"
                            : vc.estimatedWinRate < 48
                              ? "var(--warning)"
                              : "var(--primary)",
                      }}
                    />
                  </div>
                  {(vc.sflBattlesWon > 0 || vc.sflBattlesLost > 0) && (
                    <div
                      style={{
                        fontSize: "0.73rem",
                        color: "var(--text-muted)",
                        marginTop: "0.25rem",
                      }}
                    >
                      SFL実戦バトル: {vc.sflBattlesWon}勝{vc.sflBattlesLost}敗
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SFL 2026 実戦出場ログ */}
        {selectedPlayer.boutLogs.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              paddingTop: "1.1rem",
            }}
          >
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 800,
                marginBottom: "0.65rem",
              }}
            >
              SFL 2026 出場対戦ログ（全{selectedPlayer.boutLogs.length}試合）
            </h3>
            <div className="table-scroll">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>節</th>
                    <th>ポジション</th>
                    <th>SIDE</th>
                    <th>使用キャラ</th>
                    <th>対戦相手</th>
                    <th>相手キャラ</th>
                    <th>バトルスコア</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlayer.boutLogs.map((log, i) => (
                    <tr key={`${log.matchId}-${log.status}-${i}`}>
                      <td style={{ fontWeight: 700 }}>{log.sectionTitle}</td>
                      <td style={{ fontWeight: 800 }}>{log.statusName}</td>
                      <td>
                        <span
                          className={`badge ${
                            log.side === "home" ? "badge-home" : "badge-away"
                          }`}
                        >
                          {log.side.toUpperCase()}
                        </span>
                      </td>
                      <td>{CHAR_NAME_JP_MAP[log.myChar] || log.myChar}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectPlayer(log.opponentPlayerKey, true)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "var(--primary)",
                            fontWeight: 800,
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {log.opponentPlayerName}（{log.opponentTeamShort}）
                        </button>
                      </td>
                      <td>
                        {CHAR_NAME_JP_MAP[log.opponentChar] || log.opponentChar}
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        {log.myBattle} - {log.opponentBattle}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: log.won
                              ? "var(--success-bg)"
                              : "var(--danger-bg)",
                            color: log.won ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {log.won ? `勝利 (+${log.myPoint}pt)` : "敗北"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. 全48選手 検索・絞り込み・逆引きランキング */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              全48選手 データ一覧・対キャラ相性逆引き検索
            </h2>
            <p
              style={{
                fontSize: "0.84rem",
                color: "var(--text-muted)",
                marginTop: "0.2rem",
              }}
            >
              選手カードをクリックすると、上部の詳細パラメーター・対キャラ相性カルテが切り替わります。
            </p>
          </div>
        </div>

        {/* フィルターバー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            padding: "0.85rem 1rem",
            background: "var(--bg-subtle)",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            marginBottom: "1.25rem",
          }}
        >
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
            <option value="all">すべてのチーム</option>
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
            placeholder="選手名・キャラ名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontSize: "0.85rem",
              minWidth: "180px",
              flex: 1,
            }}
          />
        </div>

        {/* 選手カードグリッド */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "0.9rem",
          }}
        >
          {filteredPlayers.map((p) => {
            const isSelected = p.playerKey === selectedPlayer.playerKey;
            const vsTarget =
              vsCharFilter !== "none"
                ? p.vsCharacters.find((c) => c.charKey === vsCharFilter)
                : null;

            return (
              <div
                key={p.playerKey}
                onClick={() => handleSelectPlayer(p.playerKey, true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectPlayer(p.playerKey, true);
                  }
                }}
                style={{
                  background: isSelected ? "#eff6ff" : "#ffffff",
                  border: isSelected
                    ? "2px solid var(--primary)"
                    : "1px solid var(--border-color)",
                  borderLeft: `5px solid ${p.teamColor}`,
                  borderRadius: "10px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "box-shadow 0.15s, transform 0.15s",
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
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "var(--text-main)",
                      }}
                    >
                      {p.name}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: "var(--primary-light)",
                      color: "var(--primary)",
                      fontWeight: 800,
                    }}
                  >
                    評価 {p.parameters.overallGrade} ({p.parameters.overallScore})
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "var(--text-sub)",
                    marginBottom: "0.55rem",
                  }}
                >
                  使用キャラ: <strong>{p.mainCharName}</strong>
                  {p.subCharNames.length > 0 &&
                    ` / ${p.subCharNames.slice(0, 2).join("・")}`}
                </div>

                {vsTarget && (
                  <div
                    style={{
                      background: "var(--success-bg)",
                      border: "1px solid var(--success-border)",
                      color: "var(--success)",
                      borderRadius: "6px",
                      padding: "0.35rem 0.6rem",
                      fontSize: "0.82rem",
                      fontWeight: 800,
                      marginBottom: "0.55rem",
                    }}
                  >
                    vs {vsTarget.charName} 推定勝率:{" "}
                    {vsTarget.estimatedWinRate.toFixed(1)}%
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.4rem",
                    background: "var(--bg-subtle)",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    fontSize: "0.78rem",
                    marginBottom: "0.55rem",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>獲得pt</div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        color: "var(--primary)",
                      }}
                    >
                      {p.sfl.point}pt
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>SFL勝敗</div>
                    <div style={{ fontWeight: 800 }}>
                      {p.sfl.victory}勝{p.sfl.losses}敗
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>バトル勝率</div>
                    <div style={{ fontWeight: 800 }}>
                      {p.sfl.battleWinRate.toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "0.76rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    得意:{" "}
                    {p.strongestMatchups
                      .slice(0, 2)
                      .map((m) => m.charName)
                      .join("・")}
                  </span>
                  <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                    詳細を見る →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
