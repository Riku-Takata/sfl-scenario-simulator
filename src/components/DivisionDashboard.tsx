import React, { useState } from "react";
import type {
  DivisionId,
  MatchesData,
  ScenariosData,
  StandingsData,
} from "@/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "@/lib/simulator";

export interface UnplayedMatchPrediction {
  matchId: string;
  awayWinProb: number;
  homeWinProb: number;
  expectedAwayPts: number;
  expectedHomePts: number;
  mostLikelyScore: string;
  bouts: Array<{
    roleName: string;
    awayPlayerKey: string;
    awayPlayerName: string;
    awayCharName: string;
    awayWinRate: number;
    homePlayerKey: string;
    homePlayerName: string;
    homeCharName: string;
    homeWinRate: number;
  }>;
}

interface Props {
  standingsData: StandingsData;
  matchesData: MatchesData;
  scenariosData: ScenariosData;
  matchPredictions?: Record<string, UnplayedMatchPrediction>;
}

export default function DivisionDashboard({
  standingsData,
  matchesData,
  scenariosData,
  matchPredictions = {},
}: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [selectedSection, setSelectedSection] = useState<number | "next">("next");

  const standings = standingsData.divisions[division];
  const borders = scenariosData.divisionBorders[division];
  const completedSec = matchesData.completedSectionCount[division];

  const divMatches = matchesData.matches.filter((m) => m.division === division);
  const nextUnplayedSec =
    divMatches.find((m) => !m.played)?.sectionNumber ?? 10;
  const activeSecNum =
    selectedSection === "next" ? nextUnplayedSec : selectedSection;

  const sectionMatches = divMatches.filter(
    (m) => m.sectionNumber === activeSecNum
  );

  return (
    <div>
      {/* Division S / F 切り替えタブ */}
      <div className="div-tabs">
        <button
          type="button"
          onClick={() => {
            setDivision("s");
            setSelectedSection("next");
          }}
          className={`div-tab ${division === "s" ? "active-s" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division S
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              FAV / CR / SOL / ZETA / iXA / IBSG
            </div>
          </div>
          <span
            className="badge"
            style={{
              background: division === "s" ? "#ea580c" : "#e2e8f0",
              color: division === "s" ? "#ffffff" : "var(--text-sub)",
            }}
          >
            第{matchesData.completedSectionCount.s}節終了 / 全10節
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDivision("f");
            setSelectedSection("next");
          }}
          className={`div-tab ${division === "f" ? "active-f" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division F
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              VARREL / G8S / DFM / OJA / RC / RID
            </div>
          </div>
          <span
            className="badge"
            style={{
              background: division === "f" ? "#0284c7" : "#e2e8f0",
              color: division === "f" ? "#ffffff" : "var(--text-sub)",
            }}
          >
            第{matchesData.completedSectionCount.f}節終了 / 全10節
          </span>
        </button>
      </div>

      {/* 順位表テーブル */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              Division {division.toUpperCase()} 現在の順位表（第{completedSec}節終了時点）
            </h2>
            <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              上位3チームがプレイオフ進出（1位：決勝シード / 2位：準決勝HOME権 / 3位：準決勝AWAY）
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.84rem", color: "var(--text-sub)" }}>
            <span>1位目安: <strong>{borders.firstAvgPoints}pt</strong></span>
            <span>2位目安: <strong>{borders.secondAvgPoints}pt</strong></span>
            <span>3位ボーダー目安: <strong>{borders.thirdAvgPoints}pt</strong></span>
          </div>
        </div>

        <div className="table-scroll">
          <table className="standings-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>チーム</th>
                <th>ポイント</th>
                <th>勝敗</th>
                <th>バトル得失</th>
                <th>ラウンド得失</th>
                <th>残り試合</th>
                <th>PO進出率 (3位内)</th>
                <th>1位突破率</th>
                <th>チーム別条件</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, idx) => {
                const sc = scenariosData.teams[team.key];
                const poProb = sc?.probabilities.playoffTop3 ?? 0;
                const firstProb = sc?.probabilities.firstPlace ?? 0;

                return (
                  <React.Fragment key={team.key}>
                    <tr>
                      <td>
                        <span
                          className={`rank-badge ${
                            team.rank === 1
                              ? "rank-1"
                              : team.rank === 2
                                ? "rank-2"
                                : team.rank === 3
                                  ? "rank-3"
                                  : ""
                          }`}
                        >
                          {team.rank}
                        </span>
                      </td>
                      <td>
                        <a
                          href={`/team/${team.key}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.65rem",
                          }}
                        >
                          <span
                            style={{
                              width: "5px",
                              height: "32px",
                              borderRadius: "3px",
                              background: team.color,
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: "0.96rem", color: "var(--text-main)" }}>
                              {team.name}
                            </div>
                            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                              {team.players
                                .map((p) => PLAYER_NAME_MAP[p] || p)
                                .slice(0, 4)
                                .join(" / ")}
                            </div>
                          </div>
                        </a>
                      </td>
                      <td>
                        <strong style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                          {team.point}
                        </strong>{" "}
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>pt</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {team.victory}勝{team.entry - team.victory}敗
                      </td>
                      <td
                        style={{
                          fontWeight: 700,
                          color:
                            team.battleDiff > 0
                              ? "var(--success)"
                              : team.battleDiff < 0
                                ? "var(--danger)"
                                : "var(--text-sub)",
                        }}
                      >
                        {team.battleDiff > 0 ? `+${team.battleDiff}` : team.battleDiff}
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color:
                            team.roundDiff > 0
                              ? "var(--success)"
                              : team.roundDiff < 0
                                ? "var(--danger)"
                                : "var(--text-muted)",
                        }}
                      >
                        {team.roundDiff > 0 ? `+${team.roundDiff}` : team.roundDiff}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>残り{team.remainingMatches}戦</span>{" "}
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          (H{team.remainingHome}/A{team.remainingAway})
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: poProb >= 50 ? "var(--success)" : "var(--text-main)" }}>
                          {poProb.toFixed(1)}%
                        </div>
                        <div className="prob-bar-wrap">
                          <div
                            className="prob-bar-fill"
                            style={{
                              width: `${Math.min(100, poProb)}%`,
                              background:
                                poProb >= 60
                                  ? "var(--success)"
                                  : poProb >= 30
                                    ? "var(--warning)"
                                    : "var(--danger)",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: firstProb >= 25 ? "var(--warning)" : "var(--text-muted)" }}>
                        {firstProb.toFixed(1)}%
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                          {sc?.personalizedOutlook && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                background:
                                  sc.personalizedOutlook.feasibilityLevel === "favorite"
                                    ? "rgba(16, 185, 129, 0.15)"
                                    : sc.personalizedOutlook.feasibilityLevel === "realistic"
                                      ? "rgba(59, 130, 246, 0.15)"
                                      : sc.personalizedOutlook.feasibilityLevel === "challenging"
                                        ? "rgba(245, 158, 11, 0.15)"
                                        : "rgba(239, 68, 68, 0.15)",
                                color:
                                  sc.personalizedOutlook.feasibilityLevel === "favorite"
                                    ? "#059669"
                                    : sc.personalizedOutlook.feasibilityLevel === "realistic"
                                      ? "#2563eb"
                                      : sc.personalizedOutlook.feasibilityLevel === "challenging"
                                        ? "#d97706"
                                        : "#dc2626",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {sc.personalizedOutlook.feasibilityBadgeText}
                            </span>
                          )}
                          <a href={`/team/${team.key}`} className="btn" style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}>
                            突破条件を見る →
                          </a>
                        </div>
                      </td>
                    </tr>
                    {idx === 2 && (
                      <tr className="borderline-row">
                        <td colSpan={10}>
                          ▲ プレイオフ進出ライン（上位3チームがプレイオフ進出） ▲
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 節別スケジュール・結果 */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            Division {division.toUpperCase()} 節別スケジュール・試合結果
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            <button
              type="button"
              onClick={() => setSelectedSection("next")}
              className="score-chip"
              style={
                selectedSection === "next"
                  ? {
                      background: "var(--primary)",
                      color: "#ffffff",
                      borderColor: "var(--primary)",
                    }
                  : {}
              }
            >
              次節 (第{nextUnplayedSec}節)
            </button>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((secNum) => (
              <button
                key={secNum}
                type="button"
                onClick={() => setSelectedSection(secNum)}
                className="score-chip"
                style={
                  activeSecNum === secNum && selectedSection !== "next"
                    ? {
                        background: "var(--text-main)",
                        color: "#ffffff",
                        borderColor: "var(--text-main)",
                      }
                    : {}
                }
              >
                第{secNum}節 {secNum <= completedSec ? "✓" : ""}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
            gap: "1rem",
          }}
        >
          {sectionMatches.map((m) => {
            const homeMeta = TEAM_META_MAP[m.home];
            const awayMeta = TEAM_META_MAP[m.away];

            return (
              <div
                key={m.id}
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  padding: "1.1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.65rem",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {m.sectionTitle} 第{m.matchNumber}試合 ({m.scheduledAt.slice(0, 10)})
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: m.played ? "var(--success-bg)" : "var(--warning-bg)",
                      color: m.played ? "var(--success)" : "var(--warning)",
                    }}
                  >
                    {m.played ? (m.isTiebreaker ? "試合終了 (延長)" : "試合終了") : "未消化"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.5rem 0",
                  }}
                >
                  <a href={`/team/${m.away}`} style={{ flex: 1, textAlign: "left" }}>
                    <span className="badge badge-away">AWAY</span>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", marginTop: "0.25rem" }}>
                      {awayMeta?.shortName ?? m.away}
                    </div>
                  </a>

                  <div style={{ textAlign: "center", minWidth: "90px" }}>
                    {m.played ? (
                      <div style={{ fontSize: "1.45rem", fontWeight: 800 }}>
                        <span
                          style={{
                            color:
                              m.winner === "away"
                                ? "var(--primary)"
                                : "var(--text-muted)",
                          }}
                        >
                          {m.awayPoint}
                        </span>
                        <span style={{ margin: "0 0.35rem", color: "var(--text-muted)" }}>
                          -
                        </span>
                        <span
                          style={{
                            color:
                              m.winner === "home"
                                ? "var(--success)"
                                : "var(--text-muted)",
                          }}
                        >
                          {m.homePoint}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                        VS
                      </div>
                    )}
                  </div>

                  <a href={`/team/${m.home}`} style={{ flex: 1, textAlign: "right" }}>
                    <span className="badge badge-home">HOME</span>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", marginTop: "0.25rem" }}>
                      {homeMeta?.shortName ?? m.home}
                    </div>
                  </a>
                </div>

                {m.bouts && m.bouts.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.65rem",
                      paddingTop: "0.65rem",
                      borderTop: "1px solid var(--border-color)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {m.bouts.map((b) => (
                      <div
                        key={b.status}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.2rem 0",
                          color: "var(--text-sub)",
                        }}
                      >
                        <span style={{ width: "40%", textAlign: "left" }}>
                          <a
                            href={`/players?player=${b.awayPlayer}`}
                            style={{ color: "inherit", textDecoration: "underline" }}
                          >
                            {PLAYER_NAME_MAP[b.awayPlayer] || b.awayPlayer}
                          </a>{" "}
                          <strong>({b.awayBattle})</strong>
                        </span>
                        <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>
                          {b.statusName}
                        </span>
                        <span style={{ width: "40%", textAlign: "right" }}>
                          <strong>({b.homeBattle})</strong>{" "}
                          <a
                            href={`/players?player=${b.homePlayer}`}
                            style={{ color: "inherit", textDecoration: "underline" }}
                          >
                            {PLAYER_NAME_MAP[b.homePlayer] || b.homePlayer}
                          </a>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!m.played && matchPredictions[m.id] && (() => {
                  const pred = matchPredictions[m.id];
                  return (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid var(--border-color)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {/* チーム予想勝率 & 2色バー */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontWeight: 800,
                          marginBottom: "0.3rem",
                        }}
                      >
                        <span style={{ color: "var(--primary)" }}>
                          AWAY勝率 {pred.awayWinProb.toFixed(1)}%
                        </span>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          最有力: {pred.mostLikelyScore}
                        </span>
                        <span style={{ color: "var(--success)" }}>
                          HOME勝率 {pred.homeWinProb.toFixed(1)}%
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          width: "100%",
                          height: "8px",
                          borderRadius: "999px",
                          overflow: "hidden",
                          background: "#e2e8f0",
                          marginBottom: "0.45rem",
                        }}
                      >
                        <div
                          style={{
                            width: `${pred.awayWinProb}%`,
                            background: "var(--primary)",
                          }}
                        />
                        <div
                          style={{
                            width: `${pred.homeWinProb}%`,
                            background: "var(--success)",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.74rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.65rem",
                        }}
                      >
                        <span>期待獲得: {pred.expectedAwayPts.toFixed(1)}pt</span>
                        <span>HOME後出し考慮・組み合わせ予測</span>
                        <span>期待獲得: {pred.expectedHomePts.toFixed(1)}pt</span>
                      </div>

                      {/* 先鋒・中堅・大将の予想組み合わせと勝率 */}
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "0.5rem 0.65rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem",
                        }}
                      >
                        {pred.bouts.map((b) => (
                          <div
                            key={b.roleName}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "0.78rem",
                              borderBottom:
                                b.roleName.startsWith("大将")
                                  ? "none"
                                  : "1px dashed var(--border-color)",
                              paddingBottom: b.roleName.startsWith("大将")
                                ? 0
                                : "0.35rem",
                            }}
                          >
                            {/* AWAY 選手 */}
                            <div style={{ width: "41%", textAlign: "left" }}>
                              <div>
                                <a
                                  href={`/players?player=${b.awayPlayerKey}`}
                                  style={{
                                    fontWeight: 800,
                                    color: "var(--text-main)",
                                  }}
                                >
                                  {b.awayPlayerName}
                                </a>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    marginLeft: "0.2rem",
                                  }}
                                >
                                  ({b.awayCharName})
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "0.73rem",
                                  fontWeight: 800,
                                  color:
                                    b.awayWinRate >= 50
                                      ? "var(--primary)"
                                      : "var(--text-muted)",
                                }}
                              >
                                勝率 {b.awayWinRate.toFixed(1)}%
                              </div>
                            </div>

                            {/* ポジション */}
                            <div
                              style={{
                                width: "18%",
                                textAlign: "center",
                                fontSize: "0.72rem",
                                fontWeight: 800,
                                color: "var(--text-muted)",
                              }}
                            >
                              {b.roleName.replace(" (10pt)", "").replace(" (20pt)", "")}
                              <div style={{ fontSize: "0.66rem", fontWeight: 600 }}>
                                {b.roleName.includes("20pt") ? "20pt" : "10pt"}
                              </div>
                            </div>

                            {/* HOME 選手 */}
                            <div style={{ width: "41%", textAlign: "right" }}>
                              <div>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    marginRight: "0.2rem",
                                  }}
                                >
                                  ({b.homeCharName})
                                </span>
                                <a
                                  href={`/players?player=${b.homePlayerKey}`}
                                  style={{
                                    fontWeight: 800,
                                    color: "var(--text-main)",
                                  }}
                                >
                                  {b.homePlayerName}
                                </a>
                              </div>
                              <div
                                style={{
                                  fontSize: "0.73rem",
                                  fontWeight: 800,
                                  color:
                                    b.homeWinRate >= 50
                                      ? "var(--success)"
                                      : "var(--text-muted)",
                                }}
                              >
                                勝率 {b.homeWinRate.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
