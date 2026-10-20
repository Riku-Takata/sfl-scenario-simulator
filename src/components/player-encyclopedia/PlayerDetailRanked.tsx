import React from "react";
import type { BucklerPlayerProfile } from "@/lib/player-encyclopedia";
import { formatCharName } from "@/lib/player-encyclopedia";

interface PlayerDetailRankedProps {
  ranked: BucklerPlayerProfile | null;
}

const boxStyle: React.CSSProperties = {
  background: "var(--bg-subtle)",
  border: "1px solid var(--border-color)",
  borderRadius: "10px",
  padding: "0.9rem 1rem",
  minWidth: 0,
};

const MODE_LABELS: Record<string, string> = {
  rank: "ランクマ",
  casual: "カジュアル",
  hub: "バトルハブ",
  custom: "ルームマッチ",
};

const BATTLE_STAT_LABELS: Array<[string, string]> = [
  ["drive_parry", "ドライブパリィ"],
  ["just_parry", "ジャストパリィ"],
  ["drive_impact", "ドライブインパクト"],
  ["drive_reversal", "ドライブリバーサル"],
  ["throw_count", "投げ"],
  ["throw_tech", "投げ抜け"],
  ["punish_counter", "パニッシュカウンター"],
  ["corner_time", "画面端で攻めている時間"],
  ["cornered_time", "画面端に追い込まれている時間"],
];

function rate(w: number, n: number): string {
  return n > 0 ? `${((w / n) * 100).toFixed(1)}%` : "-";
}

function Window({ title, w }: { title: string; w: BucklerPlayerProfile["last7Days"] }) {
  return (
    <div style={boxStyle}>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
        {w.matches}戦 <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>（勝率 {rate(w.wins, w.matches)}）</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        プレイした日 {w.activeDays}日 /{" "}
        {Object.entries(w.byMode)
          .filter(([, n]) => n > 0)
          .map(([m, n]) => `${MODE_LABELS[m]} ${n}`)
          .join("・") || "対戦なし"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.4rem" }}>
        {w.byChar.slice(0, 4).map((c) => (
          <span key={c.char} className="badge">
            {formatCharName(c.char)} {c.n}戦
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlayerDetailRanked({ ranked }: PlayerDetailRankedProps) {
  if (!ranked) return null;

  const mrFirst = ranked.mrTrend[0];
  const mrLast = ranked.mrTrend.at(-1);
  const vs = ranked.mainVsChar.map((v) => ({ ...v, r: v.w / v.n }));
  const strong = [...vs].sort((a, b) => b.r - a.r).slice(0, 3);
  const weak = [...vs].sort((a, b) => a.r - b.r).slice(0, 3);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        paddingTop: "1.1rem",
        marginBottom: "1.25rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.65rem",
        }}
      >
        <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>ランクマ動向（Buckler's Boot Camp）</h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {ranked.asOf}時点
          {ranked.storedSince ? ` / 対戦ログは${ranked.storedSince}から蓄積（${ranked.storedMatches}戦）` : ""}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {(ranked.risingChars.length > 0 || mrFirst) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {ranked.risingChars.map((c) => (
              <span
                key={c.char}
                className="badge"
                style={{ background: "var(--warning-bg)", color: "var(--warning)", fontWeight: 800 }}
              >
                最近増えたキャラ: {formatCharName(c.char)}（直近14日 {c.recentShare}% / それ以前 {c.priorShare}%）
              </span>
            ))}
            {mrFirst && mrLast && ranked.mainChar && (
              <span
                className="badge"
                style={{ background: "var(--primary-bg)", color: "var(--primary)", fontWeight: 800 }}
              >
                {formatCharName(ranked.mainChar)} MR {mrFirst.mr} → {mrLast.mr}（
                {mrLast.mr - mrFirst.mr >= 0 ? "+" : ""}
                {mrLast.mr - mrFirst.mr}、{mrFirst.date}〜{mrLast.date}）
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.6rem",
          }}
        >
          <Window title="直近7日" w={ranked.last7Days} />
          <Window title="直近30日" w={ranked.last30Days} />
        </div>

        {ranked.characters.length > 0 && (
          <div className="table-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>キャラ</th>
                  <th>MR</th>
                  <th>LP</th>
                  <th>今季の対戦</th>
                  <th>勝率</th>
                </tr>
              </thead>
              <tbody>
                {ranked.characters.map((c) => (
                  <tr key={c.char}>
                    <td style={{ fontWeight: 700 }}>{formatCharName(c.char)}</td>
                    <td style={{ fontWeight: 800 }}>
                      {c.mr && c.mr > 0 ? c.mr : "-"}
                      {c.mrRanking && c.mrRanking > 0 ? (
                        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> （{c.mrRanking}位）</span>
                      ) : null}
                    </td>
                    <td>{c.lp != null && c.lp >= 0 ? c.lp.toLocaleString() : "-"}</td>
                    <td>{c.battles}戦</td>
                    <td>{rate(c.wins, c.battles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {vs.length > 0 && ranked.mainChar && (
          <div style={boxStyle}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, marginBottom: "0.4rem" }}>
              今季の{formatCharName(ranked.mainChar)}の対キャラ（15戦以上）
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-sub)" }}>
              得意: {strong.map((v) => `${formatCharName(v.char)} ${rate(v.w, v.n)}（${v.n}戦）`).join(" / ")}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-sub)" }}>
              苦手: {weak.map((v) => `${formatCharName(v.char)} ${rate(v.w, v.n)}（${v.n}戦）`).join(" / ")}
            </div>
          </div>
        )}

        {Object.keys(ranked.battleStats).length > 0 && (
          <div style={boxStyle}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, marginBottom: "0.4rem" }}>
              行動傾向（Buckler 表示値・今季）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "0.3rem 0.8rem",
                fontSize: "0.8rem",
              }}
            >
              {BATTLE_STAT_LABELS.filter(([k]) => ranked.battleStats[k] != null).map(([k, label]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 800 }}>{ranked.battleStats[k]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
