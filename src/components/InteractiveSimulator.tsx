import React, { useEffect, useMemo, useState } from "react";
import type {
  CptMatchupsTop96Data,
  DivisionId,
  MasterPlayersData,
  MatchesData,
  PlayerStatsData,
  ScenariosData,
  ScorePatternId,
  StandingsData,
} from "@/lib/types";
import {
  calculateStandings,
  SCORE_OUTCOME_MAP,
  TEAM_META_MAP,
} from "@/lib/simulator";
import {
  PREDICTOR_WEIGHTS,
  predictBoutWinRate,
  predictTeamMatchOutcomeDistribution,
} from "@/lib/predictor";

interface Props {
  matchesData: MatchesData;
  standingsData: StandingsData;
  scenariosData: ScenariosData;
  masterPlayersData: MasterPlayersData;
  cptMatchupsData: CptMatchupsTop96Data;
  playerStatsData: PlayerStatsData;
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
  masterPlayersData,
  cptMatchupsData,
  playerStatsData,
}: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [customOutcomes, setCustomOutcomes] = useState<
    Record<string, ScorePatternId>
  >({});
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  // CPT 1on1 マッチアップ検証ツール用ステート
  const [playerAKey, setPlayerAKey] = useState<string>("umehara");
  const [charAKey, setCharAKey] = useState<string>("gouki");
  const [playerBKey, setPlayerBKey] = useState<string>("tokido");
  const [charBKey, setCharBKey] = useState<string>("jp");

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

  // URLクエリパラメータ (?div=s&team=fav&preset=route1 または ?div=s&sim=...) の安全な初期反映（ホワイトリスト＆プロトタイプ汚染対策済）
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
    } else if (
      qTeam &&
      Object.hasOwn(scenariosData.teams, qTeam)
    ) {
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

  // 各未消化試合のCPTキャラ相性＆戦績予測キャッシュ
  const matchPredictionsMap = useMemo(() => {
    const map: Record<
      string,
      ReturnType<typeof predictTeamMatchOutcomeDistribution>
    > = {};
    for (const m of unplayedMatches) {
      map[m.id] = predictTeamMatchOutcomeDistribution(
        m,
        cptMatchupsData,
        playerStatsData
      );
    }
    return map;
  }, [unplayedMatches, cptMatchupsData, playerStatsData]);

  // 1on1 マッチアップ計算結果 (選手A=HOME被せ想定 vs 選手B=AWAY先出し想定)
  const boutPrediction = useMemo(
    () =>
      predictBoutWinRate(
        playerAKey,
        playerBKey,
        true,
        cptMatchupsData,
        playerStatsData,
        charAKey,
        charBKey
      ),
    [
      playerAKey,
      charAKey,
      playerBKey,
      charBKey,
      cptMatchupsData,
      playerStatsData,
    ]
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

  const applyTeamPreset = (teamKey: string, routeKey: "route1" | "route2") => {
    const tAnalysis = scenariosData.teams[teamKey];
    if (!tAnalysis) return;
    const routeObj =
      routeKey === "route2"
        ? tAnalysis.routes.route2Second
        : tAnalysis.routes.route1First;
    const nextMap: Record<string, ScorePatternId> = { ...customOutcomes };
    for (const plan of routeObj.targetSchedule || []) {
      nextMap[plan.matchId] = mapPlanToScorePattern(
        plan.side,
        plan.teamPointGain,
        plan.opponentPointGain
      );
    }
    setCustomOutcomes(nextMap);
  };

  const fillAiPredictedRemaining = () => {
    const nextMap: Record<string, ScorePatternId> = { ...customOutcomes };
    for (const m of unplayedMatches) {
      if (!nextMap[m.id]) {
        const pred = matchPredictionsMap[m.id];
        if (pred) {
          const entries = Object.entries(pred.outcomeWeights) as Array<
            [ScorePatternId, number]
          >;
          entries.sort((a, b) => b[1] - a[1]);
          nextMap[m.id] = entries[0][0];
        }
      }
    }
    setCustomOutcomes(nextMap);
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
      setCopiedMessage("シミュレーションURLをクリップボードにコピーしました！");
      setTimeout(() => setCopiedMessage(null), 3500);
    } catch {
      setCopiedMessage(url);
    }
  };

  const handleShareTwitter = () => {
    const url = buildShareUrl();
    const top3 = simulatedStandings
      .slice(0, 3)
      .map((t, i) => `${i + 1}位:${t.shortName}(${t.point}pt)`)
      .join(" / ");
    const text = `【SFL 2026 Division ${division.toUpperCase()} 順位シミュレーション予想】\nプレイオフ進出予想: ${top3}\n#SFL2026 #スト6`;
    const shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text
    )}&url=${encodeURIComponent(url)}`;
    window.open(shareLink, "_blank", "noopener,noreferrer");
  };

  const divTeams = Object.values(TEAM_META_MAP).filter(
    (t) => t.division === division
  );

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

  const allPlayersList = useMemo(
    () => Object.values(masterPlayersData.players),
    [masterPlayersData.players]
  );

  return (
    <div>
      {/* Division Switcher */}
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
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 700 }}>
              DIVISION S シミュレーター
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
              FAV / CR / SOL / ZETA / iXA / IBSG
            </div>
          </div>
          <span
            className="badge"
            style={{ background: "rgba(249,115,22,0.2)", color: "#fb923c" }}
          >
            未消化{" "}
            {
              matchesData.matches.filter((m) => m.division === "s" && !m.played)
                .length
            }{" "}
            試合
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
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 700 }}>
              DIVISION F シミュレーター
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
              VARREL / G8S / DFM / OJA / RC / RID
            </div>
          </div>
          <span
            className="badge"
            style={{ background: "rgba(6,182,212,0.2)", color: "#22d3ee" }}
          >
            未消化{" "}
            {
              matchesData.matches.filter((m) => m.division === "f" && !m.played)
                .length
            }{" "}
            試合
          </span>
        </button>
      </div>

      {/* Preset & Control Bar */}
      <div className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.85rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 800,
                color: "var(--text-muted)",
              }}
            >
              🎯 推しチーム1位突破プリセット:
            </span>
            {divTeams.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTeamPreset(t.key, "route1")}
                className="score-chip"
                style={{ borderLeft: `3px solid ${t.color}` }}
              >
                {t.shortName} 1位ルートを反映
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={fillAiPredictedRemaining}
              className="btn"
              style={{
                borderColor: "var(--accent-gold)",
                color: "var(--accent-gold)",
              }}
            >
              🤖 CPTキャラ相性AI予測で未入力を埋める
            </button>
            <button
              type="button"
              onClick={fillRandomRemaining}
              className="btn"
            >
              🎲 ランダム埋め
            </button>
            <button
              type="button"
              onClick={() => setCustomOutcomes({})}
              className="btn"
            >
              ↺ リセット ({filledCount}/{unplayedMatches.length})
            </button>
            <button
              type="button"
              onClick={handleCopyShareUrl}
              className="btn btn-accent"
            >
              🔗 予想URLをコピー
            </button>
            <button
              type="button"
              onClick={handleShareTwitter}
              className="btn"
              style={{ borderColor: "#38bdf8", color: "#38bdf8" }}
            >
              𝕏 でシェア
            </button>
          </div>
        </div>
        {copiedMessage && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.55rem 0.9rem",
              background: "rgba(16,185,129,0.18)",
              border: "1px solid #10b981",
              borderRadius: "8px",
              fontSize: "0.82rem",
              color: "#34d399",
              fontWeight: 700,
            }}
          >
            {copiedMessage}
          </div>
        )}
      </div>

      {/* Live Simulated Standings & Playoff Stepladder Bracket */}
      <div className="scenario-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <h2 className="panel-title">
              📊 シミュレート後の順位表（入力済み: {filledCount}/
              {unplayedMatches.length}試合）
            </h2>
          </div>

          <div className="table-scroll">
            <table className="standings-table" style={{ minWidth: "520px" }}>
              <thead>
                <tr>
                  <th>順位 (変動)</th>
                  <th>チーム</th>
                  <th>予想Pt (加算)</th>
                  <th>勝敗</th>
                  <th>バトル差</th>
                  <th>ラウンド差</th>
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
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.45rem",
                            }}
                          >
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
                              <span
                                style={{
                                  color: "var(--accent-green-light)",
                                  fontSize: "0.78rem",
                                  fontWeight: 800,
                                }}
                              >
                                ↑{rankDelta}
                              </span>
                            )}
                            {rankDelta < 0 && (
                              <span
                                style={{
                                  color: "var(--accent-red)",
                                  fontSize: "0.78rem",
                                  fontWeight: 800,
                                }}
                              >
                                ↓{Math.abs(rankDelta)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <a
                            href={`/team/${team.key}`}
                            style={{
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              gap: "0.45rem",
                            }}
                          >
                            <span
                              style={{
                                width: "4px",
                                height: "20px",
                                background: team.color,
                                display: "inline-block",
                                borderRadius: "2px",
                              }}
                            />
                            {team.shortName}
                          </a>
                        </td>
                        <td>
                          <strong
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: "1.12rem",
                            }}
                          >
                            {team.point}pt
                          </strong>{" "}
                          {ptDelta > 0 && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--accent-gold)",
                                fontWeight: 700,
                              }}
                            >
                              (+{ptDelta})
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.84rem", fontWeight: 700 }}>
                          {team.victory}勝{team.entry - team.victory}敗
                        </td>
                        <td
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
                          {team.battleDiff > 0
                            ? `+${team.battleDiff}`
                            : team.battleDiff}
                        </td>
                        <td
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                          }}
                        >
                          {team.roundDiff > 0
                            ? `+${team.roundDiff}`
                            : team.roundDiff}
                        </td>
                      </tr>
                      {idx === 2 && (
                        <tr className="borderline-row">
                          <td colSpan={6}>
                            ▲ プレイオフ進出ボーダー（上位3チーム） ▲
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

        {/* Playoff Stepladder Preview */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <h2 className="panel-title">
              🏆 Division {division.toUpperCase()} プレイオフ・ステップラダー予想
            </h2>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div
              style={{
                background: "rgba(9, 13, 23, 0.78)",
                border: "1px solid var(--border-glass)",
                borderRadius: "12px",
                padding: "1.1rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  fontWeight: 800,
                }}
              >
                STEP 1: プレイオフ準決勝 (SEMIFINAL - 70pt先取)
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "0.65rem",
                }}
              >
                <div>
                  <span className="badge badge-away">3位通過 (AWAY)</span>
                  <div
                    style={{
                      fontSize: "1.15rem",
                      fontWeight: 900,
                      marginTop: "0.25rem",
                    }}
                  >
                    {thirdTeam?.name} ({thirdTeam?.point}pt)
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-dim)",
                  }}
                >
                  VS
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="badge badge-home">
                    2位通過 (奇数巡HOME権)
                  </span>
                  <div
                    style={{
                      fontSize: "1.15rem",
                      fontWeight: 900,
                      marginTop: "0.25rem",
                    }}
                  >
                    {secondTeam?.name} ({secondTeam?.point}pt)
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                textAlign: "center",
                color: "var(--accent-gold)",
                fontWeight: 900,
                fontSize: "0.85rem",
              }}
            >
              ▼ 準決勝の勝者が DIVISION FINAL へ進出 ▼
            </div>

            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(16, 22, 36, 0.95))",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                borderRadius: "12px",
                padding: "1.15rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--accent-gold)",
                  fontWeight: 800,
                }}
              >
                STEP 2: ディビジョン決勝 (グランドファイナル進出決定戦)
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "0.65rem",
                }}
              >
                <div>
                  <span className="badge badge-away">準決勝勝者 (AWAY)</span>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      marginTop: "0.25rem",
                    }}
                  >
                    {secondTeam?.shortName} or {thirdTeam?.shortName}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--accent-gold)",
                  }}
                >
                  VS
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="badge badge-home">
                    1位シード直行 (HOME権確定)
                  </span>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 900,
                      color: "#fff",
                      marginTop: "0.25rem",
                    }}
                  >
                    👑 {firstTeam?.name} ({firstTeam?.point}pt)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CPT Top 96 選手×キャラ相性 1on1 勝敗予測カルキュレーター */}
      <div className="panel" style={{ marginTop: "1.65rem" }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              🔬 CPT Top 96 キャラ相性 × 選手対キャラ戦績 × H2H 1on1勝敗予測カルキュレーター
            </h2>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                marginTop: "0.2rem",
              }}
            >
              予測式: P(A) = w1({PREDICTOR_WEIGHTS.w1MacroTop96 * 100}%) × Matchup(X,Y)_Top96 (ベイズ平滑化 α={cptMatchupsData.bayesianPriorAlpha}) + w2({PREDICTOR_WEIGHTS.w2PlayerVsChar * 100}%) × PlayerVsChar(A,Y)_All + w3({PREDICTOR_WEIGHTS.w3H2hAndHome * 100}%) × H2H(A,B)
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.1rem",
            alignItems: "center",
          }}
        >
          {/* Player A Selector */}
          <div
            style={{
              background: "rgba(9, 13, 23, 0.78)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              borderRadius: "12px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "#34d399",
                marginBottom: "0.45rem",
              }}
            >
              PLAYER A (HOME被せ側 / 選手A)
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
            >
              <select
                value={playerAKey}
                onChange={(e) => {
                  const newKey = e.target.value;
                  setPlayerAKey(newKey);
                  const p = masterPlayersData.players[newKey];
                  if (p) setCharAKey(p.mainChar);
                }}
                style={{
                  background: "var(--bg-elevated)",
                  color: "#fff",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  fontWeight: 700,
                }}
              >
                {allPlayersList.map((p) => (
                  <option key={p.key} value={p.key}>
                    [{p.division.toUpperCase()} /{" "}
                    {TEAM_META_MAP[p.teamKey]?.shortName}] {p.name}
                  </option>
                ))}
              </select>

              <select
                value={charAKey}
                onChange={(e) => setCharAKey(e.target.value)}
                style={{
                  background: "var(--bg-elevated)",
                  color: "#fbbf24",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  fontWeight: 700,
                }}
              >
                {cptMatchupsData.characters.map((c) => (
                  <option key={c.key} value={c.key}>
                    使用キャラ: {c.name} ({c.key.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prediction Result Center with Visual Tug-of-War Bar */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.12))",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px",
              padding: "1.1rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                fontWeight: 800,
              }}
            >
              統合予測勝率 (A vs B)
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.8rem",
                fontWeight: 700,
                margin: "0.25rem 0",
              }}
            >
              <span
                style={{
                  color:
                    boutPrediction.expectedWinRateA >= 50
                      ? "var(--accent-green-light)"
                      : "var(--text-muted)",
                }}
              >
                {boutPrediction.expectedWinRateA.toFixed(1)}%
              </span>
              <span
                style={{
                  margin: "0 0.5rem",
                  fontSize: "1rem",
                  color: "var(--text-dim)",
                }}
              >
                vs
              </span>
              <span
                style={{
                  color:
                    100 - boutPrediction.expectedWinRateA > 50
                      ? "#60a5fa"
                      : "var(--text-muted)",
                }}
              >
                {(100 - boutPrediction.expectedWinRateA).toFixed(1)}%
              </span>
            </div>

            {/* Tug of War Bar */}
            <div
              style={{
                height: "8px",
                borderRadius: "999px",
                overflow: "hidden",
                display: "flex",
                margin: "0.45rem 0 0.65rem",
                background: "rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  width: `${boutPrediction.expectedWinRateA}%`,
                  background: "linear-gradient(90deg, #10b981, #34d399)",
                  transition: "width 0.25s ease",
                }}
              />
              <div
                style={{
                  width: `${100 - boutPrediction.expectedWinRateA}%`,
                  background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                  transition: "width 0.25s ease",
                }}
              />
            </div>

            <div
              style={{
                fontSize: "0.74rem",
                color: "var(--text-secondary)",
                lineHeight: 1.55,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>① CPT Top96 キャラ相性 (重み40%):</span>
                <strong>{boutPrediction.macroMatchupTop96.toFixed(1)}%</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>② 対キャラ固有戦績補正 (重み35%):</span>
                <strong>{boutPrediction.playerVsCharRate.toFixed(1)}%</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>③ H2H + Elo + HOME被せ (重み25%):</span>
                <strong>{boutPrediction.h2hAndHomeRate.toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          {/* Player B Selector */}
          <div
            style={{
              background: "rgba(9, 13, 23, 0.78)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              borderRadius: "12px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "#60a5fa",
                marginBottom: "0.45rem",
              }}
            >
              PLAYER B (AWAY先出し側 / 選手B)
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
            >
              <select
                value={playerBKey}
                onChange={(e) => {
                  const newKey = e.target.value;
                  setPlayerBKey(newKey);
                  const p = masterPlayersData.players[newKey];
                  if (p) setCharBKey(p.mainChar);
                }}
                style={{
                  background: "var(--bg-elevated)",
                  color: "#fff",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  fontWeight: 700,
                }}
              >
                {allPlayersList.map((p) => (
                  <option key={p.key} value={p.key}>
                    [{p.division.toUpperCase()} /{" "}
                    {TEAM_META_MAP[p.teamKey]?.shortName}] {p.name}
                  </option>
                ))}
              </select>

              <select
                value={charBKey}
                onChange={(e) => setCharBKey(e.target.value)}
                style={{
                  background: "var(--bg-elevated)",
                  color: "#fbbf24",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  fontWeight: 700,
                }}
              >
                {cptMatchupsData.characters.map((c) => (
                  <option key={c.key} value={c.key}>
                    使用キャラ: {c.name} ({c.key.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Remaining Matches Score Selector */}
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 900,
          margin: "1.65rem 0 1rem",
        }}
      >
        🎮 残り未消化カードのスコアを手動入力（クリックで即座に順位へ反映）
      </h2>

      {sectionsMap.map(([secNum, matches]) => (
        <div key={secNum} className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              第{secNum}節 （{matches[0]?.scheduledAt.slice(0, 10)}）
            </h3>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "1.1rem",
            }}
          >
            {matches.map((m) => {
              const homeMeta = TEAM_META_MAP[m.home];
              const awayMeta = TEAM_META_MAP[m.away];
              const selectedId = customOutcomes[m.id];
              const selectedOut = selectedId
                ? SCORE_OUTCOME_MAP[selectedId]
                : null;
              const aiPred = matchPredictionsMap[m.id];

              return (
                <div
                  key={m.id}
                  style={{
                    background: "rgba(9, 13, 23, 0.78)",
                    border: selectedOut
                      ? "1px solid var(--accent-gold)"
                      : "1px solid var(--border-glass)",
                    borderRadius: "12px",
                    padding: "1.1rem",
                    boxShadow: selectedOut
                      ? "0 0 18px rgba(251, 191, 36, 0.18)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.55rem",
                    }}
                  >
                    <div>
                      <span className="badge badge-away">AWAY</span>{" "}
                      <strong style={{ fontSize: "1.02rem" }}>
                        {awayMeta?.shortName ?? m.away}
                      </strong>
                    </div>

                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "1.2rem",
                        color: "var(--accent-gold)",
                      }}
                    >
                      {selectedOut
                        ? `${selectedOut.awayPoint} - ${selectedOut.homePoint}`
                        : "VS"}
                    </div>

                    <div>
                      <strong style={{ fontSize: "1.02rem" }}>
                        {homeMeta?.shortName ?? m.home}
                      </strong>{" "}
                      <span className="badge badge-home">HOME</span>
                    </div>
                  </div>

                  {aiPred && (
                    <div
                      style={{
                        fontSize: "0.73rem",
                        color: "var(--text-muted)",
                        marginBottom: "0.65rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        AI勝率: A {aiPred.awayWinProbability}% / H{" "}
                        {aiPred.homeWinProbability}%
                      </span>
                      <span>
                        最頻:{" "}
                        <strong style={{ color: "var(--text-secondary)" }}>
                          {aiPred.homeOrderRecommendation.mostLikelyScore}
                        </strong>
                      </span>
                    </div>
                  )}

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

      {/* Sticky Live Standings Dock (Usability boost while scrolling down match cards) */}
      <div className="sticky-sim-dock">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            className="badge"
            style={{
              background: "rgba(251,191,36,0.2)",
              color: "var(--accent-gold)",
            }}
          >
            LIVE 順位プレビュー ({filledCount}/{unplayedMatches.length}入力)
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          {simulatedStandings.map((t, i) => {
            const base = baseRankMap[t.key];
            const delta = (base?.rank ?? t.rank) - t.rank;
            return (
              <div
                key={t.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "8px",
                  background:
                    i < 3
                      ? "rgba(16, 185, 129, 0.14)"
                      : "rgba(255, 255, 255, 0.05)",
                  border:
                    i < 3
                      ? "1px solid rgba(16, 185, 129, 0.4)"
                      : "1px solid var(--border-subtle)",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                }}
              >
                <span style={{ color: i === 0 ? "var(--accent-gold)" : "#fff" }}>
                  {t.rank}位
                </span>
                <span>{t.shortName}</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {t.point}pt
                </span>
                {delta > 0 && (
                  <span style={{ color: "#34d399", fontSize: "0.72rem" }}>
                    ↑{delta}
                  </span>
                )}
                {delta < 0 && (
                  <span style={{ color: "#f43f5e", fontSize: "0.72rem" }}>
                    ↓{Math.abs(delta)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
