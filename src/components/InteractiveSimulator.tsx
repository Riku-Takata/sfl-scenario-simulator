import React, { useEffect, useMemo, useState } from "react";
import type {
  DivisionId,
  MatchRecord,
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

const HOME_WIN_PATTERNS: ScorePatternId[] = [
  "HOME_30_10",
  "HOME_30_20",
  "HOME_40_0",
];
const AWAY_WIN_PATTERNS: ScorePatternId[] = [
  "AWAY_30_10",
  "AWAY_30_20",
  "AWAY_40_0",
];
const ALL_PATTERNS: ScorePatternId[] = [
  ...HOME_WIN_PATTERNS,
  ...AWAY_WIN_PATTERNS,
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 指定した推しチーム (targetTeamKey) が指定順位 (targetRank: 1 | 2 | 3) になるような
 * 未消化全試合のスコアパターン組み合わせを探索して返す
 */
export function generateOutcomesForTargetRank(
  division: DivisionId,
  allMatches: MatchRecord[],
  targetTeamKey: string,
  targetRank: 1 | 2 | 3
): Record<string, ScorePatternId> {
  const unplayed = allMatches.filter(
    (m) => m.division === division && !m.played
  );
  const currentStandings = calculateStandings(division, allMatches);
  const otherTeams = currentStandings
    .filter((t) => t.key !== targetTeamKey)
    .map((t) => t.key);

  const winForSide = (side: "home" | "away", dominant = false): ScorePatternId => {
    if (dominant) {
      return side === "home"
        ? Math.random() < 0.6
          ? "HOME_40_0"
          : "HOME_30_10"
        : Math.random() < 0.6
          ? "AWAY_40_0"
          : "AWAY_30_10";
    }
    return side === "home"
      ? pickRandom(HOME_WIN_PATTERNS)
      : pickRandom(AWAY_WIN_PATTERNS);
  };

  // 最大800回試行し、targetTeamKey がちょうど targetRank 位になる自然なスコア分布を探す
  for (let attempt = 0; attempt < 800; attempt++) {
    const candidate: Record<string, ScorePatternId> = {};

    // targetRank === 1 なら上位チーム0、targetRank === 2 なら1チーム、targetRank === 3 なら2チームを上位候補に設定
    const shuffledOthers = [...otherTeams].sort(
      () => Math.random() - 0.5
    );
    // 前半の試行では現在順位が高いチームを上位候補にし、後半はランダムに広げる
    const higherCount = targetRank - 1;
    const higherSet = new Set(
      (attempt < 400 ? otherTeams : shuffledOthers).slice(0, higherCount)
    );

    // 試行ごとに targetTeam の勝率バイアスを少しずつ変化させ、ちょうど2位や3位に収まるスイートスポットを通過させる
    const targetWinRateVsLower =
      targetRank === 1
        ? 0.95
        : targetRank === 2
          ? 0.35 + (attempt % 10) * 0.06
          : 0.2 + (attempt % 10) * 0.06;

    for (const m of unplayed) {
      if (m.home === targetTeamKey || m.away === targetTeamKey) {
        const targetSide: "home" | "away" =
          m.home === targetTeamKey ? "home" : "away";
        const oppSide: "home" | "away" =
          targetSide === "home" ? "away" : "home";
        const oppKey = targetSide === "home" ? m.away : m.home;

        if (targetRank === 1) {
          // 1位狙い：推しチームが高確率で勝利
          candidate[m.id] =
            Math.random() < 0.92
              ? winForSide(targetSide, attempt > 200)
              : winForSide(oppSide);
        } else if (higherSet.has(oppKey)) {
          // 自分より上の順位にしたい相手には負ける確率を高める
          candidate[m.id] =
            Math.random() < 0.85
              ? winForSide(oppSide, true)
              : winForSide(targetSide);
        } else {
          // 自分より下の順位にしたい相手には適度に勝つ
          candidate[m.id] =
            Math.random() < targetWinRateVsLower
              ? winForSide(targetSide)
              : winForSide(oppSide);
        }
      } else {
        // 他チーム同士の対戦
        const homeIsHigher = higherSet.has(m.home);
        const awayIsHigher = higherSet.has(m.away);

        if (homeIsHigher && !awayIsHigher) {
          candidate[m.id] =
            Math.random() < 0.88
              ? winForSide("home", true)
              : winForSide("away");
        } else if (awayIsHigher && !homeIsHigher) {
          candidate[m.id] =
            Math.random() < 0.88
              ? winForSide("away", true)
              : winForSide("home");
        } else if (!homeIsHigher && !awayIsHigher && targetRank < 3) {
          // 下位候補同士はポイントを分け合って突出しないようにする
          candidate[m.id] = pickRandom([
            "HOME_30_20",
            "AWAY_30_20",
            "HOME_30_10",
            "AWAY_30_10",
          ]);
        } else {
          candidate[m.id] = pickRandom(ALL_PATTERNS);
        }
      }
    }

    const simResult = calculateStandings(division, allMatches, candidate);
    const achievedRank = simResult.find((t) => t.key === targetTeamKey)?.rank;
    if (achievedRank === targetRank) {
      return candidate;
    }
  }

  // 万一800回で見つからなかった場合のフォールバック
  const fallback: Record<string, ScorePatternId> = {};
  for (const m of unplayed) {
    fallback[m.id] = pickRandom(ALL_PATTERNS);
  }
  return fallback;
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const CODE_TO_PATTERN: Array<ScorePatternId | null> = [
  null,
  "AWAY_40_0",
  "AWAY_30_10",
  "AWAY_30_20",
  "HOME_30_20",
  "HOME_30_10",
  "HOME_40_0",
];

const PATTERN_TO_CODE: Record<ScorePatternId, number> = {
  AWAY_40_0: 1,
  AWAY_30_10: 2,
  AWAY_30_20: 3,
  HOME_30_20: 4,
  HOME_30_10: 5,
  HOME_40_0: 6,
};

/**
 * 未消化試合の選択状態を 1文字あたり2試合（3bit × 2 = 6bit Base64url）に圧縮エンコードする
 * 例: 18試合すべて埋めてもわずか9文字 (?s=q7N1xK9mP)
 */
export function encodeSimulationCode(
  unplayedMatches: MatchRecord[],
  outcomes: Record<string, ScorePatternId>
): string {
  let result = "";
  for (let i = 0; i < unplayedMatches.length; i += 2) {
    const m1 = unplayedMatches[i];
    const m2 = unplayedMatches[i + 1];
    const c1 = (m1 && outcomes[m1.id] ? PATTERN_TO_CODE[outcomes[m1.id]] : 0) || 0;
    const c2 = (m2 && outcomes[m2.id] ? PATTERN_TO_CODE[outcomes[m2.id]] : 0) || 0;
    const val = (c1 << 3) | c2;
    result += B64_CHARS[val];
  }
  // 末尾の未入力連続 ('A' = 0) を除去してさらに短縮
  return result.replace(/A+$/, "");
}

/**
 * 短縮Base64urlコードから試合結果マップへ安全にデコードする
 */
export function decodeSimulationCode(
  unplayedMatches: MatchRecord[],
  code: string
): Record<string, ScorePatternId> {
  const nextMap: Record<string, ScorePatternId> = Object.create(null);
  const maxChars = Math.ceil(unplayedMatches.length / 2);
  const cleanCode = code.slice(0, maxChars);

  for (let i = 0; i < cleanCode.length; i++) {
    const val = B64_CHARS.indexOf(cleanCode[i]);
    if (val < 0) continue;
    const c1 = (val >> 3) & 0b111;
    const c2 = val & 0b111;
    const m1 = unplayedMatches[i * 2];
    const m2 = unplayedMatches[i * 2 + 1];
    const pat1 = CODE_TO_PATTERN[c1];
    const pat2 = CODE_TO_PATTERN[c2];
    if (m1 && pat1) nextMap[m1.id] = pat1;
    if (m2 && pat2) nextMap[m2.id] = pat2;
  }
  return { ...nextMap };
}

export default function InteractiveSimulator({
  matchesData,
  standingsData,
  scenariosData,
}: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [targetTeam, setTargetTeam] = useState<string>("fav");
  const [targetRank, setTargetRank] = useState<1 | 2 | 3>(1);
  const [customOutcomes, setCustomOutcomes] = useState<
    Record<string, ScorePatternId>
  >({});
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  const divTeams = useMemo(
    () =>
      Object.values(TEAM_META_MAP).filter((t) => t.division === division),
    [division]
  );

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

  // URLクエリパラメータ (?s=短縮コード または ?f=短縮コード) の安全な初期反映
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);

    const shortS = searchParams.get("s");
    const shortF = searchParams.get("f");
    const qDiv = searchParams.get("div");

    const targetDiv: DivisionId =
      shortF !== null ? "f" : shortS !== null ? "s" : qDiv === "f" ? "f" : "s";
    setDivision(targetDiv);
    setTargetTeam(targetDiv === "f" ? "varrel" : "fav");

    const divUnplayed = matchesData.matches
      .filter((m) => m.division === targetDiv && !m.played)
      .sort((a, b) =>
        a.sectionNumber !== b.sectionNumber
          ? a.sectionNumber - b.sectionNumber
          : a.matchNumber - b.matchNumber
      );

    const shortCode = targetDiv === "f" ? shortF : shortS;
    if (shortCode && shortCode.length <= 40) {
      setCustomOutcomes(decodeSimulationCode(divUnplayed, shortCode));
      return;
    }

    const qSim = searchParams.get("sim");
    const qTeam = searchParams.get("team");
    const qPreset = searchParams.get("preset") || "route1";

    const validMatchIds = new Set(divUnplayed.map((m) => m.id));

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
      setTargetTeam(qTeam);
      const rankNum: 1 | 2 | 3 =
        qPreset === "route2" ? 2 : qPreset === "route3" ? 3 : 1;
      setTargetRank(rankNum);
      const generated = generateOutcomesForTargetRank(
        targetDiv,
        matchesData.matches,
        qTeam,
        rankNum
      );
      setCustomOutcomes(generated);
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

  const handleAutoFillForTargetRank = () => {
    const generated = generateOutcomesForTargetRank(
      division,
      matchesData.matches,
      targetTeam,
      targetRank
    );
    setCustomOutcomes(generated);
    const teamShort = TEAM_META_MAP[targetTeam]?.shortName ?? targetTeam;
    setCopiedMessage(
      `${teamShort} が ${targetRank}位 になる試合結果パターンを自動入力しました！（もう一度押すと別パターンを生成します）`
    );
    setTimeout(() => setCopiedMessage(null), 4000);
  };

  const buildShareUrl = () => {
    const code = encodeSimulationCode(unplayedMatches, customOutcomes);
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/simulator`
        : "/simulator";
    return code
      ? `${baseUrl}?${division}=${code}`
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
            setTargetTeam("fav");
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
            setTargetTeam("varrel");
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
        {/* 左カラム：自動入力バー ＆ 残り試合スコア入力 */}
        <div>
          <div
            className="panel"
            style={{
              padding: "1.15rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            {/* 推しチーム × 目標順位（1位/2位/3位）自動生成バー */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-main)" }}>
                  推しチーム条件で自動入力:
                </span>

                <select
                  aria-label="推しチームを選択"
                  value={targetTeam}
                  onChange={(e) => setTargetTeam(e.target.value)}
                  style={{
                    padding: "0.45rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-strong)",
                    background: "#ffffff",
                    color: "var(--text-main)",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                  }}
                >
                  {divTeams.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.shortName}（{t.name}）
                    </option>
                  ))}
                </select>

                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-sub)" }}>
                  が
                </span>

                <select
                  aria-label="目標順位を選択"
                  value={targetRank}
                  onChange={(e) => setTargetRank(Number(e.target.value) as 1 | 2 | 3)}
                  style={{
                    padding: "0.45rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-strong)",
                    background: "#ffffff",
                    color: "var(--primary)",
                    fontWeight: 800,
                    fontSize: "0.88rem",
                  }}
                >
                  <option value={1}>1位（決勝シード）になる場合</option>
                  <option value={2}>2位（準決勝HOME）になる場合</option>
                  <option value={3}>3位（PO滑り込み）になる場合</option>
                </select>

                <button
                  type="button"
                  onClick={handleAutoFillForTargetRank}
                  className="btn btn-primary"
                >
                  この条件で自動埋め
                </button>
              </div>
            </div>

            {/* 入力状況 ＆ リセット・URL共有 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-sub)" }}>
                入力済み: <strong>{filledCount} / {unplayedMatches.length}</strong> 試合
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
                  className="btn"
                >
                  この予想URLをコピー
                </button>
              </div>
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
                  const isTargetTeamMatch =
                    m.home === targetTeam || m.away === targetTeam;

                  return (
                    <div
                      key={m.id}
                      style={{
                        background: selectedOut ? "#f8fafc" : "#ffffff",
                        border: selectedOut
                          ? "2px solid var(--primary)"
                          : isTargetTeamMatch
                            ? "1px solid #93c5fd"
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
                          <strong
                            style={{
                              fontSize: "1rem",
                              color:
                                m.away === targetTeam
                                  ? "var(--primary)"
                                  : "var(--text-main)",
                            }}
                          >
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
                          <strong
                            style={{
                              fontSize: "1rem",
                              color:
                                m.home === targetTeam
                                  ? "var(--primary)"
                                  : "var(--text-main)",
                            }}
                          >
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
                    const isSelectedTarget = team.key === targetTeam;

                    return (
                      <React.Fragment key={team.key}>
                        <tr
                          style={
                            isSelectedTarget
                              ? { background: "var(--primary-bg)" }
                              : undefined
                          }
                        >
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
                              <span
                                style={{
                                  color: isSelectedTarget
                                    ? "var(--primary)"
                                    : "var(--text-main)",
                                }}
                              >
                                {team.shortName}
                              </span>
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
