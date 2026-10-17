import type {
  CptMatchupsTop96Data,
  DivisionId,
  MatchesData,
  PlayerStatsData,
} from "./types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "./simulator";

export const CHAR_NAME_JP_MAP: Record<string, string> = {
  ryu: "リュウ",
  luke: "ルーク",
  jamie: "ジェイミー",
  chunli: "春麗",
  guile: "ガイル",
  kimberly: "キンバリー",
  juri: "ジュリ",
  ken: "ケン",
  blanka: "ブランカ",
  dhalsim: "ダルシム",
  ehonda: "E.本田",
  dee_jay: "ディージェイ",
  manon: "マノン",
  marisa: "マリーザ",
  jp: "JP",
  zangief: "ザンギエフ",
  lily: "リリー",
  cammy: "キャミィ",
  rashid: "ラシード",
  aki: "A.K.I.",
  ed: "エド",
  gouki_akuma: "豪鬼",
  vega_mbison: "ベガ",
  terry: "テリー",
  mai: "不知火舞",
  elena: "エレナ",
  sagat: "サガット",
  cviper: "C.ヴァイパー",
  honda: "E.本田",
  ibuki: "いぶき",
};

export function formatCharName(charKey: string): string {
  if (!charKey) return "不明";
  return CHAR_NAME_JP_MAP[charKey] || charKey.toUpperCase();
}

export interface PositionRecord {
  entries: number;
  wins: number;
  losses: number;
  points: number;
  winRate: number;
}

export interface PlayerBoutLog {
  matchId: string;
  sectionNumber: number;
  sectionTitle: string;
  scheduledAt: string;
  side: "home" | "away";
  status: number;
  statusName: string;
  myChar: string;
  opponentPlayerKey: string;
  opponentPlayerName: string;
  opponentTeamKey: string;
  opponentTeamShort: string;
  opponentChar: string;
  myBattle: number;
  opponentBattle: number;
  myPoint: number;
  won: boolean;
}

export interface VsCharDetail {
  charKey: string;
  charName: string;
  estimatedWinRate: number; // 0..100
  sflBattlesWon: number;
  sflBattlesLost: number;
  sflBoutsWon: number;
  sflBoutsLost: number;
  tierLabel: "大得意" | "有利" | "五分" | "接戦";
}

export interface PlayerRadarParameters {
  pointEfficiency: number; // ポイント獲得力 (0..100)
  clutchPower: number; // 大将・勝負強さ (0..100)
  homeControl: number; // HOME後出し制圧力 (0..100)
  awayResilience: number; // AWAY先出し突破力 (0..100)
  roundDominance: number; // バトル・ラウンド支配力 (0..100)
  matchupCoverage: number; // 対応キャラ幅 (0..100)
  overallScore: number; // 総合データ評価値 (0..100)
  overallGrade: "S+" | "S" | "A+" | "A" | "B+" | "B";
}

export interface PlayerSnsLinks {
  x?: string;
  youtube?: string;
  twitch?: string;
  instagram?: string;
  sflOfficial: string;
}

export const PLAYER_SNS_MAP: Record<
  string,
  Omit<PlayerSnsLinks, "sflOfficial">
