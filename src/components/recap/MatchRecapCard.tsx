import React from "react";
import type { BoutTagId, RecentBoutRecap, RecentMatchRecap, RoundFinish } from "@/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "@/lib/simulator";
import { formatCharName } from "@/lib/player-encyclopedia";

/**
 * 戦況レポートの試合カード（スポーツ中継風スコアボード）。
 * 閉じた状態: チームカラー・スコア・見出し。開いた状態: スコア推移・Boutごとのラウンド推移と解説。
 * ラウンド推移は公式ログ、決着方法・PERFECT・バーンアウト・タグは公式ログと照合済みの映像解析のみ。
 */

const TAG_META: Record<BoutTagId, { icon: string; label: string }> = {
  just_parry: { icon: "🛡️", label: "ジャストパリィ" },
  anti_air: { icon: "⤴️", label: "対空" },
  whiff_punish: { icon: "🎯", label: "差し返し" },
  drive_impact: { icon: "💥", label: "ドライブインパクト" },
  drive_rush: { icon: "⚡", label: "ドライブラッシュ" },
  corner: { icon: "🧱", label: "画面端の攻め" },
  throw: { icon: "✋", label: "投げ" },
  projectile: { icon: "🔵", label: "飛び道具" },
  punish_counter: { icon: "❗", label: "パニッシュカウンター" },
  reversal: { icon: "🔄", label: "無敵技の切り返し" },
};

const FINISH_LABEL: Partial<Record<RoundFinish, string>> = {
  SA1: "SA1",
  SA2: "SA2",
  SA3: "SA3",
  CA: "CA",
  DI: "DI",
  TIME: "TIME",
};

const BOUT_POINTS: Record<number, number> = { 0: 10, 1: 10, 2: 20, 3: 10 };

function teamColor(teamId: string): string {
  return TEAM_META_MAP[teamId]?.color || "#64748b";
}

function playerName(id: string): string {
  return PLAYER_NAME_MAP[id] || id;
}

interface Props {
  match: RecentMatchRecap;
  isOpen: boolean;
  onToggle: () => void;
}

