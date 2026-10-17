import React, { useEffect, useMemo, useState } from "react";
import type {
  DivisionId,
  MatchesData,
  ScenariosData,
  ScorePatternId,
  StandingsData,
} from "@/lib/types";
import {
  calculateStandings,
  SCORE_OUTCOME_MAP,
  TEAM_META_MAP,
} from "@/lib/simulator";

interface Props {
  matchesData: MatchesData;
  standingsData: StandingsData;
  scenariosData: ScenariosData;
}

const QUICK_SCORE_BUTTONS: Array<{
  id: ScorePatternId;
  shortLabel: string;
  side: "away" | "home";
}> = [
  { id: "AWAY_40_0", shortLabel: "A 40-0", side: "away" },
  { id: "AWAY_30_10", shortLabel: "A 30-10", side: "away" },
  { id: "AWAY_30_20", shortLabel: "A 30-20", side: "away" },
  { id: "HOME_30_20", shortLabel: "H 30-20", side: "home" },
  { id: "HOME_30_10", shortLabel: "H 30-10", side: "home" },
  { id: "HOME_40_0", shortLabel: "H 40-0", side: "home" },
];

function mapPlanToScorePattern(
  side: "home" | "away",
  teamGain: number,
  oppGain: number
): ScorePatternId {
  const homePt = side === "home" ? teamGain : oppGain;
  const awayPt = side === "home" ? oppGain : teamGain;
  if (homePt === 40 && awayPt === 0) return "HOME_40_0";
  if (homePt === 30 && awayPt === 10) return "HOME_30_10";
  if (homePt === 30 && awayPt === 20) return "HOME_30_20";
  if (homePt === 20 && awayPt === 30) return "AWAY_30_20";
  if (homePt === 10 && awayPt === 30) return "AWAY_30_10";
  return "AWAY_40_0";
}

