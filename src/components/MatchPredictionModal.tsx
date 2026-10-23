import React, { useRef, useState } from "react";
import { createPredictionCardExporter } from "@/lib/prediction-card-export";
import { DONATION_CONFIG } from "@/config/donation";
import type { DivisionId, MatchRecord, ScorePatternId } from "@/lib/types";
import { SCORE_OUTCOME_MAP, TEAM_META_MAP } from "@/lib/simulator";

interface MatchPrediction {
  matchId: string;
  sectionNumber: number;
  matchIndex: number;
  homeTeamKey: string;
  awayTeamKey: string;
  homeScore: number;
  awayScore: number;
  isFilled: boolean;
  outcomeLabel?: string;
}

interface MatchPredictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  division: DivisionId;
  allUnplayedMatches: MatchRecord[];
  customOutcomes: Record<string, ScorePatternId>;
  shareUrl: string;
}

/**
 * 背景色(HEX)の輝度から適切な文字色（白/黒）を判定
 */
function getContrastColor(hex?: string): string {
  if (!hex) return "#ffffff";
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return "#ffffff";
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

export function MatchPredictionModal({
  isOpen,
  onClose,
  division,
  allUnplayedMatches,
  customOutcomes,
  shareUrl,
}: MatchPredictionModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const exporterRef = useRef<ReturnType<typeof createPredictionCardExporter> | null>(null);
  if (!exporterRef.current) exporterRef.current = createPredictionCardExporter();
  const [generating, setGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // 未消化の節一覧
  const availableSections = Array.from(
    new Set(allUnplayedMatches.map((m) => m.sectionNumber))
  ).sort((a, b) => a - b);

  // 選択中の節（デフォルトは最も直近の未消化節）
  const [selectedSection, setSelectedSection] = useState<number>(() => {
    return availableSections[0] || 9;
  });

  // 出力モード: 'all' (全試合まとめ) または 特定の matchId
  const [selectedMatchMode, setSelectedMatchMode] = useState<string>("all");

  if (!isOpen) return null;

  // 対象節のマッチ一覧
  const sectionMatches = allUnplayedMatches.filter(
    (m) => m.sectionNumber === selectedSection
  );

  const predictions: MatchPrediction[] = sectionMatches.map((m, idx) => {
    const outcomeId = customOutcomes[m.id];
    const outcome = outcomeId ? SCORE_OUTCOME_MAP[outcomeId] : null;
    return {
      matchId: m.id,
      sectionNumber: m.sectionNumber,
      matchIndex: idx + 1,
      homeTeamKey: m.home,
      awayTeamKey: m.away,
      homeScore: outcome ? outcome.homePoint : 0,
      awayScore: outcome ? outcome.awayPoint : 0,
      isFilled: Boolean(outcome),
      outcomeLabel: outcome?.label,
    };
  });

  // 選択中の単一マッチ（単一モード時）
  const currentSingleMatch =
    selectedMatchMode !== "all"
      ? predictions.find((p) => p.matchId === selectedMatchMode) || predictions[0]
      : null;

  const currentHomeMeta = currentSingleMatch
    ? TEAM_META_MAP[currentSingleMatch.homeTeamKey]
    : null;
  const currentAwayMeta = currentSingleMatch
    ? TEAM_META_MAP[currentSingleMatch.awayTeamKey]
    : null;

  // ダウンロードファイル名の決定 (SFL公式順: AWAY vs HOME)
  const getDownloadFileName = () => {
    if (selectedMatchMode === "all" || !currentSingleMatch) {
      return `SFL2026_Div${division.toUpperCase()}_Sec${selectedSection}_All_Predictions.png`;
    }
    const aName = currentAwayMeta?.shortName || currentSingleMatch.awayTeamKey;
    const hName = currentHomeMeta?.shortName || currentSingleMatch.homeTeamKey;
    return `SFL2026_Div${division.toUpperCase()}_Sec${selectedSection}_MATCH${currentSingleMatch.matchIndex}_${aName}_vs_${hName}.png`;
  };

  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const blob = await exporterRef.current!(cardRef.current);
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = getDownloadFileName();
      link.href = imageUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(imageUrl), 10_000);
    } catch (err) {
      console.error("画像生成に失敗しました", err);
      alert("画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    setCopyStatus(null);
    try {
      if (
        navigator.clipboard?.write &&
        typeof window.ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          // Start the clipboard write during the click, even while rendering.
          new window.ClipboardItem({ "image/png": exporterRef.current!(cardRef.current) }),
        ]);
        setCopyStatus("✓ クリップボードに画像をコピーしました！Xに直接ペーストできます");
      } else {
        setCopyStatus("※このブラウザは画像コピーに対応していません。「画像を保存」をご利用ください");
      }
    } catch (err) {
      console.warn("クリップボード書き込みエラー", err);
      setCopyStatus("※コピーに失敗しました。「画像を保存」からダウンロードしてください");
    } finally {
      setGenerating(false);
      setTimeout(() => setCopyStatus(null), 4000);
    }
  };

  // Xシェア文面の生成 (SFL公式順: AWAY vs HOME)
  let tweetText = "";
  if (selectedMatchMode === "all" || !currentSingleMatch) {
    tweetText = `【SFL 2026 Div.${division.toUpperCase()} 第${selectedSection}節 予想】\n次節全カードのスコア予想を作成しました！\nこの予想による順位表・プレーオフ進出条件シミュレーションはこちら👇`;
  } else {
    const aName = currentAwayMeta?.shortName || currentSingleMatch.awayTeamKey;
    const hName = currentHomeMeta?.shortName || currentSingleMatch.homeTeamKey;
    const scoreStr = currentSingleMatch.isFilled
      ? `（予想スコア: ${aName} ${currentSingleMatch.awayScore} - ${currentSingleMatch.homeScore} ${hName}）`
      : "";
    tweetText = `【SFL 2026 Div.${division.toUpperCase()} 第${selectedSection}節 MATCH ${currentSingleMatch.matchIndex}】\n${aName}(AWAY) vs ${hName}(HOME) の対戦スコア予想カードを作成しました！${scoreStr}\n順位表・突破条件シミュレーションはこちら👇`;
  }

  const tweetIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(shareUrl)}&hashtags=SF6,SFL2026,SFLシミュレーター`;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "700px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
          position: "relative",
        }}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
              次節スコア予想カード出力 & Xシェア
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              SFL公式順（左: AWAY / 右: HOME）で迫力ある対戦画面風カードを出力できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              lineHeight: 1,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.25rem 0.5rem",
            }}
          >
            ×
          </button>
        </div>

        {/* 節セレクター */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            対象の節を選択:
          </span>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {availableSections.map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={generating}
                onClick={() => {
                  setSelectedSection(sec);
                  setSelectedMatchMode("all");
                }}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border:
                    selectedSection === sec
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border-color)",
                  background:
                    selectedSection === sec ? "var(--primary-bg)" : "#ffffff",
                  color:
                    selectedSection === sec
                      ? "var(--primary)"
                      : "var(--text-main)",
                }}
              >
                第{sec}節
              </button>
            ))}
          </div>
        </div>

        {/* 出力対象の選択タブ (SFL公式順: AWAY vs HOME) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            marginBottom: "1rem",
            padding: "0.4rem",
            background: "var(--bg-subtle)",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            disabled={generating}
            onClick={() => setSelectedMatchMode("all")}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor: "pointer",
              border: "none",
              whiteSpace: "nowrap",
              background: selectedMatchMode === "all" ? "var(--primary)" : "transparent",
              color: selectedMatchMode === "all" ? "#ffffff" : "var(--text-main)",
              transition: "all 0.15s ease",
            }}
          >
            📋 節全体（全{predictions.length}試合）
          </button>

          {predictions.map((p) => {
            const hMeta = TEAM_META_MAP[p.homeTeamKey];
            const aMeta = TEAM_META_MAP[p.awayTeamKey];
            const isSelected = selectedMatchMode === p.matchId;
            return (
              <button
                key={p.matchId}
                type="button"
                disabled={generating}
                onClick={() => setSelectedMatchMode(p.matchId)}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  border: "none",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: isSelected ? "var(--primary)" : "transparent",
                  color: isSelected ? "#ffffff" : "var(--text-main)",
                  transition: "all 0.15s ease",
                }}
              >
                <span>MATCH {p.matchIndex}:</span>
                <span style={{ fontWeight: 900 }}>
                  {aMeta?.shortName || p.awayTeamKey.toUpperCase()} vs{" "}
                  {hMeta?.shortName || p.homeTeamKey.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>

        {/* 画像化対象のカードコンテナ（16:9比率対応・高コントラストeスポーツ仕様） */}
        <div
          ref={cardRef}
          style={{
            background: "linear-gradient(135deg, #090d16 0%, #111827 50%, #0a0f1d 100%)",
            borderRadius: "14px",
            padding: "1.4rem",
            color: "#ffffff",
            marginBottom: "1.25rem",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* 背景のサイバーグリッド装飾 */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "linear-gradient(90deg, #3b82f6, #f59e0b, #ec4899)",
            }}
          />

          {/* ===== パターンA: 節全体（全試合まとめ） ===== */}
          {selectedMatchMode === "all" ? (
            <>
              {/* カードヘッダー */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      color: "#fbbf24",
                    }}
                  >
                    STREET FIGHTER LEAGUE: Pro-JP 2026
                  </div>
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 900,
                      color: "#ffffff",
                      marginTop: "0.1rem",
                    }}
                  >
                    Division {division.toUpperCase()} 第 {selectedSection} 節 スコア予想
                  </h2>
                </div>
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "#94a3b8",
                    background: "rgba(255, 255, 255, 0.08)",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                >
                  ファン予測カード
                </div>
              </div>

              {/* 対戦カード一覧 (SFL公式準拠: 左側 AWAY / 右側 HOME) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {predictions.map((p) => {
                  const homeMeta = TEAM_META_MAP[p.homeTeamKey];
                  const awayMeta = TEAM_META_MAP[p.awayTeamKey];
                  const homeBadgeColor = homeMeta?.color || "#ea580c";
                  const awayBadgeColor = awayMeta?.color || "#475569";
                  return (
                    <div
                      key={p.matchId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "0.75rem 1rem",
                      }}
                    >
                      {/* AWAY チーム (左側・先手) */}
                      <div
                        style={{
                          width: "38%",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.55rem",
                        }}
                      >
                        <span
                          style={{
                            background: awayBadgeColor,
                            color: getContrastColor(awayBadgeColor),
                            fontSize: "0.75rem",
                            fontWeight: 900,
                            padding: "0.25rem 0.55rem",
                            borderRadius: "5px",
                            letterSpacing: "0.04em",
                            minWidth: "48px",
                            textAlign: "center",
                            boxShadow: `0 0 10px ${awayBadgeColor}50`,
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                          }}
                        >
                          {awayMeta?.shortName || p.awayTeamKey.toUpperCase()}
                        </span>
                        <div style={{ overflow: "hidden" }}>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 800,
                              color: "#ffffff",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {awayMeta?.name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              color: "#94a3b8",
                            }}
                          >
                            [AWAY]
                          </div>
                        </div>
                      </div>

                      {/* スコア (AWAY - HOME) */}
                      <div
                        style={{
                          width: "24%",
                          textAlign: "center",
                        }}
                      >
                        {p.isFilled ? (
                          <div>
                            <div
                              style={{
                                fontSize: "1.35rem",
                                fontWeight: 900,
                                letterSpacing: "0.05em",
                                color: "#fde047",
                                textShadow: "0 0 12px rgba(253, 224, 71, 0.35)",
                              }}
                            >
                              {p.awayScore} - {p.homeScore}
                            </div>
                            {p.outcomeLabel && (
                              <div
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  marginTop: "0.1rem",
                                }}
                              >
                                {p.outcomeLabel}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: "#64748b",
                              background: "rgba(255, 255, 255, 0.05)",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                            }}
                          >
                            未入力
                          </div>
                        )}
                      </div>

                      {/* HOME チーム (右側・迎え撃つ側) */}
                      <div
                        style={{
                          width: "38%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: "0.55rem",
                        }}
                      >
                        <div style={{ overflow: "hidden", textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 800,
                              color: "#ffffff",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {homeMeta?.name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              color: "#94a3b8",
                            }}
                          >
                            [HOME]
                          </div>
                        </div>
                        <span
                          style={{
                            background: homeBadgeColor,
                            color: getContrastColor(homeBadgeColor),
                            fontSize: "0.75rem",
                            fontWeight: 900,
                            padding: "0.25rem 0.55rem",
                            borderRadius: "5px",
                            letterSpacing: "0.04em",
                            minWidth: "48px",
                            textAlign: "center",
                            boxShadow: `0 0 10px ${homeBadgeColor}50`,
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                          }}
                        >
                          {homeMeta?.shortName || p.homeTeamKey.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* ===== パターンB: 単一マッチ（SFL公式順: 左側 AWAY / 右側 HOME） ===== */
            currentSingleMatch && (
              <div>
                {/* マッチヘッダー */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
                    paddingBottom: "0.6rem",
                    marginBottom: "1.2rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        color: "#fbbf24",
                      }}
                    >
                      STREET FIGHTER LEAGUE: Pro-JP 2026
                    </span>
                    <h2
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 900,
                        color: "#ffffff",
                        marginTop: "0.1rem",
                      }}
                    >
                      Division {division.toUpperCase()} 第 {selectedSection} 節 — MATCH{" "}
                      {currentSingleMatch.matchIndex}
                    </h2>
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      color: "#38bdf8",
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "999px",
                    }}
                  >
                    MATCH PREDICTION
                  </div>
                </div>

                {/* VS 対戦グリッド (左: AWAY / 右: HOME) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem 0",
                  }}
                >
                  {/* AWAY 側 (左側) */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "0.5rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "1.1rem 0.8rem",
                      borderTop: `4px solid ${currentAwayMeta?.color || "#475569"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        color: "#94a3b8",
                        letterSpacing: "0.08em",
                      }}
                    >
                      [AWAY TEAM]
                    </div>
                    {/* 特大チームバッジ */}
                    <div
                      style={{
                        background: currentAwayMeta?.color || "#475569",
                        color: getContrastColor(currentAwayMeta?.color),
                        fontWeight: 900,
                        fontSize: "1.45rem",
                        letterSpacing: "0.05em",
                        padding: "0.45rem 1.25rem",
                        borderRadius: "8px",
                        boxShadow: `0 0 20px ${currentAwayMeta?.color}60`,
                        border: "1px solid rgba(255, 255, 255, 0.25)",
                      }}
                    >
                      {currentAwayMeta?.shortName ||
                        currentSingleMatch.awayTeamKey.toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 800,
                        color: "#ffffff",
                        marginTop: "0.2rem",
                      }}
                    >
                      {currentAwayMeta?.name}
                    </div>
                    {/* 獲得予想ポイント */}
                    <div
                      style={{
                        marginTop: "0.4rem",
                        fontSize: "1.8rem",
                        fontWeight: 900,
                        color:
                          currentSingleMatch.awayScore > currentSingleMatch.homeScore
                            ? "#4ade80"
                            : "#ffffff",
                        textShadow:
                          currentSingleMatch.awayScore > currentSingleMatch.homeScore
                            ? "0 0 16px rgba(74, 222, 128, 0.4)"
                            : "none",
                      }}
                    >
                      {currentSingleMatch.isFilled
                        ? `${currentSingleMatch.awayScore} pt`
                        : "- pt"}
                    </div>
                  </div>

                  {/* 中央 VS 演出 */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 900,
                        fontStyle: "italic",
                        letterSpacing: "0.1em",
                        color: "#fbbf24",
                        textShadow: "0 0 14px rgba(251, 191, 36, 0.5)",
                      }}
                    >
                      VS
                    </div>
                    {currentSingleMatch.outcomeLabel && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          color: "#fde047",
                          background: "rgba(253, 224, 71, 0.15)",
                          border: "1px solid rgba(253, 224, 71, 0.3)",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "999px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {currentSingleMatch.outcomeLabel}
                      </span>
                    )}
                  </div>

                  {/* HOME 側 (右側) */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "0.5rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "1.1rem 0.8rem",
                      borderTop: `4px solid ${currentHomeMeta?.color || "#ea580c"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        color: "#94a3b8",
                        letterSpacing: "0.08em",
                      }}
                    >
                      [HOME TEAM]
                    </div>
                    {/* 特大チームバッジ */}
                    <div
                      style={{
                        background: currentHomeMeta?.color || "#ea580c",
                        color: getContrastColor(currentHomeMeta?.color),
                        fontWeight: 900,
                        fontSize: "1.45rem",
                        letterSpacing: "0.05em",
                        padding: "0.45rem 1.25rem",
                        borderRadius: "8px",
                        boxShadow: `0 0 20px ${currentHomeMeta?.color}60`,
                        border: "1px solid rgba(255, 255, 255, 0.25)",
                      }}
                    >
                      {currentHomeMeta?.shortName ||
                        currentSingleMatch.homeTeamKey.toUpperCase()}
                    </div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 800,
                        color: "#ffffff",
                        marginTop: "0.2rem",
                      }}
                    >
                      {currentHomeMeta?.name}
                    </div>
                    {/* 獲得予想ポイント */}
                    <div
                      style={{
                        marginTop: "0.4rem",
                        fontSize: "1.8rem",
                        fontWeight: 900,
                        color:
                          currentSingleMatch.homeScore > currentSingleMatch.awayScore
                            ? "#4ade80"
                            : "#ffffff",
                        textShadow:
                          currentSingleMatch.homeScore > currentSingleMatch.awayScore
                            ? "0 0 16px rgba(74, 222, 128, 0.4)"
                            : "none",
                      }}
                    >
                      {currentSingleMatch.isFilled
                        ? `${currentSingleMatch.homeScore} pt`
                        : "- pt"}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* カードフッター */}
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.72rem",
              color: "#94a3b8",
            }}
          >
            <span>SFL 2026 順位・突破条件シミュレーター (ファンツール)</span>
            <span style={{ fontFamily: "monospace", color: "#64748b" }}>
              sfl-simulator.vercel.app
            </span>
          </div>
        </div>

        {/* コピー通知メッセージ */}
        {copyStatus && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.6rem 0.85rem",
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              color: "var(--success)",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {copyStatus}
          </div>
        )}

        {/* 操作ボタン群 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.65rem",
            justifyContent: "center",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={generating}
            className="btn"
            style={{
              background: "var(--text-main)",
              color: "#ffffff",
              padding: "0.6rem 1.15rem",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "0.88rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: "pointer",
            }}
          >
            <span>📷</span>
            <span>
              {generating
                ? "画像生成中..."
                : selectedMatchMode === "all"
                  ? "節全体の予想画像を保存"
                  : `MATCH ${currentSingleMatch?.matchIndex} の画像を保存`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyImageToClipboard}
            disabled={generating}
            className="btn"
            style={{
              padding: "0.6rem 1.15rem",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "0.88rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: "pointer",
            }}
          >
            <span>📋</span>
            <span>画像をコピー</span>
          </button>

          <a
            href={tweetIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              background: "#000000",
              color: "#ffffff",
              padding: "0.6rem 1.25rem",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "0.88rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
            }}
          >
            <span>𝕏</span>
            <span>
              {selectedMatchMode === "all"
                ? "節予想をXでポスト"
                : `MATCH ${currentSingleMatch?.matchIndex} をXでポスト`}
            </span>
          </a>
        </div>

        <p
          style={{
            fontSize: "0.76rem",
            color: "var(--text-muted)",
            textAlign: "center",
            marginBottom: "1rem",
            lineHeight: 1.45,
          }}
        >
          ※画像を保存またはコピーしてXに画像添付すると、タイムラインで大きく目立ちます！
        </p>

        {/* Buy Me a Coffee 応援リンク */}
        <div
          style={{
            background: "var(--bg-subtle)",
            border: "1px dashed var(--border-color)",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--text-sub)",
              marginBottom: "0.4rem",
            }}
          >
            予想画像機能が役に立ったら、開発者をコーヒー1杯分応援いただけると励みになります！
          </div>
          <a
            href={DONATION_CONFIG.bmcUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.85rem",
              borderRadius: "6px",
              background: "#FFDD00",
              color: "#000000",
              fontWeight: 800,
              fontSize: "0.78rem",
              textDecoration: "none",
            }}
          >
            <span>☕</span>
            <span>開発者を支援する（Buy Me a Coffee）</span>
          </a>
        </div>
      </div>
    </div>
  );
}
