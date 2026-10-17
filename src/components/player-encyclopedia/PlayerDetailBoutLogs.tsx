import React from "react";
import type { PlayerBoutLog } from "@/lib/player-encyclopedia";
import { CHAR_NAME_JP_MAP } from "@/lib/player-encyclopedia";

interface PlayerDetailBoutLogsProps {
  boutLogs: PlayerBoutLog[];
  onSelectPlayer: (playerKey: string) => void;
}

export function PlayerDetailBoutLogs({
  boutLogs,
  onSelectPlayer,
}: PlayerDetailBoutLogsProps) {
  if (boutLogs.length === 0) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        paddingTop: "1.1rem",
      }}
    >
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 800,
          marginBottom: "0.65rem",
        }}
      >
        SFL 2026 出場対戦ログ（全{boutLogs.length}試合）
      </h3>
      <div className="table-scroll">
        <table className="standings-table">
          <thead>
            <tr>
              <th>節</th>
              <th>ポジション</th>
              <th>SIDE</th>
              <th>使用キャラ</th>
              <th>対戦相手</th>
              <th>相手キャラ</th>
              <th>バトルスコア</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {boutLogs.map((log, i) => (
              <tr key={`${log.matchId}-${log.status}-${i}`}>
                <td style={{ fontWeight: 700 }}>{log.sectionTitle}</td>
                <td style={{ fontWeight: 800 }}>{log.statusName}</td>
                <td>
                  <span
                    className={`badge ${
                      log.side === "home" ? "badge-home" : "badge-away"
                    }`}
                  >
                    {log.side.toUpperCase()}
                  </span>
                </td>
                <td>{CHAR_NAME_JP_MAP[log.myChar] || log.myChar}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(log.opponentPlayerKey)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--primary)",
                      fontWeight: 800,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    {log.opponentPlayerName}（{log.opponentTeamShort}）
                  </button>
                </td>
                <td>
                  {CHAR_NAME_JP_MAP[log.opponentChar] || log.opponentChar}
                </td>
                <td style={{ fontWeight: 800 }}>
                  {log.myBattle} - {log.opponentBattle}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: log.won
                        ? "var(--success-bg)"
                        : "var(--danger-bg)",
                      color: log.won ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {log.won ? `勝利 (+${log.myPoint}pt)` : "敗北"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
