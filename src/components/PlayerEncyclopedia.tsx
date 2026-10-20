import React, { useEffect, useMemo, useState } from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { TEAM_META_MAP } from "@/lib/simulator";
import { PlayerCard } from "./player-encyclopedia/PlayerCard";
import { PlayerDetailView } from "./player-encyclopedia/PlayerDetailView";
import { PlayerFilterBar, type SortKey } from "./player-encyclopedia/PlayerFilterBar";

interface Props {
  players: PlayerEncyclopediaEntry[];
}

export default function PlayerEncyclopedia({ players }: Props) {
  const [divFilter, setDivFilter] = useState<"all" | "s" | "f">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [vsCharFilter, setVsCharFilter] = useState<string>("none");
  const [sortBy, setSortBy] = useState<SortKey>("point");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(
    null
  );

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

  // 全キャラクター選択肢
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
  }, [
    players,
    divFilter,
    teamFilter,
    vsCharFilter,
    sortBy,
    searchQuery,
  ]);

  const selectedPlayer = useMemo(
    () =>
      selectedPlayerKey
        ? players.find((p) => p.playerKey === selectedPlayerKey) ?? null
        : null,
    [players, selectedPlayerKey]
  );

  if (selectedPlayer) {
    return (
      <PlayerDetailView
        selectedPlayer={selectedPlayer}
        players={players}
        onSelectPlayer={handleSelectPlayer}
        onBackToList={handleBackToList}
      />
    );
  }

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

      <PlayerFilterBar
        divFilter={divFilter}
        setDivFilter={setDivFilter}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
        vsCharFilter={vsCharFilter}
        setVsCharFilter={setVsCharFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        allCharacters={allCharacters}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(275px, 1fr))",
          gap: "0.9rem",
        }}
      >
        {filteredPlayers.map((p) => (
          <PlayerCard
            key={p.playerKey}
            player={p}
            vsCharFilter={vsCharFilter}
            onSelect={handleSelectPlayer}
          />
        ))}
      </div>
    </div>
  );
}
