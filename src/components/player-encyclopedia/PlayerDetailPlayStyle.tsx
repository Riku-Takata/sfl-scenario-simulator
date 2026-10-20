import React from "react";
import type { PlayerPlayStyleProfile } from "@/lib/player-encyclopedia";
import { MIN_BATTLES_FOR_RANK } from "@/lib/sfl/play-style";

interface PlayerDetailPlayStyleProps {
  playStyle: PlayerPlayStyleProfile | null;
}

function formatValue(value: number | null, unit: "回" | "%"): string {
  if (value == null) return "-";
  return unit === "%" ? `${value}%` : `${value.toFixed(2)}回`;
}

export function PlayerDetailPlayStyle({ playStyle }: PlayerDetailPlayStyleProps) {
  if (!playStyle) return null;
  const ranked = playStyle.battles >= MIN_BATTLES_FOR_RANK;

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
        <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>
          試合内プレイ傾向（SFL公式stats）
        </h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          SFL {playStyle.season} {playStyle.asOfTitle}時点・{playStyle.battles}バトル
          {playStyle.previousSeason && playStyle.previousBattles != null
            ? ` / 昨季 ${playStyle.previousBattles}バトル`
            : ""}
        </span>
      </div>

      {!ranked ? (
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          今季の出場が{MIN_BATTLES_FOR_RANK}バトル未満のため、SFL選手内の順位と傾向タグは表示していません。
        </p>
      ) : (
        <>
          {playStyle.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
              {playStyle.tags.map((tag) => (
                <span
                  key={tag}
                  className="badge"
                  style={{ background: "var(--primary-bg)", color: "var(--primary)", fontWeight: 800 }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {playStyle.changes.length > 0 && (
            <ul
              style={{
                fontSize: "0.82rem",
                color: "var(--text-sub)",
                margin: "0 0 0.75rem 1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
              }}
            >
              {playStyle.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="table-scroll">
        <table className="standings-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>今季（1バトルあたり／率）</th>
              <th>SFL内順位</th>
              <th>昨季</th>
            </tr>
          </thead>
          <tbody>
            {playStyle.metrics.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{m.description}</div>
                </td>
                <td style={{ fontWeight: 800 }}>{formatValue(m.value, m.unit)}</td>
                <td>{m.rank != null ? `${m.rank}位 / ${m.cohortSize}人` : "-"}</td>
                <td style={{ color: "var(--text-muted)" }}>{formatValue(m.previousValue, m.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
        回数は公式のシーズン累積値を出場バトル数で割った値。順位は{MIN_BATTLES_FOR_RANK}バトル以上出場した選手の中での値の大きい順で、良し悪しではなくスタイルの違いを表します。
      </p>
    </div>
  );
}
