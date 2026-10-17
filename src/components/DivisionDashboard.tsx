import React, { useState } from "react";
import type {
  DivisionId,
  MatchesData,
  ScenariosData,
  StandingsData,
} from "@/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "@/lib/simulator";

interface Props {
  standingsData: StandingsData;
  matchesData: MatchesData;
  scenariosData: ScenariosData;
}

export default function DivisionDashboard({
  standingsData,
  matchesData,
  scenariosData,
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
      {/* Division Switcher */}
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                }}
              >
                DIVISION S
              </span>
              <span
                className="badge"
                style={{
                  background: "rgba(255, 94, 26, 0.2)",
                  color: "#fb923c",
                  border: "1px solid rgba(255, 94, 26, 0.4)",
                }}
              >
                第{matchesData.completedSectionCount.s}節終了 / 全10節
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              FAV / CR / SOL / ZETA / iXA / IBSG
            </div>
          </div>
          <div style={{ fontSize: "1.4rem" }}>🔥</div>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                }}
              >
                DIVISION F
              </span>
              <span
                className="badge"
                style={{
                  background: "rgba(0, 210, 255, 0.18)",
                  color: "#38bdf8",
                  border: "1px solid rgba(0, 210, 255, 0.4)",
                }}
              >
                第{matchesData.completedSectionCount.f}節終了 / 全10節
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              VARREL / G8S / DFM / OJA / RC / RID
            </div>
          </div>
          <div style={{ fontSize: "1.4rem" }}>⚡</div>
        </button>
      </div>

      {/* Summary Stat Cards with 3D Icon Badges (3dicons.co style) */}
      <div className="grid-cards">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">シーズン進行状況</div>
            <span className="icon-3d-badge" title="Progress">
              ⏱️
            </span>
          </div>
          <div className="stat-value">
            第{completedSec}節{" "}
            <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
              / 全10節
            </span>
          </div>
          <div className="stat-sub">次節注目: {borders.nextSectionTitle}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">1位突破（FINAL直行）予想平均</div>
            <span
              className="icon-3d-badge"
              style={{
                background: "linear-gradient(145deg, rgba(251,191,36,0.28), rgba(217,119,6,0.1))",
                borderColor: "rgba(251,191,36,0.45)",
              }}
              title="1st Seed Trophy"
            >
              🏆
            </span>
          </div>
          <div className="stat-value" style={{ color: "var(--accent-gold)" }}>
            {borders.firstAvgPoints} <span style={{ fontSize: "0.95rem" }}>pt</span>
          </div>
          <div className="stat-sub">プレイオフFINALシード＋無条件HOME権</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">2位確保（準決勝HOME権）予想平均</div>
            <span
              className="icon-3d-badge"
              style={{
                background: "linear-gradient(145deg, rgba(56,189,248,0.25), rgba(14,165,233,0.08))",
                borderColor: "rgba(56,189,248,0.4)",
              }}
              title="2nd Seed Shield"
            >
              🛡️
            </span>
          </div>
          <div className="stat-value" style={{ color: "#e2e8f0" }}>
            {borders.secondAvgPoints} <span style={{ fontSize: "0.95rem" }}>pt</span>
          </div>
          <div className="stat-sub">準決勝の奇数セットHOME優先権を確保</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">3位プレイオフ進出ボーダー平均</div>
            <span
              className="icon-3d-badge"
              style={{
                background: "linear-gradient(145deg, rgba(16,185,129,0.28), rgba(5,150,105,0.08))",
                borderColor: "rgba(16,185,129,0.45)",
              }}
              title="3rd Seed Target"
            >
              🎯
            </span>
          </div>
          <div className="stat-value" style={{ color: "var(--accent-green-light)" }}>
            {borders.thirdAvgPoints} <span style={{ fontSize: "0.95rem" }}>pt</span>
          </div>
          <div className="stat-sub">同率時は獲得バトル得失差→ラウンド得失差</div>
        </div>
      </div>

      {/* Standings & Probabilities Table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <span>📊 Division {division.toUpperCase()} 現在の順位表 ＆ CPTキャラ相性反映モンテカルロ突破確率</span>
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              ※CPT Top 96 キャラ相性マトリクス（ベイズ平滑化済）・選手対キャラ戦績・H2Hの重み付き予測エンジンを反映。チーム名または「4大シナリオ解説」から詳細へ移動できます。
            </p>
          </div>
          <a
            href={`/simulator?div=${division}`}
            className="btn btn-accent"
          >
            <span>🎮 このディビジョンの残り試合をシミュレート</span>
            <span>→</span>
          </a>
        </div>

        <div className="table-scroll">
          <table className="standings-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>チーム / ロスター</th>
                <th>獲得Pt (H / A)</th>
                <th>勝敗 (消化)</th>
                <th>得失バトル (H / A)</th>
                <th>得失ラウンド</th>
                <th>残り試合</th>
                <th>PO進出率 (3位内)</th>
                <th>2位内 (H権)</th>
                <th>1位突破率</th>
                <th>詳細シナリオ</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, idx) => {
                const sc = scenariosData.teams[team.key];
                const poProb = sc?.probabilities.playoffTop3 ?? 0;
                const top2Prob = sc?.probabilities.top2HomeAdvantage ?? 0;
                const firstProb = sc?.probabilities.firstPlace ?? 0;

                const seedTag =
                  team.rank === 1
                    ? { label: "FINAL直行圏", color: "#fbbf24", bg: "rgba(251,191,36,0.14)" }
                    : team.rank === 2
                      ? { label: "準決勝HOME圏", color: "#38bdf8", bg: "rgba(56,189,248,0.14)" }
                      : team.rank === 3
                        ? { label: "PO進出圏", color: "#34d399", bg: "rgba(16,185,129,0.14)" }
                        : null;

                return (
                  <React.Fragment key={team.key}>
                    <tr>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
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
                        </div>
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
                              width: "4px",
                              height: "32px",
                              borderRadius: "2px",
                              background: team.color,
                              boxShadow: `0 0 8px ${team.color}`,
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                              <span style={{ fontWeight: 900, fontSize: "0.96rem" }}>
                                {team.name}
                              </span>
                              {seedTag && (
                                <span
                                  className="badge"
                                  style={{
                                    background: seedTag.bg,
                                    color: seedTag.color,
                                    fontSize: "0.66rem",
                                    padding: "0.1rem 0.42rem",
                                  }}
                                >
                                  {seedTag.label}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {team.players
                                .map((p) => PLAYER_NAME_MAP[p] || p)
                                .slice(0, 4)
                                .join(" / ")}
                            </div>
                          </div>
                        </a>
                      </td>
                      <td>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "1.22rem",
                          }}
                        >
                          {team.point}{" "}
                          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>pt</span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          H:{team.pointHome} / A:{team.pointAway}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>
                          {team.victory}勝{team.entry - team.victory}敗
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {team.entry}試合消化
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 800,
                            color:
                              team.battleDiff > 0
                                ? "var(--accent-green-light)"
                                : team.battleDiff < 0
                                  ? "var(--accent-red)"
                                  : "var(--text-main)",
                          }}
                        >
                          {team.battleDiff > 0 ? `+${team.battleDiff}` : team.battleDiff}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          H:{team.battleDiffHome > 0 ? `+${team.battleDiffHome}` : team.battleDiffHome} / A:
                          {team.battleDiffAway > 0 ? `+${team.battleDiffAway}` : team.battleDiffAway}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              team.roundDiff > 0
                                ? "var(--accent-green-light)"
                                : team.roundDiff < 0
                                  ? "var(--accent-red)"
                                  : "var(--text-muted)",
                          }}
                        >
                          {team.roundDiff > 0 ? `+${team.roundDiff}` : team.roundDiff}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>残り{team.remainingMatches}戦</div>
                        <div style={{ display: "flex", gap: "0.25rem", marginTop: "3px" }}>
                          <span className="badge badge-home">H:{team.remainingHome}</span>
                          <span className="badge badge-away">A:{team.remainingAway}</span>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 900,
                            color: poProb >= 50 ? "var(--accent-green-light)" : "var(--text-main)",
                          }}
                        >
                          {poProb.toFixed(1)}%
                        </div>
                        <div className="prob-bar-wrap">
                          <div
                            className="prob-bar-fill"
                            style={{
                              width: `${Math.min(100, poProb)}%`,
                              background:
                                poProb >= 60
                                  ? "linear-gradient(90deg, #10b981, #34d399)"
                                  : poProb >= 30
                                    ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                                    : "linear-gradient(90deg, #e11d48, #f43f5e)",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ fontWeight: 800 }}>{top2Prob.toFixed(1)}%</td>
                      <td
                        style={{
                          fontWeight: 900,
                          color: firstProb >= 25 ? "var(--accent-gold)" : "var(--text-muted)",
                        }}
                      >
                        {firstProb.toFixed(1)}%
                      </td>
                      <td>
                        <a href={`/team/${team.key}`} className="btn">
                          <span>4大シナリオ解説</span>
                          <span>→</span>
                        </a>
                      </td>
                    </tr>
                    {idx === 2 && (
                      <tr className="borderline-row">
                        <td colSpan={11}>
                          ▲ プレイオフ進出ボーダーライン（上位3チームがプレイオフ進出：1位FINALシード / 2位準決勝HOME / 3位準決勝AWAY） ▲
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

      {/* Section Schedule & Match Results Browser */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <span>🗓️ Division {division.toUpperCase()} 節別スケジュール・対戦結果＆AI勝敗予測</span>
            </h2>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            <button
              type="button"
              onClick={() => setSelectedSection("next")}
              className="score-chip"
              style={
                selectedSection === "next"
                  ? {
                      background: "linear-gradient(135deg, #ff5e1a, #e11d48)",
                      color: "#fff",
                      borderColor: "#ff5e1a",
                    }
                  : {}
              }
            >
              ⚡ 次節 (第{nextUnplayedSec}節)
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
                        background: "var(--bg-elevated)",
                        color: "#fff",
                        borderColor: "#fff",
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
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "1.1rem",
          }}
        >
          {sectionMatches.map((m) => {
            const homeMeta = TEAM_META_MAP[m.home];
            const awayMeta = TEAM_META_MAP[m.away];
            const homePred = scenariosData.teams[m.home]?.nextMatchPrediction;
            const matchPred =
              !m.played && homePred?.matchId === m.id ? homePred : null;

            return (
              <div
                key={m.id}
                style={{
                  background: "rgba(9, 13, 23, 0.78)",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "14px",
                  padding: "1.15rem",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.65rem",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {m.sectionTitle} — Match {m.matchNumber} ({m.scheduledAt.slice(0, 10)})
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: m.played
                        ? "rgba(16,185,129,0.16)"
                        : "rgba(251,191,36,0.16)",
                      color: m.played ? "#34d399" : "#fbbf24",
                    }}
                  >
                    {m.played ? (m.isTiebreaker ? "完了 (延長決着)" : "完了") : "未消化"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.65rem 0",
                  }}
                >
                  <a
                    href={`/team/${m.away}`}
                    style={{ flex: 1, textAlign: "left" }}
                  >
                    <span className="badge badge-away">AWAY (先出し)</span>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: "1.08rem",
                        marginTop: "0.3rem",
                      }}
                    >
                      {awayMeta?.shortName ?? m.away}
                    </div>
                  </a>

                  <div style={{ textAlign: "center", minWidth: "110px" }}>
                    {m.played ? (
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "1.55rem",
                          fontWeight: 700,
                        }}
                      >
                        <span
                          style={{
                            color:
                              m.winner === "away"
                                ? "var(--accent-gold)"
                                : "var(--text-muted)",
                          }}
                        >
                          {m.awayPoint}
                        </span>
                        <span style={{ margin: "0 0.35rem", color: "var(--text-dim)" }}>
                          -
                        </span>
                        <span
                          style={{
                            color:
                              m.winner === "home"
                                ? "var(--accent-gold)"
                                : "var(--text-muted)",
                          }}
                        >
                          {m.homePoint}
                        </span>
                      </div>
                    ) : matchPred ? (
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          AI予想勝率
                        </div>
                        <div
                          style={{
                            fontSize: "0.92rem",
                            fontWeight: 900,
                            color: "var(--accent-gold)",
                          }}
                        >
                          A {(100 - matchPred.teamWinProbability).toFixed(1)}% :{" "}
                          {matchPred.teamWinProbability.toFixed(1)}% H
                        </div>
                        <div
                          style={{
                            height: "5px",
                            borderRadius: "999px",
                            overflow: "hidden",
                            display: "flex",
                            marginTop: "4px",
                            background: "rgba(255,255,255,0.1)",
                          }}
                        >
                          <div
                            style={{
                              width: `${100 - matchPred.teamWinProbability}%`,
                              background: "#3b82f6",
                            }}
                          />
                          <div
                            style={{
                              width: `${matchPred.teamWinProbability}%`,
                              background: "#10b981",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          color: "var(--text-dim)",
                        }}
                      >
                        VS
                      </div>
                    )}
                  </div>

                  <a
                    href={`/team/${m.home}`}
                    style={{ flex: 1, textAlign: "right" }}
                  >
                    <span className="badge badge-home">HOME (後出し)</span>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: "1.08rem",
                        marginTop: "0.3rem",
                      }}
                    >
                      {homeMeta?.shortName ?? m.home}
                    </div>
                  </a>
                </div>

                {m.bouts && m.bouts.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.65rem",
                      paddingTop: "0.65rem",
                      borderTop: "1px solid var(--border-subtle)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {m.bouts.map((b) => (
                      <div
                        key={b.status}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.22rem 0",
                          color: "var(--text-muted)",
                        }}
                      >
                        <span style={{ width: "38%", textAlign: "left" }}>
                          {PLAYER_NAME_MAP[b.awayPlayer] || b.awayPlayer}{" "}
                          <strong
                            style={{
                              color: b.awayPoint > 0 ? "#fff" : "var(--text-dim)",
                            }}
                          >
                            ({b.awayBattle})
                          </strong>
                        </span>
                        <span style={{ color: "var(--text-dim)", fontWeight: 800 }}>
                          {b.statusName}
                        </span>
                        <span style={{ width: "38%", textAlign: "right" }}>
                          <strong
                            style={{
                              color: b.homePoint > 0 ? "#fff" : "var(--text-dim)",
                            }}
                          >
                            ({b.homeBattle})
                          </strong>{" "}
                          {PLAYER_NAME_MAP[b.homePlayer] || b.homePlayer}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!m.played && matchPred && (
                  <div
                    style={{
                      marginTop: "0.65rem",
                      paddingTop: "0.65rem",
                      borderTop: "1px dashed var(--border-subtle)",
                      fontSize: "0.73rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#cbd5e1",
                        marginBottom: "0.3rem",
                      }}
                    >
                      🎯 HOME被せ最適オーダー予想（最頻スコア: {matchPred.mostLikelyScore}）
                    </div>
                    {matchPred.recommendedLineup.map((b) => (
                      <div
                        key={b.roleName}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.14rem 0",
                        }}
                      >
                        <span>
                          {b.playerBName}({b.charB})
                        </span>
                        <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>
                          {b.roleName} (H勝率 {b.expectedWinRateA}%)
                        </span>
                        <span>
                          {b.playerAName}({b.charA})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
