import type {
  CptMatchupsTop96Data,
  MatchesData,
  PlayerStatsData,
  Sf6TournamentMatchupsData,
} from "../types";
import rawSf6Tournaments from "../../data/sf6-tournament-matchups.json";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../simulator";
import { ALL_SF6_CHARS, formatCharName } from "./constants";
import {
  calcPlayerParameters,
  generateFeatureTags,
  generateObjectiveSummary,
} from "./parameters";
import { PLAYER_SNS_MAP } from "./sns-data";
import type {
  PlayerBoutLog,
  PlayerEncyclopediaEntry,
  PlayerSnsLinks,
  PositionRecord,
  VsCharDetail,
} from "./types";

function emptyPos(): PositionRecord {
  return { entries: 0, wins: 0, losses: 0, points: 0, winRate: 0 };
}

export function buildPlayerEncyclopedia(
  playerStatsData: PlayerStatsData,
  matchesData: MatchesData,
  _cptMatchupsData?: CptMatchupsTop96Data,
  sf6TournamentData?: Sf6TournamentMatchupsData
): PlayerEncyclopediaEntry[] {
  const sf6Tournaments: Sf6TournamentMatchupsData =
    sf6TournamentData ||
    (rawSf6Tournaments as unknown as Sf6TournamentMatchupsData);
  const entries: PlayerEncyclopediaEntry[] = [];

  for (const [pKey, stat] of Object.entries(playerStatsData.players)) {
    const teamMeta = TEAM_META_MAP[stat.teamKey];
    if (!teamMeta) continue;

    const positions = {
      vanguard: emptyPos(),
      middle: emptyPos(),
      anchor: emptyPos(),
      tiebreaker: emptyPos(),
    };

    const boutLogs: PlayerBoutLog[] = [];
    const sflVsCharBouts: Record<
      string,
      { bWon: number; bLost: number; mWon: number; mLost: number }
    > = {};
    const charBattleTally: Record<string, { w: number; l: number }> = {};

    let homeEntries = 0;
    let homeWins = 0;
    let awayEntries = 0;
    let awayWins = 0;

    // 消化済み試合の bouts からポジション別・対戦ログを厳密集計
    for (const m of matchesData.matches) {
      if (!m.played || !m.bouts) continue;
      for (const b of m.bouts) {
        const isHome = b.homePlayer === pKey;
        const isAway = b.awayPlayer === pKey;
        if (!isHome && !isAway) continue;

        const side: "home" | "away" = isHome ? "home" : "away";
        const myChar = (isHome ? b.homeChara : b.awayChara) || stat.mainChar;
        const oppPlayerKey = isHome ? b.awayPlayer : b.homePlayer;
        const oppChar = (isHome ? b.awayChara : b.homeChara) || "";
        const oppTeamMeta =
          Object.values(TEAM_META_MAP).find((t) =>
            t.players.includes(oppPlayerKey)
          ) || TEAM_META_MAP[isHome ? m.away : m.home];
        const oppTeamKey = oppTeamMeta?.key || (isHome ? m.away : m.home);
        const myBattle = isHome ? b.homeBattle : b.awayBattle;
        const oppBattle = isHome ? b.awayBattle : b.homeBattle;
        const myPoint = isHome ? b.homePoint : b.awayPoint;
        const won = myPoint > 0 || myBattle > oppBattle;

        if (side === "home") {
          homeEntries++;
          if (won) homeWins++;
        } else {
          awayEntries++;
          if (won) awayWins++;
        }

        const posRec =
          b.status === 0
            ? positions.vanguard
            : b.status === 1
              ? positions.middle
              : b.status === 2
                ? positions.anchor
                : positions.tiebreaker;

        posRec.entries++;
        if (won) posRec.wins++;
        else posRec.losses++;
        posRec.points += myPoint;

        if (myChar) {
          if (!charBattleTally[myChar]) charBattleTally[myChar] = { w: 0, l: 0 };
          charBattleTally[myChar].w += myBattle;
          charBattleTally[myChar].l += oppBattle;
        }

        if (oppChar) {
          if (!sflVsCharBouts[oppChar]) {
            sflVsCharBouts[oppChar] = { bWon: 0, bLost: 0, mWon: 0, mLost: 0 };
          }
          sflVsCharBouts[oppChar].bWon += myBattle;
          sflVsCharBouts[oppChar].bLost += oppBattle;
          if (won) sflVsCharBouts[oppChar].mWon++;
          else sflVsCharBouts[oppChar].mLost++;
        }

        boutLogs.push({
          matchId: m.id,
          sectionNumber: m.sectionNumber,
          sectionTitle: m.sectionTitle,
          scheduledAt: m.scheduledAt,
          side,
          status: b.status,
          statusName: b.statusName,
          myChar,
          opponentPlayerKey: oppPlayerKey,
          opponentPlayerName: PLAYER_NAME_MAP[oppPlayerKey] || oppPlayerKey,
          opponentTeamKey: oppTeamKey,
          opponentTeamShort: oppTeamMeta?.shortName || oppTeamKey.toUpperCase(),
          opponentChar: oppChar,
          myBattle,
          opponentBattle: oppBattle,
          myPoint,
          won,
        });
      }
    }

    for (const pos of Object.values(positions)) {
      pos.winRate =
        pos.entries > 0 ? Math.round((pos.wins / pos.entries) * 1000) / 10 : 0;
    }

    const entry = stat.sfl2026.entry;
    const victory = stat.sfl2026.victory;
    const losses = Math.max(0, entry - victory);
    const winRate = entry > 0 ? Math.round((victory / entry) * 1000) / 10 : 0;
    const point = stat.sfl2026.point;
    const avgPointPerEntry =
      entry > 0 ? Math.round((point / entry) * 10) / 10 : 0;

    const battleWon = stat.sfl2026.battleWon;
    const battlePlayed = stat.sfl2026.battlePlayed;
    const battleLost = Math.max(0, battlePlayed - battleWon);
    const battleWinRate =
      battlePlayed > 0
        ? Math.round((battleWon / battlePlayed) * 1000) / 10
        : 50;

    const roundWon = stat.sfl2026.roundWon;
    const roundPlayed = stat.sfl2026.roundPlayed;
    const roundLost = Math.max(0, roundPlayed - roundWon);
    const roundWinRate =
      roundPlayed > 0 ? Math.round((roundWon / roundPlayed) * 1000) / 10 : 50;

    const homeWinRate = Math.round(stat.sfl2026.homeWinRate * 1000) / 10;
    const awayWinRate = Math.round(stat.sfl2026.awayWinRate * 1000) / 10;

    // 今シーズンのSFL実戦での使用キャラクター集計
    const usedCharacters = Object.entries(charBattleTally).map(
      ([cKey, tally]) => {
        const total = tally.w + tally.l;
        return {
          charKey: cKey,
          charName: formatCharName(cKey),
          battlesWon: tally.w,
          battlesLost: tally.l,
          battlesTotal: total,
          battleWinRate:
            total > 0 ? Math.round((tally.w / total) * 1000) / 10 : 50,
        };
      }
    );
    usedCharacters.sort(
      (a, b) => b.battlesTotal - a.battlesTotal || b.battlesWon - a.battlesWon
    );

    const actualMainChar = usedCharacters[0]?.charKey || stat.mainChar;
    const actualSubChars = usedCharacters
      .slice(1)
      .filter((u) => u.battlesTotal > 0)
      .map((u) => u.charKey);

    if (usedCharacters.length === 0) {
      usedCharacters.push({
        charKey: actualMainChar,
        charName: formatCharName(actualMainChar),
        battlesWon: 0,
        battlesLost: 0,
        battlesTotal: 0,
        battleWinRate: Math.round(stat.cptStats.overallWinRate * 1000) / 10,
      });
    }

    // 対キャラクター相性
    const vsCharacters: VsCharDetail[] = ALL_SF6_CHARS.map((cKey) => {
      const matchups = boutLogs.filter((b) => b.opponentChar === cKey);
      const bWon = matchups.reduce((sum, b) => sum + b.myBattle, 0);
      const bLost = matchups.reduce((sum, b) => sum + b.opponentBattle, 0);
      const bTotal = bWon + bLost;
      const mWon = matchups.filter((b) => b.won).length;
      const mLost = matchups.filter((b) => !b.won).length;
      const mTotal = matchups.length;
      const playedInSfl = bTotal > 0;

      const homeBattlesWon = matchups
        .filter((b) => b.side === "home")
        .reduce((sum, b) => sum + b.myBattle, 0);
      const homeBattlesLost = matchups
        .filter((b) => b.side === "home")
        .reduce((sum, b) => sum + b.opponentBattle, 0);
      const awayBattlesWon = matchups
        .filter((b) => b.side === "away")
        .reduce((sum, b) => sum + b.myBattle, 0);
      const awayBattlesLost = matchups
        .filter((b) => b.side === "away")
        .reduce((sum, b) => sum + b.opponentBattle, 0);

      const sflBattleWinRate =
        bTotal > 0 ? Math.round((bWon / bTotal) * 1000) / 10 : null;
      const sflBoutWinRate =
        mTotal > 0 ? Math.round((mWon / mTotal) * 1000) / 10 : null;

      let tierLabel: VsCharDetail["tierLabel"] = "未対戦";
      if (playedInSfl && sflBattleWinRate !== null) {
        if (sflBattleWinRate >= 70) tierLabel = "大得意";
        else if (sflBattleWinRate > 50) tierLabel = "勝ち越し";
        else if (sflBattleWinRate === 50) tierLabel = "五分";
        else tierLabel = "苦戦";
      }

      // ★ SF6公式・大型大会 通算実戦集計
      const tourMatchups = (sf6Tournaments.players[pKey] || []).filter(
        (b) => b.opponentChar === cKey
      );
      const tWon = tourMatchups.filter((b) => b.won).length;
      const tLost = tourMatchups.filter((b) => !b.won).length;
      const tTotal = tWon + tLost;
      const playedInTournament = tTotal > 0;
      const tournamentMatchWinRate =
        tTotal > 0 ? Math.round((tWon / tTotal) * 1000) / 10 : null;

      let tournamentTierLabel: VsCharDetail["tournamentTierLabel"] = "未対戦";
      if (playedInTournament && tournamentMatchWinRate !== null) {
        if (tournamentMatchWinRate >= 70) tournamentTierLabel = "大得意";
        else if (tournamentMatchWinRate > 50) tournamentTierLabel = "勝ち越し";
        else if (tournamentMatchWinRate === 50) tournamentTierLabel = "五分";
        else tournamentTierLabel = "苦戦";
      }

      return {
        charKey: cKey,
        charName: formatCharName(cKey),
        playedInSfl,
        sflBattlesWon: bWon,
        sflBattlesLost: bLost,
        sflBattlesTotal: bTotal,
        sflBattleWinRate,
        sflBoutsWon: mWon,
        sflBoutsLost: mLost,
        sflBoutsTotal: mTotal,
        sflBoutWinRate,
        homeBattlesWon,
        homeBattlesLost,
        awayBattlesWon,
        awayBattlesLost,
        tierLabel,
        matchups,
        playedInTournament,
        tournamentMatchesWon: tWon,
        tournamentMatchesLost: tLost,
        tournamentMatchesTotal: tTotal,
        tournamentMatchWinRate,
        tournamentTierLabel,
        tournamentMatchups: tourMatchups,
      };
    });

    const playedVsChars = vsCharacters.filter((c) => c.playedInSfl);
    const unplayedVsChars = vsCharacters.filter((c) => !c.playedInSfl);

    const strongestMatchups = [...playedVsChars]
      .filter((c) => (c.sflBattleWinRate ?? 0) >= 50)
      .sort(
        (a, b) =>
          (b.sflBattleWinRate ?? 0) - (a.sflBattleWinRate ?? 0) ||
          b.sflBattlesWon - a.sflBattlesWon
      )
      .slice(0, 5);

    const closestMatchups = [...playedVsChars]
      .filter((c) => (c.sflBattleWinRate ?? 0) < 50)
      .sort(
        (a, b) =>
          (a.sflBattleWinRate ?? 0) - (b.sflBattleWinRate ?? 0) ||
          b.sflBattlesLost - a.sflBattlesLost
      )
      .slice(0, 5);

    const playedTourChars = vsCharacters.filter((c) => c.playedInTournament);
    const unplayedTourChars = vsCharacters.filter((c) => !c.playedInTournament);

    const tournamentStrongestMatchups = [...playedTourChars]
      .filter((c) => (c.tournamentMatchWinRate ?? 0) >= 50)
      .sort(
        (a, b) =>
          (b.tournamentMatchWinRate ?? 0) - (a.tournamentMatchWinRate ?? 0) ||
          b.tournamentMatchesWon - a.tournamentMatchesWon
      )
      .slice(0, 5);

    const tournamentClosestMatchups = [...playedTourChars]
      .filter((c) => (c.tournamentMatchWinRate ?? 0) < 50)
      .sort(
        (a, b) =>
          (a.tournamentMatchWinRate ?? 0) - (b.tournamentMatchWinRate ?? 0) ||
          b.tournamentMatchesLost - a.tournamentMatchesLost
      )
      .slice(0, 5);

    const tournamentVsCharacters = [
      ...[...playedTourChars].sort(
        (a, b) =>
          (b.tournamentMatchWinRate ?? 0) - (a.tournamentMatchWinRate ?? 0) ||
          b.tournamentMatchesWon - a.tournamentMatchesWon
      ),
      ...[...unplayedTourChars].sort((a, b) =>
        a.charName.localeCompare(b.charName, "ja")
      ),
    ];

    const allPlayerTourBouts = sf6Tournaments.players[pKey] || [];
    const tourWon = allPlayerTourBouts.filter((b) => b.won).length;
    const tourLost = allPlayerTourBouts.length - tourWon;
    const uniqueTournaments = new Set(
      allPlayerTourBouts.map((b) => b.tournamentName)
    ).size;
    const tournamentSummary = {
      totalMatches: allPlayerTourBouts.length,
      won: tourWon,
      lost: tourLost,
      winRate:
        allPlayerTourBouts.length > 0
          ? Math.round((tourWon / allPlayerTourBouts.length) * 1000) / 10
          : 50,
      tournamentsCount: uniqueTournaments,
    };

    const sortedVsChars = [
      ...[...playedVsChars].sort(
        (a, b) =>
          (b.sflBattleWinRate ?? 0) - (a.sflBattleWinRate ?? 0) ||
          b.sflBattlesWon - a.sflBattlesWon
      ),
      ...[...unplayedVsChars].sort((a, b) =>
        a.charName.localeCompare(b.charName, "ja")
      ),
    ];

    const parameters = calcPlayerParameters({
      entry,
      avgPointPerEntry,
      winRate,
      eloRating: stat.eloRating,
      positions,
      homeWinRate,
      awayWinRate,
      battleWinRate,
      roundWinRate,
      overallWinRate: stat.cptStats.overallWinRate,
      playedVsChars,
      actualSubChars,
    });

    const featureTags = generateFeatureTags({
      positions,
      entry,
      winRate,
      point,
      awayEntries,
      awayWins,
      homeEntries,
      homeWins,
      playedVsChars,
      actualMainChar,
    });

    const objectiveSummary = generateObjectiveSummary({
      entry,
      victory,
      losses,
      winRate,
      point,
      avgPointPerEntry,
      positions,
      overallWinRate: stat.cptStats.overallWinRate,
      homeEntries,
      homeWins,
      homeWinRate,
      awayEntries,
      awayWins,
      awayWinRate,
      battleWinRate,
      battleWon,
      battleLost,
      roundWinRate,
      roundWon,
      roundPlayed,
      actualMainChar,
      actualSubChars,
      playedVsChars,
      strongestMatchups,
    });

    const rawSns = PLAYER_SNS_MAP[pKey] || {};
    const snsLinks: PlayerSnsLinks = {
      ...rawSns,
      sflOfficial: `https://sf.esports.capcom.com/sfl2026/player/${pKey}/`,
    };

    entries.push({
      playerKey: pKey,
      name: stat.name,
      nameEn: stat.nameEn,
      teamKey: stat.teamKey,
      teamName: teamMeta.name,
      teamShort: teamMeta.shortName,
      teamColor: teamMeta.color,
      division: stat.division,
      mainChar: actualMainChar,
      mainCharName: formatCharName(actualMainChar),
      subChars: actualSubChars,
      subCharNames: actualSubChars.map(formatCharName),
      eloRating: stat.eloRating,
      snsLinks,
      sfl: {
        entry,
        victory,
        losses,
        winRate,
        point,
        avgPointPerEntry,
        battleWon,
        battleLost,
        battlePlayed,
        battleWinRate,
        roundWon,
        roundLost,
        roundPlayed,
        roundWinRate,
        homeWinRate,
        awayWinRate,
        homeEntries,
        homeWins,
        awayEntries,
        awayWins,
      },
      positions,
      usedCharacters,
      parameters,
      featureTags,
      objectiveSummary,
      vsCharacters: sortedVsChars,
      strongestMatchups,
      closestMatchups,
      tournamentVsCharacters,
      tournamentStrongestMatchups,
      tournamentClosestMatchups,
      tournamentSummary,
      boutLogs,
    });
  }

  entries.sort(
    (a, b) =>
      b.sfl.point - a.sfl.point ||
      b.parameters.overallScore - a.parameters.overallScore ||
      b.eloRating - a.eloRating
  );

  return entries;
}
