import React, { useEffect, useMemo, useState } from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { CHAR_NAME_JP_MAP } from "@/lib/player-encyclopedia";
import { TEAM_META_MAP } from "@/lib/simulator";

interface Props {
  players: PlayerEncyclopediaEntry[];
}

type SortKey = "point" | "overall" | "winRate" | "battleWinRate" | "vsChar";

function RadarChartSvg({
  params,
  color,
}: {
  params: PlayerEncyclopediaEntry["parameters"];
  color: string;
}) {
  const size = 250;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 84;

  const axes = [
    { label: "ポイント獲得", value: params.pointEfficiency },
    { label: "大将・勝負強さ", value: params.clutchPower },
    { label: "HOME制圧力", value: params.homeControl },
    { label: "AWAY突破力", value: params.awayResilience },
    { label: "ラウンド支配", value: params.roundDominance },
    { label: "対応キャラ幅", value: params.matchupCoverage },
  ];

  const getPoint = (index: number, val: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const gridLevels = [25, 50, 75, 100];
  const dataPoints = axes.map((a, i) => getPoint(i, a.value));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
      role="img"
      aria-label="選手パラメーター6角形レーダーチャート"
    >
      {/* 背景グリッド */}
      {gridLevels.map((lvl) => {
        const pts = axes
          .map((_, i) => {
            const p = getPoint(i, lvl);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={pts}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={lvl === 100 ? 1.5 : 1}
            strokeDasharray={lvl === 50 ? "3 2" : undefined}
          />
        );
      })}

      {/* 軸線 */}
      {axes.map((_, i) => {
        const end = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        );
      })}

      {/* データポリゴン */}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2.5}
      />

      {/* 頂点ドット & ラベル */}
      {axes.map((a, i) => {
        const pt = dataPoints[i];
        const labelPt = getPoint(i, 122);
        return (
          <g key={a.label}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10.5"
              fontWeight="700"
              fill="#334155"
            >
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PlayerEncyclopedia({ players }: Props) {
  const [divFilter, setDivFilter] = useState<"all" | "s" | "f">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [vsCharFilter, setVsCharFilter] = useState<string>("none");
  const [sortBy, setSortBy] = useState<SortKey>("point");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // 初期状態は null（まずは選手を選択する画面を表示）
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(
    null
  );
  const [showAllVsChars, setShowAllVsChars] = useState<boolean>(false);

  // URLクエリ (?player=xxx) からの初期選択 ＆ ブラウザ戻るボタン対応
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const qPlayer = params.get("player");
      const qTeam = params.get("team");
      if (qPlayer && players.some((p) => p.playerKey === qPlayer)) {
        setSelectedPlayerKey(qPlayer);
      } else {
        setSelectedPlayerKey(null);
      }
      if (qTeam && Object.hasOwn(TEAM_META_MAP, qTeam)) {
        setTeamFilter(qTeam);
      }
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [players]);

  const handleSelectPlayer = (pKey: string) => {
    setSelectedPlayerKey(pKey);
    setShowAllVsChars(false);
    if (typeof window !== "undefined") {
      const nextUrl = `${window.location.pathname}?player=${pKey}`;
      window.history.pushState({ player: pKey }, "", nextUrl);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBackToList = () => {
    setSelectedPlayerKey(null);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // 全28キャラクター選択肢
  const allCharacters = useMemo(() => {
    const first = players[0];
    if (!first) return [];
    return [...first.vsCharacters].sort((a, b) =>
      a.charName.localeCompare(b.charName, "ja")
    );
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = players.filter((p) => {
      if (divFilter !== "all" && p.division !== divFilter) return false;
      if (teamFilter !== "all" && p.teamKey !== teamFilter) return false;
      if (q) {
        const matchName =
          p.name.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.teamShort.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.mainCharName.toLowerCase().includes(q) ||
          p.subCharNames.some((sc) => sc.toLowerCase().includes(q));
        if (!matchName) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (vsCharFilter !== "none") {
        const charA = a.vsCharacters.find((c) => c.charKey === vsCharFilter);
        const charB = b.vsCharacters.find((c) => c.charKey === vsCharFilter);
        const rateA = charA?.sflBattleWinRate ?? -1;
        const rateB = charB?.sflBattleWinRate ?? -1;
        if (rateB !== rateA) return rateB - rateA;
        const wonA = charA?.sflBattlesWon ?? 0;
        const wonB = charB?.sflBattlesWon ?? 0;
        if (wonB !== wonA) return wonB - wonA;
      }
      if (sortBy === "overall") {
        return (
          b.parameters.overallScore - a.parameters.overallScore ||
          b.sfl.point - a.sfl.point
        );
      }
      if (sortBy === "winRate") {
        return b.sfl.winRate - a.sfl.winRate || b.sfl.point - a.sfl.point;
      }
      if (sortBy === "battleWinRate") {
        return (
          b.sfl.battleWinRate - a.sfl.battleWinRate ||
          b.sfl.point - a.sfl.point
        );
      }
      return (
        b.sfl.point - a.sfl.point ||
        b.parameters.overallScore - a.parameters.overallScore
      );
    });

    return list;
  }, [players, divFilter, teamFilter, vsCharFilter, sortBy, searchQuery]);

  const selectedPlayer = useMemo(
    () =>
      selectedPlayerKey
        ? players.find((p) => p.playerKey === selectedPlayerKey) ?? null
        : null,
    [players, selectedPlayerKey]
  );

  // ============================================================================
  // 選手未選択時：選手一覧・検索画面を表示
  // ============================================================================
  if (!selectedPlayer) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              分析・相性データを見たい選手を選択してください（全48選手）
            </h2>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginTop: "0.2rem",
              }}
            >
              ディビジョン・所属チーム・名前検索、または「特定のキャラに強い選手順」で絞り込んで選手をクリックすると、詳細な6角形パラメーターと対キャラ相性カルテを表示します。
            </p>
          </div>
        </div>

        {/* フィルターバー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            padding: "0.9rem 1rem",
            background: "var(--bg-subtle)",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            marginBottom: "1rem",
          }}
        >
          {/* Division 切替 */}
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {[
              { id: "all", label: "全選手 (48名)" },
              { id: "s", label: "Division S (24名)" },
              { id: "f", label: "Division F (24名)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDivFilter(tab.id as "all" | "s" | "f");
                  setTeamFilter("all");
                }}
                className="score-chip"
                style={
                  divFilter === tab.id
                    ? {
                        background: "var(--text-main)",
                        color: "#ffffff",
                        borderColor: "var(--text-main)",
                      }
                    : {}
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* チーム絞り込み */}
          <select
            aria-label="チームで絞り込み"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontWeight: 700,
              fontSize: "0.84rem",
            }}
          >
            <option value="all">すべてのチーム (12チーム)</option>
            {Object.values(TEAM_META_MAP)
              .filter((t) => divFilter === "all" || t.division === divFilter)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.shortName}（{t.name}）
                </option>
              ))}
          </select>

          {/* 対キャラ逆引きソート */}
          <select
            aria-label="特定キャラに対して強い選手を逆引き"
            value={vsCharFilter}
            onChange={(e) => {
              setVsCharFilter(e.target.value);
              if (e.target.value !== "none") setSortBy("vsChar");
            }}
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "8px",
              border: "1px solid var(--primary)",
              background: "#ffffff",
              color: "var(--primary)",
              fontWeight: 800,
              fontSize: "0.84rem",
            }}
          >
            <option value="none">対キャラ相性で逆引き（指定なし）</option>
            {allCharacters.map((c) => (
              <option key={c.charKey} value={c.charKey}>
                「vs {c.charName}」に強い選手順で並べる
              </option>
            ))}
          </select>

          {/* 並び順 */}
          <select
            aria-label="並び順"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontWeight: 700,
              fontSize: "0.84rem",
            }}
          >
            <option value="point">SFL獲得ポイント順</option>
            <option value="overall">総合データ評価順</option>
            <option value="winRate">SFL試合勝率順</option>
            <option value="battleWinRate">バトル勝率順</option>
          </select>

          {/* フリーワード検索 */}
          <input
            type="search"
            placeholder="選手名・キャラ名・チーム名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontSize: "0.85rem",
              minWidth: "190px",
              flex: 1,
            }}
          />
        </div>

        {/* チームクイックフィルターチップ */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.35rem",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            onClick={() => setTeamFilter("all")}
            className="score-chip"
            style={
              teamFilter === "all"
                ? {
                    background: "var(--primary)",
                    color: "#ffffff",
                    borderColor: "var(--primary)",
                  }
                : {}
            }
          >
            全チーム表示
          </button>
          {Object.values(TEAM_META_MAP)
            .filter((t) => divFilter === "all" || t.division === divFilter)
            .map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  setTeamFilter((prev) => (prev === t.key ? "all" : t.key))
                }
                className="score-chip"
                style={
                  teamFilter === t.key
                    ? {
                        background: t.color,
                        color: "#ffffff",
                        borderColor: t.color,
                      }
                    : {}
                }
              >
                {t.shortName}
              </button>
            ))}
        </div>

        {/* 選手カードグリッド */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(275px, 1fr))",
            gap: "0.9rem",
          }}
        >
          {filteredPlayers.map((p) => {
            const vsTarget =
              vsCharFilter !== "none"
                ? p.vsCharacters.find((c) => c.charKey === vsCharFilter)
                : null;

            return (
              <div
                key={p.playerKey}
                onClick={() => handleSelectPlayer(p.playerKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectPlayer(p.playerKey);
                  }
                }}
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderLeft: `5px solid ${p.teamColor}`,
                  borderRadius: "10px",
                  padding: "1.05rem",
                  cursor: "pointer",
                  transition: "box-shadow 0.15s, border-color 0.15s",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.4rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        color: "var(--text-muted)",
                      }}
                    >
                      Div.{p.division.toUpperCase()} / {p.teamShort}
                    </span>
                    <div
                      style={{
                        fontSize: "1.15rem",
                        fontWeight: 800,
                        color: "var(--text-main)",
                      }}
                    >
                      {p.name}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: "var(--primary-light)",
                      color: "var(--primary)",
                      fontWeight: 800,
                    }}
                  >
                    評価 {p.parameters.overallGrade} ({p.parameters.overallScore})
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-sub)",
                    marginBottom: "0.55rem",
                  }}
                >
                  メイン: <strong>{p.mainCharName}</strong>
                  {p.subCharNames.length > 0 &&
                    ` / サブ: ${p.subCharNames.slice(0, 2).join("・")}`}
                </div>

                {vsTarget && (
                  <div
                    style={{
                      background: vsTarget.playedInSfl
                        ? (vsTarget.sflBattleWinRate ?? 0) >= 50
                          ? "var(--success-bg)"
                          : "var(--warning-bg)"
                        : "var(--bg-subtle)",
                      border: `1px solid ${
                        vsTarget.playedInSfl
                          ? (vsTarget.sflBattleWinRate ?? 0) >= 50
                            ? "var(--success-border)"
                            : "var(--warning-border)"
                          : "var(--border-color)"
                      }`,
                      color: vsTarget.playedInSfl
                        ? (vsTarget.sflBattleWinRate ?? 0) >= 50
                          ? "var(--success)"
                          : "var(--warning)"
                        : "var(--text-muted)",
                      borderRadius: "6px",
                      padding: "0.35rem 0.6rem",
                      fontSize: "0.82rem",
                      fontWeight: 800,
                      marginBottom: "0.55rem",
                    }}
                  >
                    {vsTarget.playedInSfl ? (
                      <>
                        vs {vsTarget.charName} SFLバトル勝率:{" "}
                        {vsTarget.sflBattleWinRate?.toFixed(1)}%（
                        {vsTarget.sflBattlesWon}勝{vsTarget.sflBattlesLost}敗）
                      </>
                    ) : (
                      <>vs {vsTarget.charName} 今期SFL未対戦</>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.4rem",
                    background: "var(--bg-subtle)",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    fontSize: "0.78rem",
                    marginBottom: "0.6rem",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>獲得pt</div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        color: "var(--primary)",
                      }}
                    >
                      {p.sfl.point}pt
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>SFL勝敗</div>
                    <div style={{ fontWeight: 800 }}>
                      {p.sfl.victory}勝{p.sfl.losses}敗
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>バトル勝率</div>
                    <div style={{ fontWeight: 800 }}>
                      {p.sfl.battleWinRate.toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* SNS・配信チャンネル導線（カード上からもワンクリックで遷移可能） */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginBottom: "0.55rem",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {p.snsLinks.x && (
                    <a
                      href={p.snsLinks.x}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${p.name}選手のX (旧Twitter)`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.18rem 0.48rem",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: "#0f172a",
                        color: "#ffffff",
                        textDecoration: "none",
                      }}
                    >
                      <span>𝕏</span>
                      <span>X</span>
                    </a>
                  )}
                  {p.snsLinks.youtube && (
                    <a
                      href={p.snsLinks.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${p.name}選手のYouTubeチャンネル`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.18rem 0.48rem",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#dc2626",
                        textDecoration: "none",
                      }}
                    >
                      <span>▶</span>
                      <span>YouTube</span>
                    </a>
                  )}
                  {p.snsLinks.twitch && (
                    <a
                      href={p.snsLinks.twitch}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${p.name}選手のTwitch配信チャンネル`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.18rem 0.48rem",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: "#f5f3ff",
                        border: "1px solid #ddd6fe",
                        color: "#7c3aed",
                        textDecoration: "none",
                      }}
                    >
                      <span>📺</span>
                      <span>Twitch</span>
                    </a>
                  )}
                  {p.snsLinks.instagram && (
                    <a
                      href={p.snsLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${p.name}選手のInstagram`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.18rem 0.48rem",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: "#fdf2f8",
                        border: "1px solid #fbcfe8",
                        color: "#db2777",
                        textDecoration: "none",
                      }}
                    >
                      <span>Instagram</span>
                    </a>
                  )}
                </div>

                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "0.35rem",
                    borderTop: "1px solid var(--border-color)",
                  }}
                >
                  <span>
                    得意:{" "}
                    {p.strongestMatchups.length > 0
                      ? p.strongestMatchups
                          .slice(0, 2)
                          .map((m) => m.charName)
                          .join("・")
                      : "今期未対戦"}
                  </span>
                  <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                    この選手を詳しく見る →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 選手選択時：選択された選手の詳細分析カルテ画面を表示
  // ============================================================================
  const paramList = [
    {
      label: "ポイント獲得力",
      value: selectedPlayer.parameters.pointEfficiency,
      desc: `1出場平均 ${selectedPlayer.sfl.avgPointPerEntry}pt / 合計 ${selectedPlayer.sfl.point}pt`,
    },
    {
      label: "大将・勝負強さ",
      value: selectedPlayer.parameters.clutchPower,
      desc: `大将戦 ${selectedPlayer.positions.anchor.entries}戦${selectedPlayer.positions.anchor.wins}勝 / 延長 ${selectedPlayer.positions.tiebreaker.entries}戦${selectedPlayer.positions.tiebreaker.wins}勝`,
    },
    {
      label: "HOME後出し制圧力",
      value: selectedPlayer.parameters.homeControl,
      desc: `HOME推定勝率 ${selectedPlayer.sfl.homeWinRate.toFixed(1)}%（実戦 ${selectedPlayer.sfl.homeEntries}戦${selectedPlayer.sfl.homeWins}勝）`,
    },
    {
      label: "AWAY先出し突破力",
      value: selectedPlayer.parameters.awayResilience,
      desc: `AWAY推定勝率 ${selectedPlayer.sfl.awayWinRate.toFixed(1)}%（実戦 ${selectedPlayer.sfl.awayEntries}戦${selectedPlayer.sfl.awayWins}勝）`,
    },
    {
      label: "ラウンド支配力",
      value: selectedPlayer.parameters.roundDominance,
      desc: `バトル勝率 ${selectedPlayer.sfl.battleWinRate.toFixed(1)}% / ラウンド取得率 ${selectedPlayer.sfl.roundWinRate.toFixed(1)}%`,
    },
    {
      label: "対応キャラ幅",
      value: selectedPlayer.parameters.matchupCoverage,
      desc: `今期SFL対戦済み ${selectedPlayer.vsCharacters.filter((c) => c.playedInSfl).length}キャラ中 ${selectedPlayer.vsCharacters.filter((c) => c.playedInSfl && (c.sflBattleWinRate ?? 0) >= 50).length}キャラ相手に勝率50%以上`,
    },
  ];

  const xHandle = selectedPlayer.snsLinks.x
    ? `@${selectedPlayer.snsLinks.x.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").split(/[/?#]/)[0]}`
    : null;

  return (
    <div>
      {/* 上部ナビゲーション：「← 選手選択一覧に戻る」＆「別の選手へのクイック切替」 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "1.15rem",
          padding: "0.85rem 1.15rem",
          background: "#ffffff",
          border: "1px solid var(--border-color)",
          borderRadius: "10px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <button
          type="button"
          onClick={handleBackToList}
          className="btn btn-primary"
        >
          ← 選手選択一覧に戻る（全48選手）
        </button>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            別の選手へ直接切替:
          </span>
          <select
            aria-label="別の選手を選択"
            value={selectedPlayer.playerKey}
            onChange={(e) => handleSelectPlayer(e.target.value)}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-strong)",
              background: "#ffffff",
              fontWeight: 800,
              fontSize: "0.86rem",
              color: "var(--text-main)",
            }}
          >
            {Object.values(TEAM_META_MAP).map((tm) => (
              <optgroup
                key={tm.key}
                label={`[Div.${tm.division.toUpperCase()}] ${tm.shortName} (${tm.name})`}
              >
                {players
                  .filter((p) => p.teamKey === tm.key)
                  .map((p) => (
                    <option key={p.playerKey} value={p.playerKey}>
                      {p.name}（{p.mainCharName} / {p.sfl.point}pt）
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* 選択された選手の詳細カルテパネル */}
      <div
        id="player-detail-panel"
        className="panel"
        style={{
          borderTop: `5px solid ${selectedPlayer.teamColor}`,
        }}
      >
        {/* 選手ヘッダー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "1.1rem",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.4rem",
              }}
            >
              <span
                className="badge"
                style={{
                  background: selectedPlayer.teamColor,
                  color: "#ffffff",
                  fontWeight: 800,
                }}
              >
                Division {selectedPlayer.division.toUpperCase()} /{" "}
                {selectedPlayer.teamShort}
              </span>
              <a
                href={`/team/${selectedPlayer.teamKey}`}
                style={{
                  fontSize: "0.84rem",
                  fontWeight: 700,
                  color: "var(--primary)",
                }}
              >
                {selectedPlayer.teamName} のチーム突破条件を見る →
              </a>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "0.75rem",
              }}
            >
              <h2 style={{ fontSize: "1.65rem", fontWeight: 800 }}>
                {selectedPlayer.name}
              </h2>
              <span
                style={{
                  fontSize: "0.95rem",
                  color: "var(--text-muted)",
                  fontWeight: 700,
                }}
              >
                ({selectedPlayer.nameEn})
              </span>
              <span
                className="badge"
                style={{
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                  fontSize: "0.85rem",
                }}
              >
                メイン: {selectedPlayer.mainCharName}
              </span>
              {selectedPlayer.subCharNames.length > 0 && (
                <span
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-sub)",
                    fontWeight: 600,
                  }}
                >
                  サブ: {selectedPlayer.subCharNames.join(" / ")}
                </span>
              )}
            </div>

            {/* 客観データ特徴バッジ */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem",
                marginTop: "0.65rem",
              }}
            >
              {selectedPlayer.featureTags.map((tag) => (
                <span
                  key={tag}
                  className="badge"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-main)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* 選手公式SNS・配信チャンネル・公式プロフィール導線 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "0.85rem",
                paddingTop: "0.75rem",
                borderTop: "1px dashed var(--border-color)",
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  marginRight: "0.15rem",
                }}
              >
                選手SNS・配信をフォローして応援:
              </span>
              {selectedPlayer.snsLinks.x && (
                <a
                  href={selectedPlayer.snsLinks.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    background: "#0f172a",
                    color: "#ffffff",
                    textDecoration: "none",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <span>𝕏</span>
                  <span>{xHandle ? `X (${xHandle})` : "X (旧Twitter)"}</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
                </a>
              )}
              {selectedPlayer.snsLinks.youtube && (
                <a
                  href={selectedPlayer.snsLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    textDecoration: "none",
                  }}
                >
                  <span>▶</span>
                  <span>YouTube チャンネル</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
                </a>
              )}
              {selectedPlayer.snsLinks.twitch && (
                <a
                  href={selectedPlayer.snsLinks.twitch}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    background: "#f5f3ff",
                    border: "1px solid #ddd6fe",
                    color: "#7c3aed",
                    textDecoration: "none",
                  }}
                >
                  <span>📺</span>
                  <span>Twitch 配信</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
                </a>
              )}
              {selectedPlayer.snsLinks.instagram && (
                <a
                  href={selectedPlayer.snsLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    background: "#fdf2f8",
                    border: "1px solid #fbcfe8",
                    color: "#db2777",
                    textDecoration: "none",
                  }}
                >
                  <span>Instagram</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
                </a>
              )}
              <a
                href={selectedPlayer.snsLinks.sflOfficial}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-sub)",
                  textDecoration: "none",
                }}
              >
                <span>SFL公式選手ページ</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
              </a>
            </div>
          </div>

          {/* 総合データ評価ボックス */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "0.75rem 1.15rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                }}
              >
                総合データ評価
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "var(--primary)",
                  lineHeight: 1.1,
                }}
              >
                {selectedPlayer.parameters.overallGrade}{" "}
                <span
                  style={{
                    fontSize: "1rem",
                    color: "var(--text-sub)",
                    fontWeight: 700,
                  }}
                >
                  ({selectedPlayer.parameters.overallScore}/100)
                </span>
              </div>
            </div>
            <div
              style={{
                borderLeft: "1px solid var(--border-color)",
                paddingLeft: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                }}
              >
                SFL 2026 成績
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                {selectedPlayer.sfl.victory}勝{selectedPlayer.sfl.losses}敗（
                <span style={{ color: "var(--primary)" }}>
                  {selectedPlayer.sfl.point}pt
                </span>
                ）
              </div>
            </div>
          </div>
        </div>

        {/* 同チーム選手クイック切替バー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.4rem",
            marginBottom: "1.25rem",
          }}
        >
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            同チーム（{selectedPlayer.teamShort}）の選手:
          </span>
          {players
            .filter((p) => p.teamKey === selectedPlayer.teamKey)
            .map((tm) => (
              <button
                key={tm.playerKey}
                type="button"
                onClick={() => handleSelectPlayer(tm.playerKey)}
                className="score-chip"
                style={
                  tm.playerKey === selectedPlayer.playerKey
                    ? {
                        background: "var(--text-main)",
                        color: "#ffffff",
                        borderColor: "var(--text-main)",
                      }
                    : {}
                }
              >
                {tm.name}（{tm.mainCharName} / {tm.sfl.point}pt）
              </button>
            ))}
        </div>

        {/* 2カラム：左＝6角形パラメーター / 右＝客観データ分析レポート＆ポジション別成績 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* 左：6角形レーダーチャート ＆ 指標バー */}
          <div
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "1.1rem",
              minWidth: 0,
            }}
          >
            <h3
              style={{
                fontSize: "0.98rem",
                fontWeight: 800,
                marginBottom: "0.5rem",
              }}
            >
              戦績ベース・6角形パラメーター
            </h3>
            <RadarChartSvg
              params={selectedPlayer.parameters}
              color={selectedPlayer.teamColor}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
                marginTop: "0.5rem",
              }}
            >
              {paramList.map((pm) => (
                <div key={pm.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                    }}
                  >
                    <span>{pm.label}</span>
                    <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                      {pm.value} / 100
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "7px",
                      background: "#e2e8f0",
                      borderRadius: "999px",
                      overflow: "hidden",
                      margin: "0.2rem 0",
                    }}
                  >
                    <div
                      style={{
                        width: `${pm.value}%`,
                        height: "100%",
                        background:
                          pm.value >= 75
                            ? "var(--success)"
                            : pm.value >= 60
                              ? "var(--primary)"
                              : "var(--warning)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {pm.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右：データから見る選手の特徴 ＆ ポジション別起用実績 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1.1rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.98rem",
                  fontWeight: 800,
                  marginBottom: "0.65rem",
                }}
              >
                公式戦績データから見る「{selectedPlayer.name}」の特徴
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                  color: "var(--text-sub)",
                }}
              >
                {selectedPlayer.objectiveSummary.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "0.65rem 0.85rem",
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* ポジション別出場・勝敗テーブル */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1.1rem",
                minWidth: 0,
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  marginBottom: "0.65rem",
                }}
              >
                SFL 2026 ポジション別起用・獲得ポイント内訳
              </h3>
              <div
                className="table-scroll"
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  overflowX: "auto",
                }}
              >
                <table
                  className="standings-table"
                  style={{
                    minWidth: "100%",
                    width: "100%",
                    background: "#ffffff",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: "0.6rem 0.75rem" }}>ポジション</th>
                      <th
                        style={{
                          padding: "0.6rem 0.65rem",
                          textAlign: "center",
                        }}
                      >
                        配点
                      </th>
                      <th
                        style={{
                          padding: "0.6rem 0.65rem",
                          textAlign: "center",
                        }}
                      >
                        出場数
                      </th>
                      <th
                        style={{
                          padding: "0.6rem 0.65rem",
                          textAlign: "center",
                        }}
                      >
                        勝敗
                      </th>
                      <th
                        style={{
                          padding: "0.6rem 0.65rem",
                          textAlign: "right",
                        }}
                      >
                        勝率
                      </th>
                      <th
                        style={{
                          padding: "0.6rem 0.75rem",
                          textAlign: "right",
                        }}
                      >
                        獲得pt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        name: "先鋒戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.vanguard,
                      },
                      {
                        name: "中堅戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.middle,
                      },
                      {
                        name: "大将戦",
                        pt: "20pt",
                        rec: selectedPlayer.positions.anchor,
                      },
                      {
                        name: "延長戦",
                        pt: "10pt",
                        rec: selectedPlayer.positions.tiebreaker,
                      },
                    ].map((row, idx, arr) => (
                      <tr key={row.name}>
                        <td
                          style={{
                            padding: "0.65rem 0.75rem",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.name}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            color: "var(--text-muted)",
                            fontSize: "0.82rem",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.pt}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.entries}戦
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            fontWeight: 700,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.wins}勝{row.rec.losses}敗
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.65rem",
                            textAlign: "right",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.entries > 0 ? `${row.rec.winRate}%` : "-"}
                        </td>
                        <td
                          style={{
                            padding: "0.65rem 0.75rem",
                            fontWeight: 800,
                            color: "var(--primary)",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            borderBottom:
                              idx === arr.length - 1
                                ? "none"
                                : "1px solid var(--border-color)",
                          }}
                        >
                          {row.rec.points}pt
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* 対キャラクター相性セクション：「このキャラに対してはこれくらい強い！」 */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                対キャラクター相性データ（SFL 2026 今シーズンの実戦戦績のみ）
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                今シーズン（SFL 2026）公式戦の実戦対戦ログのみから算出した相手キャラクター別のバトル勝率および対戦組み合わせ内訳です。各カードから計算根拠となった対戦カードを参照できます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAllVsChars((prev) => !prev)}
              className="btn"
            >
              {showAllVsChars
                ? "全28キャラ一覧を閉じる"
                : "全28キャラクターとの対戦戦績一覧を表示する"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* 得意キャラ（今期勝ち越し） */}
            <div
              style={{
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--success)",
                  fontSize: "0.92rem",
                  marginBottom: "0.6rem",
                }}
              >
                ◎ 得意・勝ち越している相手キャラクター
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {selectedPlayer.strongestMatchups.length > 0 ? (
                  selectedPlayer.strongestMatchups.map((m, idx) => (
                    <div
                      key={m.charKey}
                      style={{
                        background: "#ffffff",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        fontSize: "0.86rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <strong style={{ fontSize: "0.95rem" }}>
                          {idx + 1}. vs {m.charName}
                        </strong>
                        <span
                          style={{
                            fontWeight: 800,
                            color: "var(--success)",
                            fontSize: "1rem",
                          }}
                        >
                          勝率 {m.sflBattleWinRate?.toFixed(1)}%
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.4rem",
                          fontSize: "0.78rem",
                          color: "var(--text-sub)",
                          marginBottom: "0.45rem",
                        }}
                      >
                        <span>
                          SFLバトル: <strong>{m.sflBattlesWon}勝{m.sflBattlesLost}敗</strong>（計{m.sflBattlesTotal}戦）
                        </span>
                        <span>/</span>
                        <span>
                          試合: <strong>{m.sflBoutsWon}勝{m.sflBoutsLost}敗</strong>
                        </span>
                        <span>/</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          HOME {m.homeBattlesWon}勝{m.homeBattlesLost}敗・AWAY {m.awayBattlesWon}勝{m.awayBattlesLost}敗
                        </span>
                      </div>

                      {/* 計算根拠となった対戦組み合わせ一覧 */}
                      <div
                        style={{
                          borderTop: "1px dashed var(--border-color)",
                          paddingTop: "0.4rem",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          計算根拠となった対戦組み合わせ:
                        </div>
                        {m.matchups.map((bout, bIdx) => (
                          <div
                            key={bIdx}
                            style={{
                              fontSize: "0.78rem",
                              background: "var(--bg-subtle)",
                              padding: "0.35rem 0.55rem",
                              borderRadius: "6px",
                              marginBottom: "0.25rem",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 800 }}>
                                {bout.sectionTitle} {bout.statusName}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--text-muted)",
                                  marginLeft: "0.3rem",
                                }}
                              >
                                [{bout.side.toUpperCase()}]
                              </span>
                              <div
                                style={{
                                  color: "var(--text-sub)",
                                  fontSize: "0.76rem",
                                  marginTop: "0.1rem",
                                }}
                              >
                                {CHAR_NAME_JP_MAP[bout.myChar] || bout.myChar} vs{" "}
                                <strong>{bout.opponentPlayerName}</strong>（
                                {bout.opponentTeamShort}）
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: bout.won
                                    ? "var(--success)"
                                    : "var(--danger)",
                                }}
                              >
                                {bout.myBattle} - {bout.opponentBattle}{" "}
                                {bout.won ? "勝利" : "敗北"}
                              </span>
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                +{bout.myPoint}pt
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                    }}
                  >
                    今期SFL本戦での勝ち越し対戦データはまだありません
                  </div>
                )}
              </div>
            </div>

            {/* 苦戦・警戒が必要な相手キャラクター */}
            <div
              style={{
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--warning)",
                  fontSize: "0.92rem",
                  marginBottom: "0.6rem",
                }}
              >
                △ 苦戦・負け越している相手キャラクター
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                {selectedPlayer.closestMatchups.length > 0 ? (
                  selectedPlayer.closestMatchups.map((m, idx) => (
                    <div
                      key={m.charKey}
                      style={{
                        background: "#ffffff",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        fontSize: "0.86rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <strong style={{ fontSize: "0.95rem" }}>
                          {idx + 1}. vs {m.charName}
                        </strong>
                        <span
                          style={{
                            fontWeight: 800,
                            color: "var(--warning)",
                            fontSize: "1rem",
                          }}
                        >
                          勝率 {m.sflBattleWinRate?.toFixed(1)}%
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.4rem",
                          fontSize: "0.78rem",
                          color: "var(--text-sub)",
                          marginBottom: "0.45rem",
                        }}
                      >
                        <span>
                          SFLバトル: <strong>{m.sflBattlesWon}勝{m.sflBattlesLost}敗</strong>（計{m.sflBattlesTotal}戦）
                        </span>
                        <span>/</span>
                        <span>
                          試合: <strong>{m.sflBoutsWon}勝{m.sflBoutsLost}敗</strong>
                        </span>
                        <span>/</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          HOME {m.homeBattlesWon}勝{m.homeBattlesLost}敗・AWAY {m.awayBattlesWon}勝{m.awayBattlesLost}敗
                        </span>
                      </div>

                      {/* 計算根拠となった対戦組み合わせ一覧 */}
                      <div
                        style={{
                          borderTop: "1px dashed var(--border-color)",
                          paddingTop: "0.4rem",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          計算根拠となった対戦組み合わせ:
                        </div>
                        {m.matchups.map((bout, bIdx) => (
                          <div
                            key={bIdx}
                            style={{
                              fontSize: "0.78rem",
                              background: "var(--bg-subtle)",
                              padding: "0.35rem 0.55rem",
                              borderRadius: "6px",
                              marginBottom: "0.25rem",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 800 }}>
                                {bout.sectionTitle} {bout.statusName}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--text-muted)",
                                  marginLeft: "0.3rem",
                                }}
                              >
                                [{bout.side.toUpperCase()}]
                              </span>
                              <div
                                style={{
                                  color: "var(--text-sub)",
                                  fontSize: "0.76rem",
                                  marginTop: "0.1rem",
                                }}
                              >
                                {CHAR_NAME_JP_MAP[bout.myChar] || bout.myChar} vs{" "}
                                <strong>{bout.opponentPlayerName}</strong>（
                                {bout.opponentTeamShort}）
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: bout.won
                                    ? "var(--success)"
                                    : "var(--danger)",
                                }}
                              >
                                {bout.myBattle} - {bout.opponentBattle}{" "}
                                {bout.won ? "勝利" : "敗北"}
                              </span>
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                +{bout.myPoint}pt
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                    }}
                  >
                    今期SFL本戦での負け越し・苦戦対戦データはありません（好調）
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 全28キャラクター対戦戦績・組み合わせ一覧グリッド */}
          {showAllVsChars && (
            <div
              style={{
                marginTop: "1.25rem",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  marginBottom: "0.75rem",
                }}
              >
                全28キャラクター 今シーズンSFL対戦戦績・組み合わせ内訳
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {selectedPlayer.vsCharacters.map((vc) => (
                  <div
                    key={vc.charKey}
                    style={{
                      background: "#ffffff",
                      border: `1px solid ${
                        vc.playedInSfl
                          ? (vc.sflBattleWinRate ?? 0) >= 50
                            ? "var(--success-border)"
                            : "var(--warning-border)"
                          : "var(--border-color)"
                      }`,
                      borderRadius: "8px",
                      padding: "0.7rem 0.85rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontWeight: 800,
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span style={{ fontSize: "0.9rem" }}>
                        vs {vc.charName}
                      </span>
                      {vc.playedInSfl ? (
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              (vc.sflBattleWinRate ?? 0) >= 50
                                ? "var(--success)"
                                : "var(--danger)",
                            fontSize: "0.92rem",
                          }}
                        >
                          勝率 {vc.sflBattleWinRate?.toFixed(1)}%
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            background: "var(--bg-subtle)",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "4px",
                          }}
                        >
                          今期未対戦 (0戦)
                        </span>
                      )}
                    </div>

                    {vc.playedInSfl ? (
                      <>
                        <div
                          style={{
                            fontSize: "0.76rem",
                            color: "var(--text-sub)",
                            marginBottom: "0.45rem",
                          }}
                        >
                          バトル: {vc.sflBattlesWon}勝{vc.sflBattlesLost}敗 / 試合: {vc.sflBoutsWon}勝{vc.sflBoutsLost}敗
                        </div>

                        {/* 対戦組み合わせ一覧 */}
                        <div
                          style={{
                            borderTop: "1px dashed var(--border-color)",
                            paddingTop: "0.35rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              marginBottom: "0.2rem",
                            }}
                          >
                            対戦履歴（計算根拠）:
                          </div>
                          {vc.matchups.map((bout, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                fontSize: "0.74rem",
                                background: "var(--bg-subtle)",
                                padding: "0.25rem 0.45rem",
                                borderRadius: "4px",
                                marginBottom: "0.2rem",
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>
                                {bout.sectionTitle} vs {bout.opponentPlayerName}（{bout.opponentTeamShort}）
                              </span>
                              <strong
                                style={{
                                  color: bout.won
                                    ? "var(--success)"
                                    : "var(--danger)",
                                }}
                              >
                                {bout.myBattle}-{bout.opponentBattle}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          paddingTop: "0.2rem",
                        }}
                      >
                        今期SFL本戦での対戦はまだありません
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SFL 2026 実戦出場ログ */}
        {selectedPlayer.boutLogs.length > 0 && (
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
              SFL 2026 出場対戦ログ（全{selectedPlayer.boutLogs.length}試合）
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
                  {selectedPlayer.boutLogs.map((log, i) => (
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
                          onClick={() =>
                            handleSelectPlayer(log.opponentPlayerKey)
                          }
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
        )}

        {/* 下部にも「← 選手選択一覧に戻る」ボタンを配置 */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={handleBackToList}
            className="btn btn-primary"
          >
            ← 選手選択一覧に戻る（全48選手）
          </button>
        </div>
      </div>
    </div>
  );
}
