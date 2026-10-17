import React, { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { DONATION_CONFIG } from "@/config/donation";
import type { DivisionId, MatchRecord, ScorePatternId } from "@/lib/types";
import { SCORE_OUTCOME_MAP, TEAM_META_MAP } from "@/lib/simulator";

interface MatchPrediction {
  matchId: string;
  sectionNumber: number;
  homeTeamKey: string;
  awayTeamKey: string;
  homeScore: number;
  awayScore: number;
  isFilled: boolean;
}

interface MatchPredictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  division: DivisionId;
  allUnplayedMatches: MatchRecord[];
  customOutcomes: Record<string, ScorePatternId>;
  shareUrl: string;
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

  if (!isOpen) return null;

  // 対象節のマッチ一覧
  const sectionMatches = allUnplayedMatches.filter(
    (m) => m.sectionNumber === selectedSection
  );

  const predictions: MatchPrediction[] = sectionMatches.map((m) => {
    const outcomeId = customOutcomes[m.id];
    const outcome = outcomeId ? SCORE_OUTCOME_MAP[outcomeId] : null;
    return {
      matchId: m.id,
      sectionNumber: m.sectionNumber,
      homeTeamKey: m.home,
      awayTeamKey: m.away,
      homeScore: outcome ? outcome.homePoint : 0,
      awayScore: outcome ? outcome.awayPoint : 0,
      isFilled: Boolean(outcome),
    };
  });

  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#090d16",
      });
      const link = document.createElement("a");
      link.download = `SFL2026_Div${division.toUpperCase()}_Sec${selectedSection}_Prediction.png`;
      link.href = dataUrl;
      link.click();
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
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#090d16",
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (
        navigator.clipboard &&
        typeof window.ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new window.ClipboardItem({ "image/png": blob }),
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

  const tweetText = `【SFL 2026 Div.${division.toUpperCase()} 第${selectedSection}節 予想】\n次節のスコア予想カードを作成しました！\nこの予想通りに進んだ場合のプレーオフ進出ボーダー・順位表シミュレーションはこちら👇`;
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
          maxWidth: "680px",
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
              次節スコア予想カード画像生成 & Xシェア
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              タイムラインで目立つ高解像度16:9予想画像をワンクリックで出力・保存できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.4rem",
              fontWeight: 700,
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "0.2rem 0.5rem",
            }}
          >
            ×
          </button>
        </div>

        {/* 節セレクター */}
        {availableSections.length > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--text-sub)" }}>
              予想対象の節を選択:
            </span>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(Number(e.target.value))}
              style={{
                padding: "0.35rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid var(--border-strong)",
                fontWeight: 800,
                fontSize: "0.86rem",
              }}
            >
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>
                  第 {sec} 節
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ============================================================ */}
        {/* 16:9 画像生成ターゲット（高解像度ダークグラデーションカード） */}
        {/* ============================================================ */}
        <div
          ref={cardRef}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #090d16 0%, #131a29 50%, #090d16 100%)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "14px",
            padding: "1.25rem 1.5rem",
            boxShadow: "0 12px 24px rgba(0, 0, 0, 0.4)",
            color: "#ffffff",
            fontFamily: "Inter, Noto Sans JP, sans-serif",
            marginBottom: "1.25rem",
          }}
        >
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
              非公式シミュレーター
            </div>
          </div>

          {/* 対戦カード一覧 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {predictions.map((p) => {
              const homeMeta = TEAM_META_MAP[p.homeTeamKey];
              const awayMeta = TEAM_META_MAP[p.awayTeamKey];
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
                  {/* HOME チーム */}
                  <div
                    style={{
                      width: "38%",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                    }}
                  >
                    <span
                      style={{
                        width: "5px",
                        height: "24px",
                        borderRadius: "2px",
                        background: homeMeta?.color || "#ffffff",
                        display: "inline-block",
                      }}
                    />
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
                        {homeMeta?.shortName || p.homeTeamKey.toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        [HOME] {homeMeta?.name}
                      </div>
                    </div>
                  </div>

                  {/* スコア */}
                  <div
                    style={{
                      width: "24%",
                      textAlign: "center",
                    }}
                  >
                    {p.isFilled ? (
                      <div
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 900,
                          letterSpacing: "0.05em",
                          color: "#fde047",
                          textShadow: "0 0 12px rgba(253, 224, 71, 0.35)",
                        }}
                      >
                        {p.homeScore} - {p.awayScore}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "#64748b",
                          background: "rgba(255, 255, 255, 0.05)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                        }}
                      >
                        スコア未入力
                      </div>
                    )}
                  </div>

                  {/* AWAY チーム */}
                  <div
                    style={{
                      width: "38%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "0.45rem",
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
                        {awayMeta?.shortName || p.awayTeamKey.toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        [AWAY] {awayMeta?.name}
                      </div>
                    </div>
                    <span
                      style={{
                        width: "5px",
                        height: "24px",
                        borderRadius: "2px",
                        background: awayMeta?.color || "#ffffff",
                        display: "inline-block",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

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
            <span>※ この予想による順位推計・ボーダー再現リンクあり</span>
            <span style={{ fontFamily: "monospace", color: "#64748b" }}>
              sfl-scenario-simulator.vercel.app
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
            }}
          >
            <span>📷</span>
            <span>{generating ? "画像生成中..." : "予想画像を保存する"}</span>
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
            <span>Xでポストする</span>
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
          ※画像を保存またはコピーして、Xの投稿に画像添付するとタイムラインで目立ちます！
        </p>

        {/* ドネーション誘導（Buy Me a Coffee） */}
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