> = {
  // Division S - FAV
  ryukichi: {
    x: "https://x.com/ryukichi1214",
    youtube: "https://www.youtube.com/@ryukichi1214",
    twitch: "https://www.twitch.tv/ryukichi_",
  },
  sako: {
    x: "https://x.com/sakonoko",
    youtube: "https://www.youtube.com/c/sakonoko_game",
    twitch: "https://www.twitch.tv/sakonoko_game",
  },
  fujimura: {
    x: "https://x.com/fujimura333",
    twitch: "https://www.twitch.tv/fujimura333",
  },
  moke: {
    x: "https://x.com/lllmokelll",
    youtube: "https://www.youtube.com/@mokeasobi",
    twitch: "https://www.twitch.tv/lllmokelll",
    instagram: "https://www.instagram.com/lllmokelll/",
  },
  // Division S - CR
  dogura: {
    x: "https://x.com/maneater_dgr",
    youtube: "https://www.youtube.com/@ikoma_dogura",
    twitch: "https://www.twitch.tv/ikoma_dogura",
  },
  bonchan: {
    x: "https://x.com/katitagaribon",
    youtube: "https://www.youtube.com/@progamerbonchan5855",
    twitch: "https://www.twitch.tv/bonchan0311",
  },
  kazunoko: {
    x: "https://x.com/kazunoko0215",
    youtube: "https://www.youtube.com/@KazunokoChannel",
    twitch: "https://www.twitch.tv/kazunokon",
  },
  shuto: {
    x: "https://x.com/Shuto_fgc",
    youtube: "https://www.youtube.com/@shuto6713",
    twitch: "https://www.twitch.tv/shuto_fgc",
  },
  // Division S - SOL
  cosa: {
    x: "https://x.com/cosazeku",
    youtube: "https://www.youtube.com/channel/UCIEF_HU8Bx116tgJ0jHc1jw",
    twitch: "https://www.twitch.tv/cosazeku",
  },
  machabo: {
    x: "https://x.com/mcb_0726",
    youtube: "https://www.youtube.com/channel/UCRfFltHXvIxmePGRfki0MQQ",
  },
  kobayan: {
    x: "https://x.com/kobayan_new",
    youtube: "https://www.youtube.com/@kobayan0222",
    twitch: "https://www.twitch.tv/kobayan0222",
  },
  kincho: {
    x: "https://x.com/kincho0211",
    youtube: "https://www.youtube.com/@kincho0211",
    twitch: "https://www.twitch.tv/kincho0211",
  },
  // Division S - ZETA
  momochi: {
    x: "https://x.com/momochi212",
    youtube: "https://www.youtube.com/channel/UCPB5UJ70KDnL_hy0TyT79NA",
    twitch: "https://www.twitch.tv/momochoco",
  },
  higuchi: {
    x: "https://x.com/higuchi010914",
    youtube: "https://www.youtube.com/@higuchi2001",
    twitch: "https://www.twitch.tv/higuchi2001",
  },
  yamaguchi: {
    x: "https://x.com/yamae1128",
    twitch: "https://www.twitch.tv/yama1128_fgc",
  },
  mena: {
    x: "https://x.com/_MenaRD__",
    youtube: "https://www.youtube.com/@saulmenard",
    twitch: "https://www.twitch.tv/menard_fgc",
  },
  // Division S - iXA
  acqua: {
    x: "https://x.com/acqua_db",
    youtube: "https://www.youtube.com/user/ACQUA41",
    twitch: "https://www.twitch.tv/acqua_0316",
  },
  hibiki: {
    x: "https://x.com/HibikiTheBeast",
    youtube: "https://www.youtube.com/@hibiki-sf6",
    twitch: "https://www.twitch.tv/hibikithebeast",
  },
  akira: {
    x: "https://x.com/akiradayooooo",
    youtube: "https://www.youtube.com/@akiradayooooo",
    twitch: "https://www.twitch.tv/c6akira",
  },
  takepi: {
    x: "https://x.com/piano_taketake",
    twitch: "https://www.twitch.tv/taketake_piano",
  },
  // Division S - IBSG
  yanai: {
    x: "https://x.com/yanai_0213",
    youtube: "https://www.youtube.com/@yanai0213",
    twitch: "https://www.twitch.tv/yanai_0213",
  },
  johnny: {
    x: "https://x.com/Johnny4act",
    twitch: "https://www.twitch.tv/johnny_fgc",
  },
  torimeshi: {
    x: "https://x.com/torimesi911",
    youtube: "https://www.youtube.com/@torimeshi88",
    twitch: "https://www.twitch.tv/cg_torimeshi",
  },
  "2bassa": {
    x: "https://x.com/2BASSA_",
    twitch: "https://www.twitch.tv/2bassa",
  },
  // Division F - VARREL
  mago: {
    x: "https://x.com/magotto3",
    youtube: "https://www.youtube.com/@magolong3",
    twitch: "https://www.twitch.tv/mago2dgod",
  },
  tokido: {
    x: "https://x.com/tokidoki77",
    youtube: "https://www.youtube.com/@Tokido",
    twitch: "https://www.twitch.tv/tokidoki77",
  },
  mizuha: {
    x: "https://x.com/mizuha11",
    youtube: "https://www.youtube.com/@mizuha3015",
    twitch: "https://www.twitch.tv/mizuha11",
  },
  wabiichi: {
    x: "https://x.com/wabiichi_fgc",
    twitch: "https://www.twitch.tv/wabiichi_fgc",
  },
  // Division F - G8S
  gachikun: {
    x: "https://x.com/gachikun0423",
    youtube: "https://www.youtube.com/channel/UCp_dcjCih34lTPNycKBSw7Q",
    twitch: "https://www.twitch.tv/gachikun0423",
    instagram: "https://www.instagram.com/gachikun.tsune/",
  },
  kawano: {
    x: "https://x.com/kawano_di",
    youtube: "https://www.youtube.com/channel/UCzRzPAT-AjlPyec5yXG974g",
    twitch: "https://www.twitch.tv/kawanochannn",
    instagram: "https://www.instagram.com/kawano_chun/",
  },
  pugera: {
    x: "https://x.com/pgr_pgr_",
    youtube: "https://www.youtube.com/channel/UCIG27RighMGSjxvTPJgSzcQ",
    twitch: "https://www.twitch.tv/pugepino",
  },
  sahara: {
    x: "https://x.com/sahara7h",
    youtube: "https://www.youtube.com/channel/UCIONt3FKZlpVuSJ4wRZ2wyQ",
    twitch: "https://www.twitch.tv/saharatvt",
    instagram: "https://www.instagram.com/tokuya2_24",
  },
  // Division F - DFM
  itazan: {
    x: "https://x.com/Itazan_Kuma",
    youtube: "https://www.youtube.com/@ItabashiZangief",
    twitch: "https://www.twitch.tv/itazan0429",
  },
  keib: {
    x: "https://x.com/_BNBBN_",
    youtube: "https://www.youtube.com/@bnbbn_8183",
    twitch: "https://www.twitch.tv/kei_b_bnbbn",
  },
  nauman: {
    x: "https://x.com/naumanzoh",
    youtube: "https://www.youtube.com/@naumanzoh",
    twitch: "https://www.twitch.tv/naumanzoh",
  },
  takeuchi: {
    x: "https://x.com/john_takeuchi",
    youtube: "https://www.youtube.com/channel/UC-udqjj0_jxbrdqpf-fJDDA",
    twitch: "https://www.twitch.tv/john_takeuchi",
  },
  // Division F - OJA
  seiya: {
    x: "https://x.com/owaechan",
    youtube: "https://www.youtube.com/@Seiya_owaechan",
    twitch: "https://www.twitch.tv/seiya_1201",
  },
  raoyamu: {
    x: "https://x.com/raoyamuyamu",
    youtube: "https://www.youtube.com/@raoyamuyamu",
  },
  otani: {
    x: "https://x.com/otani_saru",
    twitch: "https://www.twitch.tv/otani_bc",
  },
  mocchi: {
    x: "https://x.com/mugentoubu2",
    youtube: "https://www.youtube.com/@mugentoubu",
  },
  // Division F - REJECT
  daigo: {
    x: "https://x.com/daigothebeastJP",
    youtube: "https://www.youtube.com/c/DaigotheBeasTV",
    twitch: "https://www.twitch.tv/daigothebeastv",
  },
  fuudo: {
    x: "https://x.com/TheFuudo",
    youtube: "https://www.youtube.com/@thefuudo",
    twitch: "https://www.twitch.tv/thefuudo",
  },
  yas: {
    x: "https://x.com/YAS_jittyoku",
    youtube: "https://www.youtube.com/@yas-jittyoku",
    twitch: "https://www.twitch.tv/yas_jittyoku",
  },
  hinao: {
    x: "https://x.com/hinatoo02",
  },
  // Division F - RIDDLE
  takagi: {
    x: "https://x.com/Takagi_Progamer",
    youtube: "https://www.youtube.com/@takagikirinukidouga",
    twitch: "https://www.twitch.tv/takagitv",
  },
  adelie: {
    x: "https://x.com/adelie54",
    twitch: "https://www.twitch.tv/adelie54",
  },
  jr: {
    x: "https://x.com/juniorchaaaan",
    twitch: "https://www.twitch.tv/juniorzangief",
  },
  hikaru: {
    x: "https://x.com/hikaru_shiftne",
    youtube: "https://www.youtube.com/@hikaru_shiftne",
    twitch: "https://www.twitch.tv/hikaru_shiftne",
  },
};

