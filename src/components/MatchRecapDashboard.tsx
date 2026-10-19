import React, { useState } from "react";
import type {
  DivisionId,
  MatchRecapsData,
  RecentMatchRecap,
} from "@/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "@/lib/simulator";
import { formatCharName } from "@/lib/player-encyclopedia";

interface Props {
  recapsData: MatchRecapsData;
}

export default function MatchRecapDashboard({ recapsData }: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [openBouts, setOpenBouts] = useState<Record<string, boolean>>({});

  const latestSecNum = recapsData.latestSection[division];
  const recentMatches: RecentMatchRecap[] = recapsData.recentSections[division] || [];
  const pastSections = recapsData.pastSections[division] || [];

  const toggleBout = (boutKey: string) => {
    setOpenBouts((prev) => ({
      ...prev,
      [boutKey]: !prev[boutKey],
    }));
  };

  return (
    <div>
      {/* ディビジョン切り替えタブ */}
      <div className="div-tabs">
        <button
          type="button"
          onClick={() => setDivision("s")}
          className={`div-tab ${division === "s" ? "active-s" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division S
            </div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                marginTop: "0.15rem",
              }}
            >
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
            直近: 第{recapsData.latestSection.s}節
          </span>
        </button>

        <button
          type="button"
          onClick={() => setDivision("f")}
          className={`div-tab ${division === "f" ? "active-f" : ""}`}
        >
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              Division F
            </div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                marginTop: "0.15rem",
              }}
            >
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
            直近: 第{recapsData.latestSection.f}節
          </span>
        </button>
      </div>

      {/* 直近節ヘッダーバナー */}
      <div
        className="panel"
        style={{
          borderLeft: `5px solid ${division === "s" ? "#ea580c" : "#0284c7"}`,
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "0.2rem 0.6rem",
                borderRadius: "4px",
                fontSize: "0.75rem",
                fontWeight: 800,
                background: division === "s" ? "#ffedd5" : "#e0f2fe",
                color: division === "s" ? "#c2410c" : "#0369a1",
                marginBottom: "0.4rem",
              }}
            >
              LATEST MATCH RECAP
            </div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0 }}>
              Division {division.toUpperCase()} 第{latestSecNum}節
              試合結果・戦況詳細レポート
            </h2>
            <p
              style={{
                fontSize: "0.86rem",
                color: "var(--text-muted)",
                marginTop: "0.25rem",
                marginBottom: 0,
              }}
            >
              公式アーカイブ動画・ラウンド詳細ログに基づく試合展開と名場面ハイライト
            </p>
          </div>

          {recentMatches[0]?.youtubeUrl && (
            <a
              href={recentMatches[0].youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontWeight: 700,
                borderColor: "#dc2626",
                color: "#dc2626",
              }}
            >
              <span>▶</span>
              <span>第{latestSecNum}節 公式YouTube全編を見る</span>
            </a>
          )}
        </div>
      </div>

      {/* 直近節の各マッチ詳細 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {recentMatches.map((m) => {
          const homeMeta = TEAM_META_MAP[m.home];
          const awayMeta = TEAM_META_MAP[m.away];
          const homeName = homeMeta?.name || m.home;
          const awayName = awayMeta?.name || m.away;
          const homeShort = homeMeta?.shortName || m.home;
          const awayShort = awayMeta?.shortName || m.away;

          return (
            <div
              key={m.matchId}
              className="panel"
              style={{ padding: "1.5rem" }}
            >
              {/* マッチタイトルバー */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  paddingBottom: "0.85rem",
                  borderBottom: "1px solid var(--border-color)",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  第{m.matchNumber}試合 ({m.scheduledAt.slice(0, 10)})
                </div>
                <span
                  className="badge"
                  style={{
                    background: m.isTiebreaker ? "#fef3c7" : "var(--success-bg)",
                    color: m.isTiebreaker ? "#d97706" : "var(--success)",
                    fontWeight: 700,
                  }}
                >
                  {m.isTiebreaker ? "延長戦決着" : "試合終了"}
                </span>
              </div>

              {/* スコアボード */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.75rem 0 1.25rem 0",
                }}
              >
                {/* AWAY */}
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span className="badge badge-away">AWAY</span>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1.25rem",
                      marginTop: "0.3rem",
                      color: "var(--text-main)",
                    }}
                  >
                    <a
                      href={`/team/${m.away}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {awayName}
                    </a>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {awayShort}
                  </div>
                </div>

                {/* スコア */}
                <div style={{ textAlign: "center", minWidth: "120px" }}>
                  <div style={{ fontSize: "2.1rem", fontWeight: 900, letterSpacing: "-0.5px" }}>
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
                    <span style={{ margin: "0 0.5rem", color: "var(--text-muted)", fontWeight: 400 }}>
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
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    ポイント
                  </span>
                </div>

                {/* HOME */}
                <div style={{ flex: 1, textAlign: "right" }}>
                  <span className="badge badge-home">HOME</span>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1.25rem",
                      marginTop: "0.3rem",
                      color: "var(--text-main)",
                    }}
                  >
                    <a
                      href={`/team/${m.home}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {homeName}
                    </a>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {homeShort}
                  </div>
                </div>
              </div>

              {/* マッチ総括ボックス */}
              <div
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "1rem 1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    marginBottom: "0.4rem",
                  }}
                >
                  <strong style={{ fontSize: "1.02rem", color: "var(--text-main)" }}>
                    📝 {m.matchHeadline}
                  </strong>

                  {m.matchHighlight && (
                    <a
                      href={m.matchHighlight.videoUrlWithTime}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="score-chip"
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        borderColor: "#fca5a5",
                        fontWeight: 700,
                        fontSize: "0.76rem",
                        padding: "0.25rem 0.6rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <span>▶</span>
                      <span>決定打シーンを見る ({m.matchHighlight.timestampLabel})</span>
                    </a>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "0.88rem",
                    lineHeight: 1.6,
                    color: "var(--text-sub)",
                    margin: 0,
                  }}
                >
                  {m.matchSummary}
                </p>
              </div>

              {/* 各Boutの詳細展開 */}
              <div>
                <h4
                  style={{
                    fontSize: "0.94rem",
                    fontWeight: 800,
                    marginBottom: "0.75rem",
                    color: "var(--text-main)",
                  }}
                >
                  ⚔️ 各Boutの試合展開・ラウンド状況
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {m.bouts.map((b) => {
                    const boutKey = `${m.matchId}-${b.status}`;
                    const isOpen = openBouts[boutKey] ?? true; // 既定で展開
                    const homePlayerName = PLAYER_NAME_MAP[b.homePlayer] || b.homePlayer;
                    const awayPlayerName = PLAYER_NAME_MAP[b.awayPlayer] || b.awayPlayer;
                    const homeCharaJp = formatCharName(b.homeChara);
                    const awayCharaJp = formatCharName(b.awayChara);

                    return (
                      <div
                        key={b.status}
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "#ffffff",
                        }}
                      >
                        {/* Boutヘッダー */}
                        <button
                          type="button"
                          onClick={() => toggleBout(boutKey)}
                          style={{
                            width: "100%",
                            padding: "0.75rem 1rem",
                            background: "var(--bg-subtle)",
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            textAlign: "left",
                            gap: "0.5rem",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span
                              style={{
                                fontWeight: 800,
                                fontSize: "0.82rem",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                background:
                                  b.status === 2
                                    ? "#7c3aed"
                                    : b.status === 3
                                      ? "#d97706"
                                      : "#475569",
                                color: "#ffffff",
                              }}
                            >
                              {b.statusName} ({b.status === 2 ? "20pt" : "10pt"})
                            </span>

                            {b.isFullSet && (
                              <span
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  fontWeight: 700,
                                  border: "1px solid #fecaca",
                                }}
                              >
                                フルセット死闘
                              </span>
                            )}
                          </div>

                          {/* 対戦カード & スコア */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <span
                              style={{
                                fontWeight: b.winner === "away" ? 800 : 500,
                                color: b.winner === "away" ? "var(--primary)" : "var(--text-sub)",
                                fontSize: "0.88rem",
                              }}
                            >
                              {awayPlayerName} ({awayCharaJp})
                            </span>

                            <span
                              style={{
                                fontWeight: 900,
                                fontSize: "1.05rem",
                                padding: "0 0.3rem",
                              }}
                            >
                              {b.awayBattle} - {b.homeBattle}
                            </span>

                            <span
                              style={{
                                fontWeight: b.winner === "home" ? 800 : 500,
                                color: b.winner === "home" ? "var(--success)" : "var(--text-sub)",
                                fontSize: "0.88rem",
                              }}
                            >
                              ({homeCharaJp}) {homePlayerName}
                            </span>

                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {isOpen ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {/* Bout展開詳細 (アコーディオン本体) */}
                        {isOpen && (
                          <div style={{ padding: "1rem", borderTop: "1px solid var(--border-color)" }}>
                            {/* ラウンド推移バッジ */}
                            {b.roundFlow && b.roundFlow.length > 0 && (
                              <div style={{ marginBottom: "0.85rem" }}>
                                <div
                                  style={{
                                    fontSize: "0.76rem",
                                    fontWeight: 700,
                                    color: "var(--text-muted)",
                                    marginBottom: "0.3rem",
                                  }}
                                >
                                  ラウンド取得推移
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                                  {b.roundFlow.map((flow, fi) => (
                                    <span
                                      key={fi}
                                      style={{
                                        fontSize: "0.76rem",
                                        padding: "0.2rem 0.55rem",
                                        borderRadius: "4px",
                                        background: "var(--bg-subtle)",
                                        border: "1px solid var(--border-color)",
                                        color: "var(--text-sub)",
                                        fontFamily: "monospace",
                                      }}
                                    >
                                      {flow}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 映像解析詳細解説 */}
                            <div
                              style={{
                                background: "#f8fafc",
                                borderRadius: "6px",
                                padding: "0.85rem",
                                fontSize: "0.84rem",
                                lineHeight: 1.6,
                                color: "var(--text-main)",
                              }}
                            >
                              <div style={{ marginBottom: "0.45rem" }}>
                                <strong>🎯 立ち回り・ゲージ管理: </strong>
                                <span style={{ color: "var(--text-sub)" }}>
                                  {b.visualAnalysis.tacticalFocus}
                                </span>
                              </div>

                              <div style={{ marginBottom: "0.45rem" }}>
                                <strong>⚡ 勝負の分かれ目: </strong>
                                <span style={{ color: "var(--text-sub)" }}>
                                  {b.visualAnalysis.turningPoint}
                                </span>
                              </div>

                              <div>
                                <strong>💥 決着シーン: </strong>
                                <span style={{ color: "var(--text-sub)" }}>
                                  {b.visualAnalysis.lethalMove}
                                </span>
                              </div>
                            </div>

                            {/* タイムスタンプ動画ボタン */}
                            {b.highlight && (
                              <div
                                style={{
                                  marginTop: "0.75rem",
                                  display: "flex",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <a
                                  href={b.highlight.videoUrlWithTime}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-outline"
                                  style={{
                                    fontSize: "0.78rem",
                                    padding: "0.35rem 0.75rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    borderColor: "#dc2626",
                                    color: "#dc2626",
                                    fontWeight: 700,
                                  }}
                                >
                                  <span>▶</span>
                                  <span>このBoutの決着シーンを見る ({b.highlight.timestampLabel})</span>
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 過去節公式アーカイブ一覧セクション */}
      <div style={{ marginTop: "3rem" }}>
        <div className="panel-header">
          <div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>
              📁 Division {division.toUpperCase()} 過去節 公式アーカイブ一覧
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              第1節から前節までの試合結果一覧と公式YouTube配信アーカイブ
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "1rem" }}>
          {pastSections.map((sec) => (
            <div
              key={sec.sectionNumber}
              className="panel"
              style={{
                padding: "1rem 1.25rem",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-main)" }}>
                  {sec.sectionTitle} ({sec.scheduledAt.slice(0, 10)})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginTop: "0.4rem",
                    fontSize: "0.84rem",
                    color: "var(--text-sub)",
                  }}
                >
                  {sec.matches.map((m, idx) => {
                    const homeMeta = TEAM_META_MAP[m.home];
                    const awayMeta = TEAM_META_MAP[m.away];
                    return (
                      <span key={idx} style={{ background: "var(--bg-subtle)", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                        <strong>{awayMeta?.shortName || m.away}</strong> {m.awayPoint} - {m.homePoint} <strong>{homeMeta?.shortName || m.home}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {sec.playlistUrl && (
                  <a
                    href={sec.playlistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                  >
                    再生リスト
                  </a>
                )}
                <a
                  href={sec.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.4rem 0.85rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <span>▶</span>
                  <span>YouTubeで見る</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
