import React, { useEffect, useState } from "react";
import type { BucklerPlayerProfile, PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { formatCharName } from "@/lib/player-encyclopedia";
import type { PlayerMatchDetail } from "@/lib/player-encyclopedia/match-detail";

interface PlayerDetailMatchDataProps {
  playerKey: string;
  ranked: BucklerPlayerProfile | null;
  players: PlayerEncyclopediaEntry[];
  onSelectPlayer: (playerKey: string) => void;
}

type Tab = "premier" | "ranked";

const MODE_LABELS: Record<string, string> = {
  rank: "ランクマ",
  casual: "カジュアル",
  hub: "バトルハブ",
  custom: "ルーム",
};

function resultBadge(won: boolean | null) {
  const label = won == null ? "引分" : won ? "勝ち" : "負け";
  return (
    <span
      className="badge"
      style={{
        background: won ? "var(--success-bg)" : won === false ? "var(--danger-bg)" : undefined,
        color: won ? "var(--success)" : won === false ? "var(--danger)" : undefined,
      }}
    >
      {label}
    </span>
  );
}

function formatJst(unixSec: number): string {
  const d = new Date(unixSec * 1000 + 9 * 3600_000);
  return `${d.toISOString().slice(5, 10).replace("-", "/")} ${d.toISOString().slice(11, 16)}`;
}

function PremierSets({
  playerKey,
  players,
  onSelectPlayer,
}: Omit<PlayerDetailMatchDataProps, "ranked">) {
  const [detail, setDetail] = useState<PlayerMatchDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(false);
    fetch(`/data/players/${playerKey}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PlayerMatchDetail) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [playerKey]);

  if (error) return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>対戦データを読み込めませんでした。</p>;
  if (!detail) return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>読み込み中…</p>;
  if (detail.events.length === 0)
    return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>直近1年のプレミア大会のセット記録はありません。</p>;

  const nameOf = (key: string) => players.find((p) => p.playerKey === key)?.name ?? key;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {detail.events.map((ev, i) => {
        const won = ev.sets.filter((s) => s.won).length;
        return (
          <details key={ev.eventId} open={i === 0} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.88rem", fontWeight: 800 }}>
              {ev.date} {ev.tournamentName}
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                {" "}
                [{ev.category}] {ev.placement != null ? `${ev.placement}位` : "-"}
                {ev.numEntrants ? ` / ${ev.numEntrants}人` : ""} ・ セット{won}-{ev.sets.length - won}
              </span>
            </summary>
            <div className="table-scroll" style={{ marginTop: "0.5rem" }}>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>ラウンド</th>
                    <th>対戦相手</th>
                    <th>シード</th>
                    <th>スコア</th>
                    <th>結果</th>
                    <th>ゲーム詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.sets.map((s, j) => (
                    <tr key={`${ev.eventId}-${j}`}>
                      <td>
                        {s.roundText}
                        {s.phaseName ? <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.phaseName}</div> : null}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {s.oppSflKey ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(s.oppSflKey!)}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--primary)", fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
                          >
                            {nameOf(s.oppSflKey)}
                          </button>
                        ) : (
                          s.oppTag
                        )}
                      </td>
                      <td style={{ fontSize: "0.78rem" }}>
                        {s.mySeed ?? "-"} vs {s.oppSeed ?? "-"}
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        {s.myScore} - {s.oppScore}
                      </td>
                      <td>{resultBadge(s.won)}</td>
                      <td style={{ fontSize: "0.78rem" }}>
                        {s.games.length === 0
                          ? "-"
                          : s.games
                              .map((g) =>
                                `${g.won ? "○" : "●"}${g.myChar ? `${formatCharName(g.myChar)} vs ${formatCharName(g.oppChar ?? "")}` : ""}`
                              )
                              .join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function RankedMatches({ ranked }: { ranked: BucklerPlayerProfile }) {
  if (ranked.recentMatches.length === 0)
    return <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>まだ対戦ログがありません。</p>;
  return (
    <div className="table-scroll">
      <table className="standings-table">
        <thead>
          <tr>
            <th>日時(JST)</th>
            <th>モード</th>
            <th>使用キャラ</th>
            <th>相手キャラ</th>
            <th>MR（自分 / 相手）</th>
            <th>ラウンド</th>
            <th>結果</th>
          </tr>
        </thead>
        <tbody>
          {ranked.recentMatches.map((m, i) => (
            <tr key={`${m.t}-${i}`}>
              <td>{formatJst(m.t)}</td>
              <td>{MODE_LABELS[m.mode] ?? m.mode}</td>
              <td style={{ fontWeight: 700 }}>{formatCharName(m.myChar)}</td>
              <td>{formatCharName(m.oppChar)}</td>
              <td>
                {m.myMr && m.myMr > 0 ? m.myMr : "-"} / {m.oppMr && m.oppMr > 0 ? m.oppMr : "-"}
              </td>
              <td>
                {m.roundsWon}-{m.roundsLost}
              </td>
              <td>{resultBadge(m.won)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerDetailMatchData({ playerKey, ranked, players, onSelectPlayer }: PlayerDetailMatchDataProps) {
  const [tab, setTab] = useState<Tab>("premier");
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "premier", label: "プレミア大会のセット（start.gg）" },
    ...(ranked ? [{ id: "ranked" as Tab, label: `ランクマ直近${ranked.recentMatches.length}戦（Buckler）` }] : []),
  ];

  return (
    <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.1rem", marginBottom: "1.25rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: "0.65rem" }}>取得した対戦データの詳細</h3>
      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "btn btn-primary" : "btn"}
            style={{ fontSize: "0.8rem" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "premier" || !ranked ? (
        <PremierSets playerKey={playerKey} players={players} onSelectPlayer={onSelectPlayer} />
      ) : (
        <RankedMatches ranked={ranked} />
      )}
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
        ゲーム詳細のキャラは大会主催者が登録した場合のみ表示されます。ランクマの対戦相手の名前は表示していません。
      </p>
    </div>
  );
}