export interface PlayerEncyclopediaEntry {
  playerKey: string;
  name: string;
  nameEn: string;
  teamKey: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  division: DivisionId;
  mainChar: string;
  mainCharName: string;
  subChars: string[];
  subCharNames: string[];
  eloRating: number;
  snsLinks: PlayerSnsLinks;
  sfl: {
    entry: number;
    victory: number;
    losses: number;
    winRate: number; // 0..100
    point: number;
    avgPointPerEntry: number;
    battleWon: number;
    battleLost: number;
    battlePlayed: number;
    battleWinRate: number; // 0..100
    roundWon: number;
    roundLost: number;
    roundPlayed: number;
    roundWinRate: number; // 0..100
    homeWinRate: number; // 0..100
    awayWinRate: number; // 0..100
    homeEntries: number;
    homeWins: number;
    awayEntries: number;
    awayWins: number;
  };
  positions: {
    vanguard: PositionRecord; // 先鋒 (10pt)
    middle: PositionRecord; // 中堅 (10pt)
    anchor: PositionRecord; // 大将 (20pt)
    tiebreaker: PositionRecord; // 延長 (10pt)
  };
  usedCharacters: Array<{
    charKey: string;
    charName: string;
    battlesWon: number;
    battlesLost: number;
    battlesTotal: number;
    battleWinRate: number;
  }>;
  parameters: PlayerRadarParameters;
  featureTags: string[];
  objectiveSummary: string[];
  vsCharacters: VsCharDetail[];
  strongestMatchups: VsCharDetail[];
  closestMatchups: VsCharDetail[];
  boutLogs: PlayerBoutLog[];
}

