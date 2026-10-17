import React from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { RadarChartSvg } from "./RadarChartSvg";

interface PlayerDetailStatsProps {
  selectedPlayer: PlayerEncyclopediaEntry;
}

export function PlayerDetailStats({ selectedPlayer }: PlayerDetailStatsProps) {
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
      desc: `今期SFL対戦済み ${selectedPlayer.vsCharacters.filter((c) => c.playedInSfl).length}キャラ中 ${selectedPlayer.vsCharacters.filter((c) => c.playedInSfl && (c.sflBattleWinRate ?? 0) >= 50).length}キャラ相手に勝率50%以上`,
    },
  ];

  return (
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
          minWidth: 0,
        }}
      >
        <h3
          style={{
            fontSize: "0.98rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
          }}
        >
          戦績ベース・6角形パラメーター
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
                  <th
                    style={{
                      padding: "0.6rem 0.65rem",
                      textAlign: "center",
                    }}
                  >
                    配点
                  </th>
                  <th
                    style={{
                      padding: "0.6rem 0.65rem",
                      textAlign: "center",
                    }}
                  >
                    出場数
                  </th>
                  <th
                    style={{
                      padding: "0.6rem 0.65rem",
                      textAlign: "center",
                    }}
                  >
                    勝敗
                  </th>
                  <th
                    style={{
                      padding: "0.6rem 0.65rem",
                      textAlign: "right",
                    }}
                  >
                    勝率
                  </th>
                  <th
                    style={{
                      padding: "0.6rem 0.75rem",
                      textAlign: "right",
                    }}
                  >
                    獲得pt
                  </th>
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
  );
}
