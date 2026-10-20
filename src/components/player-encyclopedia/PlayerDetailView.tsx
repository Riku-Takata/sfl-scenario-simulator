import React from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";
import { PlayerDetailBoutLogs } from "./PlayerDetailBoutLogs";
import { PlayerDetailHeader } from "./PlayerDetailHeader";
import { PlayerDetailStats } from "./PlayerDetailStats";
import { PlayerDetailPlayStyle } from "./PlayerDetailPlayStyle";
import { PlayerDetailRanked } from "./PlayerDetailRanked";
import { PlayerDetailCommentary } from "./PlayerDetailCommentary";
import { PlayerDetailMatchData } from "./PlayerDetailMatchData";
import { PlayerDetailTournamentProfile } from "./PlayerDetailTournamentProfile";
// import { VsCharCard } from "./VsCharCard";
// import { VsCharDetailModal } from "./VsCharDetailModal";

interface PlayerDetailViewProps {
  selectedPlayer: PlayerEncyclopediaEntry;
  players: PlayerEncyclopediaEntry[];
  onSelectPlayer: (playerKey: string) => void;
  onBackToList: () => void;
}

export function PlayerDetailView({
  selectedPlayer,
  players,
  onSelectPlayer,
  onBackToList,
}: PlayerDetailViewProps) {
  /*
  // 対キャラクター相性セクション非表示化に伴いコメントアウト
  const [showAllVsChars, setShowAllVsChars] = useState<boolean>(false);
  const [selectedMatchupModal, setSelectedMatchupModal] =
    useState<VsCharDetail | null>(null);

  const strongestList = selectedPlayer.strongestMatchups;
  const closestList = selectedPlayer.closestMatchups;
  const fullCharList = selectedPlayer.vsCharacters;
  */

  return (
    <div>
      {/* 選手基本情報ヘッダー・ナビゲーション・SNS・総合評価 */}
      <PlayerDetailHeader
        selectedPlayer={selectedPlayer}
        players={players}
        onSelectPlayer={onSelectPlayer}
        onBackToList={onBackToList}
      />

      {/* 選択された選手の詳細カルテパネル */}
      <div
        id="player-detail-panel"
        className="panel"
        style={{
          borderTop: `5px solid ${selectedPlayer.teamColor}`,
        }}
      >
        {/* 6角形パラメーター ＆ ポジション別起用実績 */}
        <PlayerDetailStats selectedPlayer={selectedPlayer} />

        {/* 追加データに基づく選手特徴の解説 */}
        <PlayerDetailCommentary name={selectedPlayer.name} commentary={selectedPlayer.commentary} />

        {/* SFL公式の試合内プレイ統計から見た傾向 */}
        <PlayerDetailPlayStyle playStyle={selectedPlayer.playStyle} />

        {/* Buckler (ランクマ) のキャラ別成績・活動量・行動傾向 */}
        <PlayerDetailRanked ranked={selectedPlayer.rankedProfile} />

        {/* start.gg 直近1年のプレミア大会プロファイル */}
        <PlayerDetailTournamentProfile
          profile={selectedPlayer.tournamentProfile}
          players={players}
          onSelectPlayer={onSelectPlayer}
        />

        {/* 取得した対戦データの明細 (start.gg セット・ランクマ直近戦) */}
        <PlayerDetailMatchData
          playerKey={selectedPlayer.playerKey}
          ranked={selectedPlayer.rankedProfile}
          players={players}
          onSelectPlayer={onSelectPlayer}
        />

        {/* 
          【非表示化】対キャラクター相性セクション
          ※SFL 2026今期の実戦出場対戦ログと情報量が同一で重複するためコメントアウト
        {/*
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          ... (対キャラクター相性セクション)
        </div>
        */}

        {/* SFL 2026 実戦出場ログ */}
        <PlayerDetailBoutLogs
          boutLogs={selectedPlayer.boutLogs}
          onSelectPlayer={onSelectPlayer}
        />

        {/* 下部戻るボタン */}
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
            onClick={onBackToList}
            className="btn btn-primary"
          >
            ← 選手選択一覧に戻る（全48選手）
          </button>
        </div>
      </div>

      {/* 
      <VsCharDetailModal
        isOpen={selectedMatchupModal !== null}
        onClose={() => setSelectedMatchupModal(null)}
        matchup={selectedMatchupModal}
        matchupMode="sfl2026"
        playerName={selectedPlayer.name}
      />
      */}
    </div>
  );
}
