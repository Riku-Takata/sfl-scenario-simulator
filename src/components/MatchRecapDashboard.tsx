import React, { useState } from "react";
import type {
  DivisionId,
  MatchRecapsData,
  RecentMatchRecap,
} from "@/lib/types";
import { TEAM_META_MAP } from "@/lib/simulator";
import MatchRecapCard from "@/components/recap/MatchRecapCard";

interface Props {
  recapsData: MatchRecapsData;
}

export default function MatchRecapDashboard({ recapsData }: Props) {
  const [division, setDivision] = useState<DivisionId>("s");
  const [openMatches, setOpenMatches] = useState<Record<string, boolean>>({});

  const latestSecNum = recapsData.latestSection[division];
  const recentMatches: RecentMatchRecap[] = recapsData.recentSections[division] || [];
  const pastSections = recapsData.pastSections[division] || [];

  const toggleMatch = (matchId: string) => {
    setOpenMatches((prev) => ({ ...prev, [matchId]: !prev[matchId] }));
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

      {/* 直近節の各マッチ（初期表示は閉じた一覧） */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {recentMatches.map((m) => (
          <MatchRecapCard
            key={m.matchId}
            match={m}
            isOpen={Boolean(openMatches[m.matchId])}
            onToggle={() => toggleMatch(m.matchId)}
          />
        ))}
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