function clampScore(val: number, min = 35, max = 99): number {
  return Math.round(Math.max(min, Math.min(max, val)));
}

function emptyPos(): PositionRecord {
  return { entries: 0, wins: 0, losses: 0, points: 0, winRate: 0 };
}

export function buildPlayerEncyclopedia(
  playerStatsData: PlayerStatsData,
  matchesData: MatchesData,
  _cptMatchupsData?: CptMatchupsTop96Data
): PlayerEncyclopediaEntry[] {
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
        const oppTeamKey = isHome ? m.away : m.home;
        const oppTeamMeta = TEAM_META_MAP[oppTeamKey];
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

    // 今シーズンのSFL実戦での使用キャラクター集計（使用バトル数順）
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

    // 今シーズンのSFLで最も使用回数の多いキャラをメイン、ほかに今期SFLで使用されたキャラがある場合のみサブとする
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

    // 対キャラクター相性一覧
    const vsCharacters: VsCharDetail[] = Object.values(stat.vsCharStats).map(
      (vc) => {
        const obs = sflVsCharBouts[vc.vsChar] || {
          bWon: 0,
          bLost: 0,
          mWon: 0,
          mLost: 0,
        };
        const estRate = Math.round(vc.smoothedWinRate * 1000) / 10;
        const tierLabel: VsCharDetail["tierLabel"] =
          estRate >= 56
            ? "大得意"
            : estRate >= 51.5
              ? "有利"
              : estRate >= 48.5
                ? "五分"
                : "接戦";
        return {
          charKey: vc.vsChar,
          charName: formatCharName(vc.vsChar),
          estimatedWinRate: estRate,
          sflBattlesWon: obs.bWon,
          sflBattlesLost: obs.bLost,
          sflBoutsWon: obs.mWon,
          sflBoutsLost: obs.mLost,
          tierLabel,
        };
      }
    );

    const sortedByWinRateDesc = [...vsCharacters].sort(
      (a, b) =>
        b.estimatedWinRate - a.estimatedWinRate ||
        b.sflBoutsWon - a.sflBoutsWon
    );
    const strongestMatchups = sortedByWinRateDesc.slice(0, 5);
    const closestMatchups = [...vsCharacters]
      .sort(
        (a, b) =>
          a.estimatedWinRate - b.estimatedWinRate ||
          b.sflBoutsLost - a.sflBoutsLost
      )
      .slice(0, 5);

    // 6角形客観パラメーター算出 (0..100)
    const eloNorm = (stat.eloRating - 1850) / 2.2; // ~ 1950 -> 45, 2000 -> 68
    const pointEfficiency = clampScore(
      entry > 0
        ? 48 + avgPointPerEntry * 2.1 + (winRate - 50) * 0.25
        : 52 + eloNorm * 0.45
    );

    const anchorAndTieEntries =
      positions.anchor.entries + positions.tiebreaker.entries;
    const anchorAndTieWins =
      positions.anchor.wins + positions.tiebreaker.wins;
    const clutchPower = clampScore(
      anchorAndTieEntries > 0
        ? 55 +
            (anchorAndTieWins / anchorAndTieEntries) * 28 +
            anchorAndTieEntries * 3.5 +
            (stat.eloRating - 1920) * 0.08
        : 48 + (stat.eloRating - 1900) * 0.22 + (winRate - 50) * 0.2
    );

    const homeControl = clampScore(
      42 + (homeWinRate - 40) * 1.35 + (stat.eloRating - 1920) * 0.08
    );

    const awayResilience = clampScore(
      45 + (awayWinRate - 38) * 1.45 + (stat.eloRating - 1920) * 0.1
    );

    const roundDominance = clampScore(
      entry > 0
        ? 45 + (battleWinRate - 45) * 0.65 + (roundWinRate - 45) * 0.55
        : 50 + (stat.cptStats.overallWinRate * 100 - 50) * 1.4
    );

    const favorableCharCount = vsCharacters.filter(
      (c) => c.estimatedWinRate >= 50.0
    ).length;
    const matchupCoverage = clampScore(
      42 +
        (favorableCharCount / Math.max(1, vsCharacters.length)) * 48 +
        Math.min(8, actualSubChars.length * 3)
    );

    const overallScore = Math.round(
      pointEfficiency * 0.2 +
        clutchPower * 0.18 +
        homeControl * 0.15 +
        awayResilience * 0.17 +
        roundDominance * 0.16 +
        matchupCoverage * 0.14
    );

    const overallGrade: PlayerRadarParameters["overallGrade"] =
      overallScore >= 82
        ? "S+"
        : overallScore >= 76
          ? "S"
          : overallScore >= 70
            ? "A+"
            : overallScore >= 64
              ? "A"
              : overallScore >= 58
                ? "B+"
                : "B";

    // 客観データに基づく特徴タグと分析文の自動生成（主観ゼロ）
    const featureTags: string[] = [];
    if (positions.anchor.entries >= 2) {
      featureTags.push(
        `大将戦メイン (${positions.anchor.entries}戦${positions.anchor.wins}勝)`
      );
    } else if (
      positions.vanguard.entries + positions.middle.entries >= 2 &&
      positions.anchor.entries === 0
    ) {
      featureTags.push("先鋒・中堅スペシャリスト");
    }

    if (entry >= 2 && winRate >= 75) {
      featureTags.push(`高勝率 (${winRate.toFixed(0)}%)`);
    }
    if (point >= 40) {
      featureTags.push(`ポイントゲッター (${point}pt)`);
    }
    if (awayEntries >= 1 && awayWins === awayEntries) {
      featureTags.push(`AWAY先出し無敗 (${awayWins}勝0敗)`);
    } else if (homeEntries >= 1 && homeWins === homeEntries) {
      featureTags.push(`HOME後出し無敗 (${homeWins}勝0敗)`);
    }
    if (favorableCharCount >= 18) {
      featureTags.push(`広範囲キャラ対応 (${favorableCharCount}/28キャラ有利)`);
    }
    if (featureTags.length === 0) {
      featureTags.push(
        `主要使用キャラ: ${formatCharName(actualMainChar)}`
      );
    }

    const objectiveSummary: string[] = [];
    // 1. 起用ポジションとSFL戦績の事実
    if (entry > 0) {
      const posBreakdown = [
        positions.vanguard.entries > 0
          ? `先鋒${positions.vanguard.entries}戦(${positions.vanguard.wins}勝)`
          : null,
        positions.middle.entries > 0
          ? `中堅${positions.middle.entries}戦(${positions.middle.wins}勝)`
          : null,
        positions.anchor.entries > 0
          ? `大将${positions.anchor.entries}戦(${positions.anchor.wins}勝)`
          : null,
        positions.tiebreaker.entries > 0
          ? `延長${positions.tiebreaker.entries}戦(${positions.tiebreaker.wins}勝)`
          : null,
      ]
        .filter(Boolean)
        .join("・");

      objectiveSummary.push(
        `【SFL 2026 起用・戦績データ】現在${entry}試合に出場し${victory}勝${losses}敗（勝率${winRate.toFixed(1)}%・計${point}pt獲得 / 1出場平均${avgPointPerEntry}pt）。ポジション別内訳は「${posBreakdown}」となっています。`
      );
    } else {
      objectiveSummary.push(
        `【SFL 2026 起用・戦績データ】現時点ではSFL本戦未出場（温存）ですが、公式大会統計ではセット勝率${(stat.cptStats.overallWinRate * 100).toFixed(1)}%を記録しています。`
      );
    }

    // 2. HOME / AWAY とバトル・ラウンド支配力の事実
    objectiveSummary.push(
      `【HOME / AWAY・ラウンド取得傾向】HOME（後出し）出場時は${homeEntries}戦${homeWins}勝（推定勝率${homeWinRate.toFixed(1)}%）、AWAY（先出し）出場時は${awayEntries}戦${awayWins}勝（推定勝率${awayWinRate.toFixed(1)}%）。バトル取得率は${battleWinRate.toFixed(1)}%（${battleWon}勝${battleLost}敗）、ラウンド取得率は${roundWinRate.toFixed(1)}%（${roundWon}R/${roundPlayed}R）です。`
    );

    // 3. 対キャラクター相性の事実
    const top3Names = strongestMatchups
      .slice(0, 3)
      .map((m) => `${m.charName}（${m.estimatedWinRate.toFixed(1)}%）`)
      .join("・");
    const subCharText =
      actualSubChars.length > 0
        ? `（サブ使用: ${actualSubChars.map(formatCharName).join("・")}）`
        : "";
    objectiveSummary.push(
      `【対キャラクター相性データ】今期メイン使用キャラ「${formatCharName(actualMainChar)}」${subCharText}を軸に、全28キャラ中${favorableCharCount}キャラに対して推定勝率50%以上を保持。特に ${top3Names} に対して高い勝率データが算出されています。`
    );

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
      parameters: {
        pointEfficiency,
        clutchPower,
        homeControl,
        awayResilience,
        roundDominance,
        matchupCoverage,
        overallScore,
        overallGrade,
      },
      featureTags,
      objectiveSummary,
      vsCharacters: sortedByWinRateDesc,
      strongestMatchups,
      closestMatchups,
      boutLogs,
    });
  }

  // デフォルトは獲得ポイント → 総合データ評価値順
  entries.sort(
    (a, b) =>
      b.sfl.point - a.sfl.point ||
      b.parameters.overallScore - a.parameters.overallScore ||
      b.eloRating - a.eloRating
  );

  return entries;
}