export default function MatchRecapCard({ match: m, isOpen, onToggle }: Props) {
  const away = TEAM_META_MAP[m.away];
  const home = TEAM_META_MAP[m.home];
  const awayColor = teamColor(m.away);
  const homeColor = teamColor(m.home);

  return (
    <div
      className="panel"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "flex",
        borderColor: isOpen ? "var(--border-strong)" : undefined,
      }}
    >
      <div style={{ width: "6px", flexShrink: 0, background: awayColor }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* スコアボード（クリックで開閉） */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          style={{
            width: "100%",
            background: "none",
            border: "none",
            padding: "0.9rem 1.1rem",
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
            font: "inherit",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.74rem",
              color: "var(--text-muted)",
              fontWeight: 700,
              marginBottom: "0.35rem",
            }}
          >
            <span>
              第{m.matchNumber}試合 · {m.scheduledAt.slice(0, 10)}
            </span>
            <span>{isOpen ? "閉じる ▲" : "詳しく見る ▼"}</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <TeamLabel label="AWAY" name={away?.name || m.away} short={away?.shortName || m.away} isWinner={m.winner === "away"} align="left" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                <span style={{ color: m.winner === "away" ? "var(--text-main)" : "var(--text-muted)" }}>
                  {m.awayPoint}
                </span>
                <span style={{ margin: "0 0.45rem", color: "var(--text-muted)", fontWeight: 400 }}>-</span>
                <span style={{ color: m.winner === "home" ? "var(--text-main)" : "var(--text-muted)" }}>
                  {m.homePoint}
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "1.5px",
                  color: m.isTiebreaker ? "var(--warning)" : "var(--text-muted)",
                }}
              >
                FINAL{m.isTiebreaker ? " · 延長" : ""}
              </div>
            </div>
            <TeamLabel label="HOME" name={home?.name || m.home} short={home?.shortName || m.home} isWinner={m.winner === "home"} align="right" />
          </div>

          <div style={{ marginTop: "0.55rem", fontSize: "0.92rem", fontWeight: 700, color: "var(--text-main)" }}>
            {m.matchHeadline}
          </div>
          {m.narrationStatus === "pending" && (
            <div style={{ marginTop: "0.35rem" }}>
              <InProgressNotice>詳細な解説記事を作成中です</InProgressNotice>
            </div>
          )}
          {m.narrationStatus === "unavailable" && (
            <div style={{ marginTop: "0.35rem" }}>
              <InProgressNotice>公式記録を掲載中 · 詳細解説は確認待ちです</InProgressNotice>
            </div>
          )}

          {/* スコア推移は閉じた状態でも表示し、試合展開をひと目で分かるようにする */}
          <div style={{ marginTop: "0.65rem" }}>
            <ScoreProgression match={m} awayColor={awayColor} homeColor={homeColor} />
          </div>
        </button>

        {isOpen && (
          <div style={{ padding: "0 1.1rem 1.1rem" }}>
            <p style={{ fontSize: "0.86rem", lineHeight: 1.7, color: "var(--text-sub)", margin: "0 0 0.9rem" }}>
              {m.matchSummary}
            </p>
            {m.narrationStatus === "pending" && (
              <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "var(--text-muted)", margin: "-0.5rem 0 0.9rem" }}>
                配信映像の解析と詳細な解説記事を作成中です。現在は公式記録に基づく速報を表示しています。
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "0.9rem 0 0.2rem" }}>
              {m.matchVideoUrl && (
                <a
                  href={m.matchVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{
                    fontSize: "0.78rem",
                    padding: "0.25rem 0.65rem",
                    borderColor: "#dc2626",
                    color: "#dc2626",
                    fontWeight: 700,
                  }}
                >
                  ▶ 第{m.matchNumber}試合を見る{m.matchStartLabel ? ` (${m.matchStartLabel}〜)` : ""}
                </a>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.6rem" }}>
              {m.bouts.map((b) => (
                <BoutBlock key={b.status} bout={b} match={m} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ width: "6px", flexShrink: 0, background: homeColor }} />
    </div>
  );
}

function TeamLabel({
  label,
  name,
  short,
  isWinner,
  align,
}: {
  label: string;
  name: string;
  short: string;
  isWinner: boolean;
  align: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <span className={`badge ${label === "AWAY" ? "badge-away" : "badge-home"}`}>{label}</span>
      <div
        style={{
          fontWeight: 800,
          fontSize: "1.02rem",
          marginTop: "0.25rem",
          color: isWinner ? "var(--text-main)" : "var(--text-sub)",
          overflowWrap: "break-word",
        }}
      >
        {isWinner && <span style={{ color: "var(--warning)" }}>🏆 </span>}
        <span className="recap-team-full">{name}</span>
        <span className="recap-team-short">{short}</span>
      </div>
    </div>
  );
}

function ScoreProgression({
  match: m,
  awayColor,
  homeColor,
}: {
  match: RecentMatchRecap;
  awayColor: string;
  homeColor: string;
}) {
  let awayTotal = 0;
  let homeTotal = 0;
  const steps = m.bouts.map((b) => {
    const pts = BOUT_POINTS[b.status] ?? 10;
    if (b.winner === "away") awayTotal += pts;
    else homeTotal += pts;
    return {
      label: b.statusName.replace("戦", ""),
      away: awayTotal,
      home: homeTotal,
      winner: b.winner,
      winnerName: playerName(b.winner === "away" ? b.awayPlayer : b.homePlayer),
    };
  });

  return (
    <div>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem" }}>
        スコア推移（AWAY - HOME）
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          gap: "0.4rem",
        }}
      >
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-subtle)",
              borderRadius: "6px",
              padding: "0.35rem 0.5rem",
              borderBottom: `3px solid ${s.winner === "away" ? awayColor : homeColor}`,
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontWeight: i === steps.length - 1 ? 800 : 600, fontSize: "0.9rem" }}>
              {s.away} - {s.home}
            </div>
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-sub)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.winnerName}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoutBlock({ bout: b, match: m }: { bout: RecentBoutRecap; match: RecentMatchRecap }) {
  const awayName = playerName(b.awayPlayer);
  const homeName = playerName(b.homePlayer);
  const nameOf = (side: "home" | "away") => (side === "away" ? awayName : homeName);
  const colorOf = (side: "home" | "away") => teamColor(side === "away" ? m.away : m.home);
  const bestOf = b.status === 2 ? 5 : 3;
  const games = b.games ?? [];

  return (
    <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", background: "var(--bg-card)" }}>
      {/* 対戦カード */}
      <div style={{ background: "var(--bg-subtle)", padding: "0.6rem 0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: "0.74rem",
              padding: "0.12rem 0.45rem",
              borderRadius: "4px",
              background: b.status === 2 ? "#7c3aed" : b.status === 3 ? "#d97706" : "#475569",
              color: "#ffffff",
            }}
          >
            {b.statusName} BO{bestOf}
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{BOUT_POINTS[b.status] ?? 10}pt</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <PlayerLabel name={awayName} chara={formatCharName(b.awayChara)} isWinner={b.winner === "away"} align="left" />
          <div style={{ fontSize: "1.35rem", fontWeight: 900, fontFamily: "monospace" }}>
            {b.awayBattle} - {b.homeBattle}
          </div>
          <PlayerLabel name={homeName} chara={formatCharName(b.homeChara)} isWinner={b.winner === "home"} align="right" />
        </div>
      </div>

      <div style={{ padding: "0.7rem 0.85rem" }}>
        {/* ゲームごとのラウンド推移 */}
        {games.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "0.65rem" }}>
            {games.map((g, gi) => {
              const color = colorOf(g.winner);
              const comeback = g.rounds.length === 3 && g.rounds[0].winner !== g.winner;
              return (
                <div
                  key={gi}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
                >
                  <span style={{ width: "3.2rem", color: "var(--text-muted)", fontSize: "0.74rem" }}>Game {gi + 1}</span>
                  <span style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}>
                    {g.rounds.map((r, ri) => {
                      const won = r.winner === g.winner;
                      const finish = r.finish ? FINISH_LABEL[r.finish] : undefined;
                      return (
                        <span key={ri} style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
                          <span
                            title={`R${ri + 1}: ${nameOf(r.winner)}`}
                            style={{
                              width: "11px",
                              height: "11px",
                              borderRadius: "50%",
                              boxSizing: "border-box",
                              background: won ? color : "transparent",
                              border: `2px solid ${color}`,
                              display: "inline-block",
                            }}
                          />
                          {r.perfect && <FinishChip text="★PERFECT" strong />}
                          {finish && <FinishChip text={finish} />}
                        </span>
                      );
                    })}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-main)", marginLeft: "0.2rem" }}>{nameOf(g.winner)}</span>
                  {comeback && <span style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>↺ 逆転</span>}
                  {g.awayChara && g.awayChara !== b.awayChara && (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                      {awayName}: {formatCharName(g.awayChara)}
                    </span>
                  )}
                  {g.homeChara && g.homeChara !== b.homeChara && (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                      {homeName}: {formatCharName(g.homeChara)}
                    </span>
                  )}
                  {g.burnout?.map((s) => (
                    <span
                      key={s}
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.05rem 0.4rem",
                        borderRadius: "999px",
                        background: "var(--danger-bg)",
                        color: "var(--danger)",
                      }}
                    >
                      🔥 {nameOf(s)} バーンアウト
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* 映像から確認できた攻防タグ */}
        {b.tags && b.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.65rem" }}>
            {b.tags.map((t) => (
              <span
                key={`${t.id}-${t.side}`}
                style={{
                  fontSize: "0.72rem",
                  padding: "0.12rem 0.55rem",
                  borderRadius: "999px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-subtle)",
                  color: "var(--text-sub)",
                }}
              >
                {TAG_META[t.id].icon} {TAG_META[t.id].label}
                <span style={{ color: "var(--text-muted)" }}> · {nameOf(t.side)}</span>
              </span>
            ))}
          </div>
        )}

        {/* 解説 */}
        {b.videoStatus === "pending" && (
          <div style={{ marginBottom: "0.35rem" }}>
            <InProgressNotice>映像解析中（決着方法・見どころは作成中）</InProgressNotice>
          </div>
        )}
        <p style={{ fontSize: "0.86rem", lineHeight: 1.7, color: "var(--text-main)", margin: 0 }}>{b.analysis.summary}</p>
        {b.analysis.keyPoints.length > 0 && (
          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", fontSize: "0.84rem", lineHeight: 1.7, color: "var(--text-sub)" }}>
            {b.analysis.keyPoints.map((k, i) => (
              <li key={i} style={{ marginBottom: "0.15rem" }}>
                {k}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlayerLabel({
  name,
  chara,
  isWinner,
  align,
}: {
  name: string;
  chara: string;
  isWinner: boolean;
  align: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div style={{ fontWeight: isWinner ? 800 : 600, color: isWinner ? "var(--text-main)" : "var(--text-muted)", fontSize: "0.92rem" }}>
        {isWinner && align === "left" && "▶ "}
        {name}
        {isWinner && align === "right" && " ◀"}
      </div>
      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{chara}</div>
    </div>
  );
}

/** 映像解析・解説文がまだできていない部分の「作成中」表示 (スコアは公式記録から常に表示) */
function InProgressNotice({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.72rem",
        fontWeight: 800,
        padding: "0.1rem 0.5rem",
        borderRadius: "999px",
        border: "1px dashed var(--warning-border)",
        background: "var(--warning-bg)",
        color: "var(--warning)",
      }}
    >
      <span aria-hidden="true">⏳</span>
      {children}
    </span>
  );
}

function FinishChip({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <span
      style={{
        fontSize: "0.64rem",
        fontWeight: 800,
        fontFamily: "monospace",
        padding: "0 0.25rem",
        borderRadius: "3px",
        border: `1px solid ${strong ? "var(--warning-border)" : "var(--border-strong)"}`,
        background: strong ? "var(--warning-bg)" : "transparent",
        color: strong ? "var(--warning)" : "var(--text-sub)",
      }}
    >
      {text}
    </span>
  );
}
