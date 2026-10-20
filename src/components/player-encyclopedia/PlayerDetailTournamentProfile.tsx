import React from "react";
import type {
  PlayerTournamentProfile,
  PlayerEncyclopediaEntry,
} from "@/lib/player-encyclopedia";
import { CHAR_NAME_JP_MAP } from "@/lib/player-encyclopedia";
import type { WinLossRecord } from "@/lib/startgg/profile";

interface PlayerDetailTournamentProfileProps {
  profile: PlayerTournamentProfile | null;
  players: PlayerEncyclopediaEntry[];
  onSelectPlayer: (playerKey: string) => void;
}

const boxStyle: React.CSSProperties = {
  background: "var(--bg-subtle)",
  border: "1px solid var(--border-color)",
  borderRadius: "10px",
  padding: "1.1rem",
  minWidth: 0,
};

function wl(r: WinLossRecord): string {
  return r.total > 0 ? `${r.won}勝${r.lost}敗` : "記録なし";
}

function rateText(r: WinLossRecord): string {
  return r.rate != null ? `${r.rate.toFixed(1)}%` : "-";
}

function StatTile({ label, record, note }: { label: string; record: WinLossRecord; note?: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "0.6rem 0.75rem",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-main)" }}>
        {rateText(record)}
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {wl(record)}
        {note ? ` / ${note}` : ""}
      </div>
    </div>
  );
}

export function PlayerDetailTournamentProfile({
  profile,
  players,
  onSelectPlayer,
}: PlayerDetailTournamentProfileProps) {
  if (!profile) return null;

  const nameOf = (key: string) => players.find((p) => p.playerKey === key)?.name ?? key;
  const h2hList = Object.values(profile.h2h).sort(
    (a, b) => b.won + b.lost - (a.won + a.lost) || b.won - a.won
  );
  const startggUrl = profile.userSlug ? `https://www.start.gg/${profile.userSlug}` : null;

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
          プレミア大会プロファイル（直近1年・start.gg）
        </h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          集計期間 {profile.windowStart}〜 / 更新 {profile.updatedAt.slice(0, 10)}
          {startggUrl && (
            <>
              {" / "}
              <a href={startggUrl} target="_blank" rel="noopener noreferrer">
                start.gg: {profile.gamerTag}
              </a>
            </>
          )}
        </span>
      </div>

      {profile.eventsCount === 0 ? (
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>{profile.summary[0]}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {profile.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {profile.tags.map((tag) => (
                <span
                  key={tag}
                  className="badge"
                  style={{
                    background: "var(--primary-bg)",
                    color: "var(--primary)",
                    fontWeight: 800,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div style={boxStyle}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
                fontSize: "0.88rem",
                color: "var(--text-sub)",
              }}
            >
              {profile.summary.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "0.6rem",
            }}
          >
            <StatTile label="セット勝率" record={profile.sets} />
            <StatTile label="ゲーム勝率" record={profile.games} />
            <StatTile label="最終ゲームまでもつれたセット" record={profile.decidingGame} />
            <StatTile label="第1ゲームを落としたセット" record={profile.comeback} note="逆転勝ち" />
            <StatTile label="ルーザーズ側" record={profile.losersBracket} />
            <StatTile label="格上シード相手" record={profile.vsHigherSeed} />
            <StatTile label="SFL選手相手" record={profile.vsSflPlayers} />
            <StatTile label="直近90日" record={profile.recent90Days} />
            <StatTile label="オフライン大会" record={profile.offline} />
            <StatTile label="オンライン大会" record={profile.online} />
          </div>

          <div style={boxStyle}>
            <h4 style={{ fontSize: "0.92rem", fontWeight: 800, marginBottom: "0.5rem" }}>
              大会別成績（{profile.eventsCount}大会）
            </h4>
            <div className="table-scroll">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>開催日</th>
                    <th>大会</th>
                    <th>区分</th>
                    <th>順位</th>
                    <th>シード</th>
                    <th>セット</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.results.map((r) => (
                    <tr key={r.eventId}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 700 }}>
                        {r.tournamentName}
                        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                          {r.isOnline ? "（オンライン）" : r.countryCode ? `（${r.countryCode}）` : ""}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{r.category}</span>
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        {r.placement != null ? `${r.placement}位` : "-"}
                        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                          {r.numEntrants ? ` / ${r.numEntrants}人` : ""}
                        </span>
                      </td>
                      <td>{r.seed ?? "-"}</td>
                      <td>
                        {r.setsWon}-{r.setsLost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {h2hList.length > 0 && (
            <div style={boxStyle}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                プレミア大会でのSFL選手との対戦（セット単位）
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                {h2hList.map((h) => (
                  <button
                    key={h.opponentKey}
                    type="button"
                    onClick={() => onSelectPlayer(h.opponentKey)}
                    className="badge"
                    style={{
                      border: "1px solid var(--border-color)",
                      cursor: "pointer",
                      background:
                        h.won > h.lost
                          ? "var(--success-bg)"
                          : h.won < h.lost
                            ? "var(--danger-bg)"
                            : "#ffffff",
                      color:
                        h.won > h.lost
                          ? "var(--success)"
                          : h.won < h.lost
                            ? "var(--danger)"
                            : "var(--text-sub)",
                      fontWeight: 800,
                    }}
                  >
                    {nameOf(h.opponentKey)} {h.won}-{h.lost}
                  </button>
                ))}
              </div>
            </div>
          )}

          {profile.characters.used.length > 0 && (
            <div style={boxStyle}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 800, marginBottom: "0.35rem" }}>
                登録された使用キャラクター
              </h4>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                主催者がキャラを記録したゲームのみ（{profile.characters.reportedGames} / {profile.games.total}ゲーム）
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                {profile.characters.used.map((c) => (
                  <span key={c.charKey} className="badge">
                    {CHAR_NAME_JP_MAP[c.charKey] || c.charKey} {c.games}ゲーム（{c.won}勝）
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
