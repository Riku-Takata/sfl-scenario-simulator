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

/** 予測モデルの過去の精度 (docs/model-eval-report.md から simulator.astro で読み取る) */
export interface ModelEvidence {
  bouts: number;
  logLoss: number;
  brier: number;
  baselineLogLoss: number;
  baselineBrier: number;
}

interface Props {
  matchesData: MatchesData;
  standingsData: StandingsData;
  scenariosData: ScenariosData;
  modelEvidence?: ModelEvidence;
}

/** 自動埋めした展開の根拠 (ページ上部に出す) */
interface FillInfo {
  title: string;
  /** 目標つきなら何番目の候補か (1始まり) と候補数 */
  index?: number;
  total?: number;
  /** 最も起こりやすい展開 (制約なし) に対する、この展開の起こりやすさ (0〜1) */
  ratioToBest: number;
  deviations: ScenarioDeviation[];
  note?: string;
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

import {
  ALL_PATTERNS,
  AWAY_WIN_PATTERNS,
  decodeSimulationCode,
  encodeSimulationCode,
  generateOutcomesForTargetRank,
  HOME_WIN_PATTERNS,
  mapPlanToScorePattern,
} from "@/lib/simulation-code";
import { MatchPredictionModal } from "./MatchPredictionModal";
import { computeRankBounds, explainTarget, type TeamRankBounds } from "@/lib/feasibility";
import { findLikelyScenarios, type ScenarioDeviation } from "@/lib/scenario-search";

/** 入力後の厳密判定を、確率なしの状態にする (入力した結果ではモンテカルロを回し直さないため) */
function liveTargetLabel(bounds: TeamRankBounds | undefined, rank: number): { text: string; tone: "ok" | "warn" | "bad" | "sure" } {
  if (!bounds) return { text: "-", tone: "warn" };
  if (bounds.bestRank > rank) return { text: "不可能", tone: "bad" };
  if (bounds.exhaustive && bounds.worstRank <= rank) return { text: "確定", tone: "sure" };
  if (bounds.bestRankWithoutTiebreak > rank) return { text: "得失差次第", tone: "warn" };
  return { text: "可能", tone: "ok" };
}

const TONE_COLOR: Record<"ok" | "warn" | "bad" | "sure", string> = {
  sure: "var(--success)",
  ok: "var(--text-main)",
  warn: "var(--warning)",
  bad: "var(--danger)",
};

function patternLabel(pattern: ScorePatternId, homeShort: string, awayShort: string): string {
  const o = SCORE_OUTCOME_MAP[pattern];
  return o.winner === "home" ? `${homeShort} ${o.homePoint}-${o.awayPoint}` : `${awayShort} ${o.awayPoint}-${o.homePoint}`;
}

export { decodeSimulationCode, encodeSimulationCode, generateOutcomesForTargetRank };

export default function InteractiveSimulator({
  matchesData,
  standingsData,
  scenariosData,
  modelEvidence,
}: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [targetTeam, setTargetTeam] = useState<string>("fav");
  const [targetRank, setTargetRank] = useState<1 | 2 | 3>(1);
  const [customOutcomes, setCustomOutcomes] = useState<
    Record<string, ScorePatternId>
  >({});
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState<boolean>(false);
  const [isPredictionModalOpen, setIsPredictionModalOpen] = useState<boolean>(false);
  const [fillInfo, setFillInfo] = useState<FillInfo | null>(null);
  /** 同じ目標で押し直したときに、何番目の候補を出すか */
  const [fillCursor, setFillCursor] = useState<{ key: string; index: number } | null>(null);
  const predictions = scenariosData.matchPredictions;

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
      qDiv === "f" || shortF !== null ? "f" : "s";
    setDivision(targetDiv);
    setTargetTeam(targetDiv === "f" ? "varrel" : "fav");

    const divUnplayed = matchesData.matches
      .filter((m) => m.division === targetDiv && !m.played)
      .sort((a, b) =>
        a.sectionNumber !== b.sectionNumber
          ? a.sectionNumber - b.sectionNumber
          : a.matchNumber - b.matchNumber
      );

    const shortCode = (targetDiv === "f" ? (shortF || shortS) : shortS) || "";
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
      // 乱数ではなく、目標を満たす展開のうち最も起こりやすいものを入れる (同じ URL ならいつも同じ展開)
      const likely = findLikelyScenarios({
        division: targetDiv,
        matches: matchesData.matches,
        predictions: scenariosData.matchPredictions,
        target: { teamKey: qTeam, rank: rankNum },
        limit: 1,
      }).scenarios[0];
      setCustomOutcomes(likely?.outcomes ?? generateOutcomesForTargetRank(targetDiv, matchesData.matches, qTeam, rankNum));
    }
  }, [matchesData.matches, scenariosData.teams, scenariosData.matchPredictions]);

  const baseStandings = standingsData.divisions[division];
  const baseRankMap = useMemo(
    () => Object.fromEntries(baseStandings.map((t) => [t.key, t])),
    [baseStandings]
  );

  const simulatedStandings = useMemo(
    () => calculateStandings(division, matchesData.matches, customOutcomes),
    [division, matchesData.matches, customOutcomes]
  );

  // 入力した結果を固定したうえでの厳密判定 (1ディビジョン数ミリ秒。時間切れなら概算扱い)
  const liveBounds = useMemo(
    () => computeRankBounds(division, matchesData.matches, customOutcomes, { timeLimitMs: 400 }),
    [division, matchesData.matches, customOutcomes]
  );
  const hasCustomInput = Object.keys(customOutcomes).length > 0;

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

  const flash = (message: string) => {
    setCopiedMessage(message);
    setTimeout(() => setCopiedMessage(null), 4000);
  };

  /** 制約なしで最も起こりやすい展開の確率 (根拠の「何分の1か」の基準) */
  const bestFreeProbability = (fixed: Record<string, ScorePatternId>) =>
    findLikelyScenarios({ division, matches: matchesData.matches, predictions, fixed, limit: 1 }).scenarios[0]?.probability ?? 0;

  // 空いている試合を、モデルで最も起こりやすいスコアで埋める (入力済みの試合はそのまま)
  const handleFillMostLikely = () => {
    const result = findLikelyScenarios({ division, matches: matchesData.matches, predictions, fixed: customOutcomes, limit: 1 });
    const best = result.scenarios[0];
    if (!best) return;
    setCustomOutcomes(best.outcomes);
    setFillCursor(null);
    setFillInfo({
      title: hasCustomInput ? "入力済みの試合を残し、残りを最も起こりやすいスコアで埋めました" : "全試合を、モデルで最も起こりやすいスコアで埋めました",
      ratioToBest: 1,
      deviations: [],
    });
    flash("最も起こりやすい展開で埋めました");
  };

  const handleAutoFillForTargetRank = () => {
    const teamShort = TEAM_META_MAP[targetTeam]?.shortName ?? targetTeam;
    const label = `${teamShort} が ${targetRank}位`;
    // 目標の判定は入力前の状態 (実績だけ) で行う。自動埋めは入力を置き換えるため
    const baseBounds = computeRankBounds(division, matchesData.matches, {}, { timeLimitMs: 400 })[targetTeam];
    if (baseBounds && (baseBounds.bestRank > targetRank || (baseBounds.exhaustive && baseBounds.worstRank < targetRank))) {
      const reason = baseBounds.bestRank > targetRank
        ? explainTarget(baseBounds, targetRank, `${targetRank}位`)
        : `最悪でも${baseBounds.worstRank}位以内が決まっていて、${targetRank}位まで下がることはない。`;
      setFillInfo({ title: `${label} になる展開はありません（数学的に不可能）`, ratioToBest: 0, deviations: [], note: reason });
      flash(`${label} は不可能です`);
      return;
    }
    const key = `${division}:${targetTeam}:${targetRank}`;
    const index = fillCursor?.key === key ? fillCursor.index + 1 : 0;
    const result = findLikelyScenarios({
      division, matches: matchesData.matches, predictions,
      target: { teamKey: targetTeam, rank: targetRank }, limit: 5,
    });
    if (!result.scenarios.length) {
      if (result.exhaustive) {
        setFillInfo({
          title: `${label} になる展開は、代表スコアでは再現できません`,
          ratioToBest: 0, deviations: [],
          note: "ポイントで並んだチームを、実際の得失差しだいで上回った場合にだけ届きます。画面のスコアはバトル・ラウンド差を代表値で数えるため、その展開を入力できません。",
        });
        flash(`${label} は得失差しだいでのみ可能です`);
        return;
      }
      // 時間内に見つからなかったときだけ、以前の探索で一例を出す
      setCustomOutcomes(generateOutcomesForTargetRank(division, matchesData.matches, targetTeam, targetRank));
      setFillInfo({ title: `${label} になる展開の一例（時間内に最も起こりやすい展開を探しきれませんでした）`, ratioToBest: 0, deviations: [] });
      return;
    }
    const position = index % result.scenarios.length;
    const pick = result.scenarios[position];
    setCustomOutcomes(pick.outcomes);
    setFillCursor({ key, index: position });
    const free = bestFreeProbability({});
    setFillInfo({
      title: `${label} になる展開のうち、${position + 1}番目に起こりやすいもの`,
      index: position + 1,
      total: result.scenarios.length,
      ratioToBest: free > 0 ? pick.probability / free : 0,
      deviations: pick.deviations,
    });
    flash(`${label} になる展開を入力しました（もう一度押すと次に起こりやすい展開）`);
  };

  const buildShareUrl = (week?: number) => {
    const code = encodeSimulationCode(unplayedMatches, customOutcomes);
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/simulator`
        : "/simulator";
    const params = new URLSearchParams();
    params.set("div", division);
    if (code) {
      params.set("s", code);
    }
    if (week) {
      params.set("w", String(week));
    }
    return `${baseUrl}?${params.toString()}`;
  };

  const handleCopyShareUrl = async () => {
    const url = buildShareUrl();
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", url);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        // Ignore fallback failure
      }
    }
    setUrlCopied(true);
    setCopiedMessage("URLをコピーしました！");
    setTimeout(() => {
      setUrlCopied(false);
      setCopiedMessage(null);
    }, 3000);
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

  const statusTone = (status: string | undefined): "ok" | "warn" | "bad" | "sure" =>
    status === "impossible" ? "bad" : status === "clinched" ? "sure" : status === "tiny" || status === "tiebreak" || status === "unknown" ? "warn" : "ok";

  /** 順位表の「1位」「PO」欄。入力が無ければ確率つき、入力があれば入力を固定した厳密判定 */
  const targetCell = (teamKey: string, kind: "first" | "playoff") => {
    const rank = kind === "first" ? 1 : 3;
    const saved = scenariosData.teams[teamKey]?.feasibility?.targets[kind];
    if (!hasCustomInput && saved) {
      return { text: saved.label, tone: statusTone(saved.status), reason: saved.reason };
    }
    const bounds = liveBounds[teamKey];
    const live = liveTargetLabel(bounds, rank);
    const reason = bounds && live.tone === "bad" ? explainTarget(bounds, rank, kind === "first" ? "1位" : "プレイオフ（3位以内）") : undefined;
    return { ...live, reason };
  };

  const lastPlayedSection = (div: DivisionId) =>
    Math.max(0, ...matchesData.matches.filter((m) => m.division === div && m.played).map((m) => m.sectionNumber));
  const updatedAtText = (() => {
    const d = new Date(scenariosData.updatedAt);
    if (Number.isNaN(d.getTime())) return scenariosData.updatedAt;
    const jst = new Date(d.getTime() + 9 * 3600_000);
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  })();
  const matchLabel = (matchId: string) => {
    const m = matchesData.matches.find((x) => x.id === matchId);
    if (!m) return matchId;
    return `第${m.sectionNumber}節 ${TEAM_META_MAP[m.away]?.shortName ?? m.away} vs ${TEAM_META_MAP[m.home]?.shortName ?? m.home}`;
  };
  const scoreLabel = (matchId: string, pattern: ScorePatternId) => {
    const m = matchesData.matches.find((x) => x.id === matchId);
    return m ? patternLabel(pattern, TEAM_META_MAP[m.home]?.shortName ?? m.home, TEAM_META_MAP[m.away]?.shortName ?? m.away) : pattern;
  };

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

      {/* この予測の根拠 (設計 §5) */}
      <details className="panel" open style={{ padding: "1rem 1.25rem" }}>
        <summary style={{ fontWeight: 800, cursor: "pointer", color: "var(--text-main)" }}>この予測の根拠</summary>
        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.75rem", fontSize: "0.86rem", lineHeight: 1.75, color: "var(--text-sub)" }}>
          <div>
            <strong style={{ color: "var(--text-main)" }}>データ：</strong>
            Division S 第{lastPlayedSection("s")}節・Division F 第{lastPlayedSection("f")}節までの公式結果（更新 {updatedAtText}）。
            順位の確率は、残り試合を{scenariosData.simulationRuns.toLocaleString()}回シミュレーションしてその順位になった割合です。
          </div>
          <div>
            <strong style={{ color: "var(--text-main)" }}>予測モデル：</strong>
            選手ごとの実力値、キャラ相性、HOME の後出し有利から、各試合のスコア（40-0〜0-40 の6通り）の確率を出しています。
            実力値は SFL の全試合と start.gg の大会成績から学習し、その不確かさは200通りの見込みで平均しています。オーダーは発表前なので、過去の起用傾向から見込んでいます。
            {modelEvidence && (
              <>
                {" "}2026年レギュラーシーズン{modelEvidence.bouts}ボウトでの検証では、対数損失 {modelEvidence.logLoss.toFixed(3)}・Brier {modelEvidence.brier.toFixed(3)}
                （常に50%と予想した場合は {modelEvidence.baselineLogLoss.toFixed(3)}・{modelEvidence.baselineBrier.toFixed(3)}。小さいほど良い）。
              </>
            )}
          </div>
          {fillInfo && (
            <div style={{ padding: "0.7rem 0.85rem", background: "var(--bg-subtle)", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
              <strong style={{ color: "var(--text-main)" }}>自動埋めした展開：</strong>
              {fillInfo.title}。
              {fillInfo.ratioToBest >= 0.999 && " モデルで最も起こりやすい展開そのものです。"}
              {fillInfo.ratioToBest > 0 && fillInfo.ratioToBest < 0.999 && (
                <> 条件を付けない最も起こりやすい展開と比べて、約{Math.max(2, Math.round(1 / fillInfo.ratioToBest)).toLocaleString()}分の1の起こりやすさです。</>
              )}
              {fillInfo.note && <div style={{ marginTop: "0.35rem" }}>{fillInfo.note}</div>}
              {fillInfo.deviations.length > 0 && (
                <div style={{ marginTop: "0.35rem" }}>
                  モデルの予想と違う結果にした試合（{fillInfo.deviations.length}試合）:
                  <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
                    {fillInfo.deviations.map((d) => (
                      <li key={d.matchId}>
                        {matchLabel(d.matchId)}：{scoreLabel(d.matchId, d.pattern)}（確率 {(d.probability * 100).toFixed(1)}%。最有力は {scoreLabel(d.matchId, d.mostLikely)} {(d.mostLikelyProbability * 100).toFixed(1)}%）
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <strong style={{ color: "var(--text-main)" }}>判定の意味：</strong>
            「不可能」はどの結果・得失差でも届かない、「確定」はどの結果でもその順位以内、
            「得失差次第」はポイントで並んだうえで得失差で上回る場合だけ届く、「0.1%未満（可能性あり）」は届くがシミュレーションではほとんど起きない、という意味です。
            試合を入力している間は、入力した結果を固定した判定を出します（確率は出しません）。
          </div>
        </div>
      </details>

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
                  この条件で最も起こりやすい展開を入力
                </button>
              </div>
              <button
                type="button"
                onClick={handleFillMostLikely}
                className="btn"
                disabled={filledCount === unplayedMatches.length}
              >
                空いている試合を、最も起こりやすいスコアで埋める
              </button>
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
                  onClick={() => setIsPredictionModalOpen(true)}
                  className="btn"
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    color: "#fde047",
                    border: "1px solid #334155",
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.12)",
                  }}
                >
                  <span>📷</span>
                  <span>次節予想カード画像を出力</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomOutcomes({});
                    setFillInfo(null);
                    setFillCursor(null);
                  }}
                  className="btn"
                >
                  すべてリセット
                </button>
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="btn"
                  style={
                    urlCopied
                      ? {
                          background: "var(--success)",
                          color: "#ffffff",
                          borderColor: "var(--success)",
                        }
                      : {}
                  }
                >
                  {urlCopied ? "✓ URLをコピーしました！" : "この予想URLをコピー"}
                </button>
              </div>
            </div>
          </div>

          {copiedMessage && (
            <>
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem 1rem",
                  background: "var(--success-bg)",
                  border: "1px solid var(--success-border)",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  color: "var(--success)",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>✓</span>
                <span>{copiedMessage}</span>
              </div>
              <div
                style={{
                  position: "fixed",
                  bottom: "1.5rem",
                  right: "1.5rem",
                  zIndex: 9999,
                  padding: "0.85rem 1.25rem",
                  background: "#0f172a",
                  color: "#ffffff",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px rgba(15, 23, 42, 0.25)",
                  fontSize: "0.92rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "#16a34a",
                    color: "#ffffff",
                    fontSize: "0.8rem",
                  }}
                >
                  ✓
                </span>
                <span>{copiedMessage}</span>
              </div>
            </>
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

                      {predictions?.[m.id] && (() => {
                        const pred = predictions[m.id];
                        const homeShort = homeMeta?.shortName ?? m.home;
                        const awayShort = awayMeta?.shortName ?? m.away;
                        const deviates = selectedId && selectedId !== pred.mostLikely;
                        return (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                            予測: {homeShort} 勝率 {pred.homeWinProbability.toFixed(1)}% ・最有力 {patternLabel(pred.mostLikely, homeShort, awayShort)}（{((pred.weights[pred.mostLikely] ?? 0) * 100).toFixed(1)}%）
                            {selectedId && (
                              <span style={{ marginLeft: "0.4rem", fontWeight: 700, color: deviates ? "var(--warning)" : "var(--success)" }}>
                                選択中 {patternLabel(selectedId, homeShort, awayShort)} {((pred.weights[selectedId] ?? 0) * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        );
                      })()}

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
                    <th title="1位になる確率、または厳密判定">1位</th>
                    <th title="3位以内（プレイオフ進出）の確率、または厳密判定">PO</th>
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
                          {(["first", "playoff"] as const).map((kind) => {
                            const cell = targetCell(team.key, kind);
                            return (
                              <td
                                key={kind}
                                title={cell.reason}
                                style={{ fontSize: "0.78rem", fontWeight: 800, color: TONE_COLOR[cell.tone], whiteSpace: "nowrap" }}
                              >
                                {cell.text}
                              </td>
                            );
                          })}
                        </tr>
                        {idx === 2 && (
                          <tr className="borderline-row">
                            <td colSpan={7}>
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

      {/* 次節予想カード画像生成 & Xシェア モーダル */}
      <MatchPredictionModal
        isOpen={isPredictionModalOpen}
        onClose={() => setIsPredictionModalOpen(false)}
        division={division}
        allUnplayedMatches={unplayedMatches}
        customOutcomes={customOutcomes}
        shareUrl={buildShareUrl()}
      />
    </div>
  );
}