export default function InteractiveSimulator({
  matchesData,
  standingsData,
  scenariosData,
}: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [customOutcomes, setCustomOutcomes] = useState<
    Record<string, ScorePatternId>
  >({});
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  const unplayedMatches = useMemo(
    () =>
      matchesData.matches
        .filter((m) => m.division === division && !m.played)
        .sort((a, b) =>
          a.sectionNumber !== b.sectionNumber
            ? a.sectionNumber - b.sectionNumber
            : a.matchNumber - b.matchNumber
        ),
    [matchesData.matches, division]
  );

  // URLクエリパラメータの安全な初期反映（ホワイトリスト＆プロトタイプ汚染対策済）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const qDiv = searchParams.get("div");
    const targetDiv: DivisionId = qDiv === "f" ? "f" : "s";
    setDivision(targetDiv);

    const qSim = searchParams.get("sim");
    const qTeam = searchParams.get("team");
    const qPreset = searchParams.get("preset") || "route1";

    const validMatchIds = new Set(
      matchesData.matches.filter((m) => !m.played).map((m) => m.id)
    );

    if (qSim && qSim.length <= 1500) {
      const nextMap: Record<string, ScorePatternId> = Object.create(null);
      for (const pair of qSim.split(",").slice(0, 60)) {
        const [mId, pat] = pair.split(":");
        if (
          mId &&
          pat &&
          validMatchIds.has(mId) &&
          Object.hasOwn(SCORE_OUTCOME_MAP, pat)
        ) {
          nextMap[mId] = pat as ScorePatternId;
        }
      }
      setCustomOutcomes({ ...nextMap });
    } else if (qTeam && Object.hasOwn(scenariosData.teams, qTeam)) {
      const tAnalysis = scenariosData.teams[qTeam];
      const routeObj =
        qPreset === "route2"
          ? tAnalysis.routes.route2Second
          : qPreset === "route3"
            ? tAnalysis.routes.route3Third
            : tAnalysis.routes.route1First;

      const nextMap: Record<string, ScorePatternId> = Object.create(null);
      for (const plan of routeObj.targetSchedule || []) {
        if (validMatchIds.has(plan.matchId)) {
          nextMap[plan.matchId] = mapPlanToScorePattern(
            plan.side,
            plan.teamPointGain,
            plan.opponentPointGain
          );
        }
      }
      setCustomOutcomes({ ...nextMap });
    }
  }, [matchesData.matches, scenariosData.teams]);

  const baseStandings = standingsData.divisions[division];
  const baseRankMap = useMemo(
    () => Object.fromEntries(baseStandings.map((t) => [t.key, t])),
    [baseStandings]
  );

  const simulatedStandings = useMemo(
    () => calculateStandings(division, matchesData.matches, customOutcomes),
    [division, matchesData.matches, customOutcomes]
  );

  const filledCount = unplayedMatches.filter(
    (m) => Boolean(customOutcomes[m.id])
  ).length;

  const handleSelectOutcome = (matchId: string, pattern: ScorePatternId) => {
    setCustomOutcomes((prev) => {
      if (prev[matchId] === pattern) {
        const copy = { ...prev };
        delete copy[matchId];
        return copy;
      }
      return { ...prev, [matchId]: pattern };
    });
  };

  const fillRandomRemaining = () => {
    const patterns: ScorePatternId[] = [
      "HOME_40_0",
      "HOME_30_10",
      "HOME_30_20",
      "AWAY_30_20",
      "AWAY_30_10",
      "AWAY_40_0",
    ];
    const nextMap: Record<string, ScorePatternId> = { ...customOutcomes };
    for (const m of unplayedMatches) {
      if (!nextMap[m.id]) {
        nextMap[m.id] = patterns[Math.floor(Math.random() * patterns.length)];
      }
    }
    setCustomOutcomes(nextMap);
  };

  const buildShareUrl = () => {
    const pairs = unplayedMatches
      .filter((m) => customOutcomes[m.id])
      .map((m) => `${m.id}:${customOutcomes[m.id]}`)
      .join(",");
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/simulator`
        : "/simulator";
    return pairs
      ? `${baseUrl}?div=${division}&sim=${pairs}`
      : `${baseUrl}?div=${division}`;
  };

  const handleCopyShareUrl = async () => {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedMessage("現在の予想URLをコピーしました！");
      setTimeout(() => setCopiedMessage(null), 3000);
    } catch {
      setCopiedMessage(url);
    }
  };

  // 節ごとにグルーピング
  const sectionsMap = useMemo(() => {
    const map = new Map<number, typeof unplayedMatches>();
    for (const m of unplayedMatches) {
      const list = map.get(m.sectionNumber) || [];
      list.push(m);
      map.set(m.sectionNumber, list);
    }
    return Array.from(map.entries());
  }, [unplayedMatches]);

  const firstTeam = simulatedStandings[0];
  const secondTeam = simulatedStandings[1];
  const thirdTeam = simulatedStandings[2];

  return (
    <div>
      {/* Division S / F 切り替えタブ */}
      <div className="div-tabs">
        <button
          type="button"
          onClick={() => {
            setDivision("s");
            setCustomOutcomes({});
          }}
          className={`div-tab ${division === "s" ? "active-s" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division S
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
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
            残り {matchesData.matches.filter((m) => m.division === "s" && !m.played).length} 試合
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDivision("f");
            setCustomOutcomes({});
          }}
          className={`div-tab ${division === "f" ? "active-f" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division F
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
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
            残り {matchesData.matches.filter((m) => m.division === "f" && !m.played).length} 試合
          </span>
        </button>
      </div>

      {/* 2カラム：左＝未消化カードのスコア選択 / 右＝追従するリアルタイム順位表 */}
      <div className="sim-layout">
        {/* 左カラム：残り試合スコア入力 */}
        <div>
          <div
            className="panel"
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
              入力済み: {filledCount} / {unplayedMatches.length} 試合
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={fillRandomRemaining}
                className="btn"
              >
                未入力の試合を自動埋め
              </button>
              <button
                type="button"
                onClick={() => setCustomOutcomes({})}
                className="btn"
              >
                すべてリセット
              </button>
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="btn btn-primary"
              >
                この予想URLをコピー
              </button>
            </div>
          </div>

          {copiedMessage && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.65rem 1rem",
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                borderRadius: "8px",
                fontSize: "0.85rem",
                color: "var(--success)",
                fontWeight: 700,
              }}
            >
              {copiedMessage}
            </div>
          )}

          {sectionsMap.map(([secNum, matches]) => (
            <div key={secNum} className="panel">
              <div className="panel-header" style={{ marginBottom: "0.85rem", paddingBottom: "0.6rem" }}>
                <h3 className="panel-title" style={{ fontSize: "1.02rem" }}>
                  第{secNum}節 （{matches[0]?.scheduledAt.slice(0, 10)}）
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {matches.map((m) => {
                  const homeMeta = TEAM_META_MAP[m.home];
                  const awayMeta = TEAM_META_MAP[m.away];
                  const selectedId = customOutcomes[m.id];
                  const selectedOut = selectedId
                    ? SCORE_OUTCOME_MAP[selectedId]
                    : null;

                  return (
                    <div
                      key={m.id}
                      style={{
                        background: selectedOut ? "#f8fafc" : "#ffffff",
                        border: selectedOut
                          ? "2px solid var(--primary)"
                          : "1px solid var(--border-color)",
                        borderRadius: "10px",
                        padding: "0.95rem 1rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.65rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span className="badge badge-away">AWAY</span>
                          <strong style={{ fontSize: "1rem" }}>
                            {awayMeta?.shortName ?? m.away}
                          </strong>
                        </div>

                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "1.1rem",
                            color: selectedOut ? "var(--primary)" : "var(--text-muted)",
                          }}
                        >
                          {selectedOut
                            ? `${selectedOut.awayPoint} - ${selectedOut.homePoint}`
                            : "VS"}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <strong style={{ fontSize: "1rem" }}>
                            {homeMeta?.shortName ?? m.home}
                          </strong>
                          <span className="badge badge-home">HOME</span>
                        </div>
                      </div>

                      <div className="score-btn-group">
                        {QUICK_SCORE_BUTTONS.map((btn) => {
                          const isSelected = selectedId === btn.id;
                          return (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => handleSelectOutcome(m.id, btn.id)}
                              className={`score-chip ${
                                isSelected
                                  ? btn.side === "home"
                                    ? "selected-home"
                                    : "selected-away"
                                  : ""
                              }`}
                            >
                              {btn.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 右カラム（スクロール追従）：リアルタイム予想順位表＆プレイオフ進出チーム */}
        <div className="sim-sidebar">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                シミュレート順位表（Division {division.toUpperCase()}）
              </h2>
            </div>

            <div className="table-scroll">
              <table className="standings-table" style={{ minWidth: "100%" }}>
                <thead>
                  <tr>
                    <th>順位</th>
                    <th>チーム</th>
                    <th>ポイント</th>
                    <th>勝敗</th>
                    <th>バトル差</th>
                  </tr>
                </thead>
                <tbody>
                  {simulatedStandings.map((team, idx) => {
                    const base = baseRankMap[team.key];
                    const rankDelta = (base?.rank ?? team.rank) - team.rank;
                    const ptDelta = team.point - (base?.point ?? 0);

                    return (
                      <React.Fragment key={team.key}>
                        <tr>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
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
                              {rankDelta > 0 && (
                                <span style={{ color: "var(--success)", fontSize: "0.78rem", fontWeight: 800 }}>
                                  ↑{rankDelta}
                                </span>
                              )}
                              {rankDelta < 0 && (
                                <span style={{ color: "var(--danger)", fontSize: "0.78rem", fontWeight: 800 }}>
                                  ↓{Math.abs(rankDelta)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 800 }}>
                              <span
                                style={{
                                  width: "4px",
                                  height: "20px",
                                  background: team.color,
                                  display: "inline-block",
                                  borderRadius: "2px",
                                }}
                              />
                              <span>{team.shortName}</span>
                            </div>
                          </td>
                          <td>
                            <strong style={{ fontSize: "1.05rem" }}>{team.point}pt</strong>{" "}
                            {ptDelta > 0 && (
                              <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700 }}>
                                (+{ptDelta})
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.84rem", fontWeight: 700 }}>
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
                        </tr>
                        {idx === 2 && (
                          <tr className="borderline-row">
                            <td colSpan={5}>
                              ▲ 上位3チームがプレイオフ進出 ▲
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* プレイオフ組み合わせ */}
            <div
              style={{
                marginTop: "1.15rem",
                padding: "1rem",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                fontSize: "0.86rem",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: "0.5rem", color: "var(--text-main)" }}>
                プレイオフ組み合わせ予想
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border-color)" }}>
                <span style={{ color: "var(--text-muted)" }}>準決勝:</span>
                <strong>
                  3位 {thirdTeam?.shortName} vs 2位 {secondTeam?.shortName} (HOME)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.4rem" }}>
                <span style={{ color: "var(--text-muted)" }}>決勝シード:</span>
                <strong style={{ color: "var(--warning)" }}>
                  1位 {firstTeam?.shortName} (HOME)
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
