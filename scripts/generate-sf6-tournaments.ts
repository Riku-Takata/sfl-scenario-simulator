import fs from "node:fs";
import path from "node:path";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../src/lib/simulator";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");
const MASTER_PLAYERS_FILE = path.join(DATA_DIR, "master-players.json");
const PLAYER_STATS_FILE = path.join(DATA_DIR, "player-stats.json");
const OUTPUT_FILE = path.join(DATA_DIR, "sf6-tournament-matchups.json");

export interface Sf6TournamentBout {
  id: string;
  tournamentName: string;
  category: "CPT Premier" | "CPT WW" | "EVO" | "Capcom Cup" | "SFL";
  date: string;
  round: string;
  playerKey: string;
  myChar: string;
  opponentPlayerKey: string;
  opponentPlayerName: string;
  opponentTeam?: string;
  opponentChar: string;
  myScore: number;
  opponentScore: number;
  won: boolean;
}

export interface Sf6TournamentMatchupsData {
  updatedAt: string;
  source: string;
  sf6ReleaseDate: string;
  players: Record<string, Sf6TournamentBout[]>;
}

// SF6公式・大型大会のマスター定義（全て2023年6月SF6発売以降）
const SF6_TOURNAMENT_POOL = [
  // 2023 Season (SF6 Year 1)
  { name: "EVO 2023 (Las Vegas)", category: "EVO" as const, date: "2023-08-06", rounds: ["Top 8", "Top 16", "Top 32", "Pools Finals"] },
  { name: "CPT 2023 WW 日本予選 #1", category: "CPT WW" as const, date: "2023-08-19", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 WW 日本予選 #2", category: "CPT WW" as const, date: "2023-09-02", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 WW 日本予選 #3", category: "CPT WW" as const, date: "2023-09-23", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 Premier Singapore", category: "CPT Premier" as const, date: "2023-10-22", rounds: ["Top 8", "Top 16", "Pools Finals"] },
  { name: "CPT 2023 Premier France", category: "CPT Premier" as const, date: "2023-10-29", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 WW 日本予選 #4", category: "CPT WW" as const, date: "2023-11-04", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 WW 日本予選 #5", category: "CPT WW" as const, date: "2023-11-25", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2023 日本オンラインプレミア", category: "CPT Premier" as const, date: "2023-12-03", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "SFL 2023 Pro-JP 1st Stage", category: "SFL" as const, date: "2023-09-15", rounds: ["大将戦", "中堅戦", "先鋒戦"] },
  { name: "SFL 2023 Pro-JP 2nd Stage", category: "SFL" as const, date: "2023-11-20", rounds: ["大将戦", "中堅戦", "先鋒戦", "延長戦"] },
  { name: "Capcom Cup X", category: "Capcom Cup" as const, date: "2024-02-25", rounds: ["Top 8", "Top 16", "Group Stage"] },

  // 2024 Season (SF6 Year 2)
  { name: "EVO Japan 2024 (有明GYM-EX)", category: "EVO" as const, date: "2024-04-29", rounds: ["Top 8", "Top 16", "Top 24", "Top 48", "Pools Finals"] },
  { name: "EVO 2024 (Las Vegas)", category: "EVO" as const, date: "2024-07-21", rounds: ["Top 8", "Top 16", "Top 32", "Pools Finals"] },
  { name: "CPT 2024 WW 日本予選 #1", category: "CPT WW" as const, date: "2024-07-20", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 WW 日本予選 #2", category: "CPT WW" as const, date: "2024-08-17", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 WW 日本予選 #3", category: "CPT WW" as const, date: "2024-08-31", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 WW 日本予選 #4", category: "CPT WW" as const, date: "2024-09-21", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 WW 日本予選 #5", category: "CPT WW" as const, date: "2024-10-12", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 Super Premier Singapore", category: "CPT Premier" as const, date: "2024-10-20", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2024 Super Premier Japan (両国国技館)", category: "CPT Premier" as const, date: "2024-11-03", rounds: ["Top 8", "Top 16", "Top 32", "Top 64"] },
  { name: "CPT 2024 WW 日本地域決勝", category: "CPT WW" as const, date: "2024-12-21", rounds: ["Grand Final", "Top 4", "Top 8"] },
  { name: "SFL 2024 Pro-JP Div.S", category: "SFL" as const, date: "2024-10-15", rounds: ["第4節 大将戦", "第7節 大将戦", "第2節 中堅戦", "第6節 先鋒戦"] },
  { name: "SFL 2024 Pro-JP Div.F", category: "SFL" as const, date: "2024-10-22", rounds: ["第3節 大将戦", "第5節 大将戦", "第8節 中堅戦", "第1節 先鋒戦"] },
  { name: "SFL 2024 Pro-JP プレイオフ・決勝", category: "SFL" as const, date: "2024-12-28", rounds: ["決勝戦 大将戦", "準決勝 中堅戦", "プレイオフ 延長戦"] },
  { name: "Capcom Cup XI (両国国技館)", category: "Capcom Cup" as const, date: "2025-03-09", rounds: ["Top 8", "Top 16", "Group Stage"] },

  // 2025 Season (SF6 Year 3)
  { name: "EVO Japan 2025", category: "EVO" as const, date: "2025-05-11", rounds: ["Top 8", "Top 16", "Top 32", "Pools Finals"] },
  { name: "CPT 2025 WW 日本予選 #1", category: "CPT WW" as const, date: "2025-07-19", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2025 WW 日本予選 #2", category: "CPT WW" as const, date: "2025-08-09", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "EVO 2025 (Las Vegas)", category: "EVO" as const, date: "2025-08-03", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "CPT 2025 Super Premier Japan", category: "CPT Premier" as const, date: "2025-10-26", rounds: ["Top 8", "Top 16", "Top 32"] },
  { name: "SFL 2025 Pro-JP 本戦", category: "SFL" as const, date: "2025-11-10", rounds: ["大将戦", "中堅戦", "先鋒戦", "延長戦"] },

  // 2026 Season (SF6 Year 4)
  { name: "EVO Japan 2026", category: "EVO" as const, date: "2026-04-26", rounds: ["Top 8", "Top 16", "Top 32", "Pools Finals"] },
];

// SF6の各選手が主に使用してきたキャラ
const PLAYER_SF6_CHARS: Record<string, { main: string; pastMains: string[] }> = {
  tokido: { main: "jp", pastMains: ["ken", "luke", "gouki_akuma"] },
  daigo: { main: "ken", pastMains: ["gouki_akuma"] },
  mago: { main: "juri", pastMains: ["cammy", "mai"] },
  kawano: { main: "luke", pastMains: ["gouki_akuma"] },
  gachikun: { main: "rashid", pastMains: ["rashid"] },
  shuto: { main: "ryu", pastMains: ["marisa", "gouki_akuma"] },
  higuchi: { main: "guile", pastMains: ["guile"] },
  momochi: { main: "ed", pastMains: ["ken", "cviper"] },
  mena: { main: "blanka", pastMains: ["luke", "zangief"] },
  itazan: { main: "zangief", pastMains: ["marisa"] },
  kobayan: { main: "zangief", pastMains: ["zangief"] },
  bonchan: { main: "sagat", pastMains: ["luke", "gouki_akuma"] },
  kazunoko: { main: "cviper", pastMains: ["cammy", "jamie"] },
  fujimura: { main: "cviper", pastMains: ["ken"] },
  moke: { main: "mai", pastMains: ["chunli"] },
  sako: { main: "elena", pastMains: ["chunli"] },
  ryukichi: { main: "ken", pastMains: ["mai"] },
  dogura: { main: "elena", pastMains: ["dee_jay", "vega_mbison"] },
  machabo: { main: "ryu", pastMains: ["ken"] },
  cosa: { main: "ken", pastMains: ["luke"] },
  kincho: { main: "terry", pastMains: ["ken"] },
  yamaguchi: { main: "mai", pastMains: ["dee_jay", "ed"] },
  acqua: { main: "blanka", pastMains: ["jp"] },
  hibiki: { main: "lily", pastMains: ["mai"] },
  akira: { main: "cammy", pastMains: ["cviper"] },
  takepi: { main: "jp", pastMains: ["vega_mbison"] },
  yanai: { main: "vega_mbison", pastMains: ["sagat"] },
  johnny: { main: "elena", pastMains: ["marisa"] },
  torimeshi: { main: "dhalsim", pastMains: ["jp"] },
  "2bassa": { main: "juri", pastMains: ["cammy"] },
  mizuha: { main: "cammy", pastMains: ["mai"] },
  wabiichi: { main: "terry", pastMains: ["ken"] },
  pugera: { main: "cviper", pastMains: ["juri"] },
  sahara: { main: "ed", pastMains: ["ryu"] },
  nauman: { main: "mai", pastMains: ["ken"] },
  takeuchi: { main: "jamie", pastMains: ["rashid"] },
  keib: { main: "mai", pastMains: ["jp"] },
  seiya: { main: "chunli", pastMains: ["mai"] },
  otani: { main: "ken", pastMains: ["luke"] },
  mocchi: { main: "gouki_akuma", pastMains: ["ken"] },
  raoyamu: { main: "ed", pastMains: ["luke"] },
  fuudo: { main: "ed", pastMains: ["dee_jay"] },
  yas: { main: "zangief", pastMains: ["marisa"] },
  hinao: { main: "chunli", pastMains: ["cammy"] },
  jr: { main: "gouki_akuma", pastMains: ["luke"] },
  takagi: { main: "ken", pastMains: ["terry"] },
  adelie: { main: "ryu", pastMains: ["ken"] },
  hikaru: { main: "aki", pastMains: ["chunli"] },
};

// 代表的な対戦相手プール（SF6の各キャラを代表する有名プレイヤー）
const CHAR_REPRESENTATIVE_PLAYERS: Record<string, Array<{ key: string; name: string }>> = {
  ryu: [{ key: "shuto", name: "Shuto" }, { key: "machabo", name: "まちゃぼー" }, { key: "paladin", name: "Paladin" }],
  luke: [{ key: "kawano", name: "カワノ" }, { key: "bonchan", name: "ボンちゃん" }, { key: "chris_wong", name: "Chris Wong" }],
  jamie: [{ key: "takeuchi", name: "竹内ジョン" }, { key: "narikun", name: "なるお" }],
  chunli: [{ key: "moke", name: "もけ" }, { key: "fenritti", name: "フェンリっち" }, { key: "go1", name: "GO1" }],
  guile: [{ key: "higuchi", name: "ひぐち" }, { key: "daikoku", name: "大黒" }, { key: "nuckledu", name: "NuckleDu" }],
  kimberly: [{ key: "shinya", name: "Shinya" }, { key: "jaccy", name: "Jaccy" }, { key: "shine", name: "Shine" }],
  juri: [{ key: "mago", name: "マゴ" }, { key: "2bassa", name: "2BASSA" }, { key: "nephew", name: "Nephew" }],
  ken: [{ key: "ryukichi", name: "りゅうきち" }, { key: "tokido", name: "ときど" }, { key: "angrybird", name: "AngryBird" }],
  blanka: [{ key: "mena", name: "MenaRD" }, { key: "acqua", name: "ACQUA" }],
  dhalsim: [{ key: "torimeshi", name: "鶏めし" }, { key: "mister_crimson", name: "Mister Crimson" }, { key: "itatsupin", name: "イタツピン" }],
  ehonda: [{ key: "stormkubo", name: "ストーム久保" }, { key: "chuan", name: "Chuan" }],
  dee_jay: [{ key: "fuudo", name: "ふ～ど" }, { key: "dogura", name: "どぐら" }],
  manon: [{ key: "idom", name: "iDom" }, { key: "randy", name: "ランディ" }],
  marisa: [{ key: "shuto", name: "Shuto" }, { key: "big_bird", name: "Big Bird" }, { key: "bafael", name: "Bafael" }],
  jp: [{ key: "kakeru", name: "翔" }, { key: "takepi", name: "takepi" }, { key: "tokido", name: "ときど" }],
  zangief: [{ key: "kobayan", name: "こばやん" }, { key: "itazan", name: "板橋ザンギエフ" }, { key: "junior", name: "Junior" }],
  lily: [{ key: "hibiki", name: "ひびき" }, { key: "elchakotay", name: "ElChakotay" }],
  cammy: [{ key: "kazunoko", name: "かずのこ" }, { key: "akira", name: "あきら" }, { key: "mizuha", name: "水派" }],
  rashid: [{ key: "gachikun", name: "ガチくん" }, { key: "jb", name: "JB" }],
  aki: [{ key: "hikaru", name: "ひかる" }, { key: "broski", name: "Broski" }],
  ed: [{ key: "momochi", name: "ももち" }, { key: "sahara", name: "さはら" }, { key: "endingwalker", name: "EndingWalker" }],
  gouki_akuma: [{ key: "daigo", name: "ウメハラ" }, { key: "tokido", name: "ときど" }, { key: "mocchi", name: "もっちー" }],
  vega_mbison: [{ key: "yanai", name: "ヤナイ" }, { key: "problem_x", name: "Problem X" }],
  terry: [{ key: "kincho", name: "きんちょ" }, { key: "wabiichi", name: "わびいち" }],
  mai: [{ key: "moke", name: "もけ" }, { key: "yamaguchi", name: "ヤマグチ" }, { key: "nauman", name: "ナウマン" }],
  elena: [{ key: "sako", name: "sako" }, { key: "dogura", name: "どぐら" }, { key: "johnny", name: "ジョニィ" }],
  sagat: [{ key: "bonchan", name: "ボンちゃん" }, { key: "higuchi", name: "ひぐち" }],
  cviper: [{ key: "fujimura", name: "藤村" }, { key: "kazunoko", name: "かずのこ" }, { key: "pugera", name: "ぷげら" }]
};

function main() {
  const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE, "utf-8"));
  const masterPlayersData = JSON.parse(fs.readFileSync(MASTER_PLAYERS_FILE, "utf-8"));
  const playerStatsData = JSON.parse(fs.readFileSync(PLAYER_STATS_FILE, "utf-8"));

  const allPlayers = Object.keys(masterPlayersData.players);
  const resultPlayers: Record<string, Sf6TournamentBout[]> = {};

  let boutIdSeq = 1;

  for (const pKey of allPlayers) {
    const bouts: Sf6TournamentBout[] = [];
    const pStat = playerStatsData.players[pKey];
    const pMeta = masterPlayersData.players[pKey];
    const charProfile = PLAYER_SF6_CHARS[pKey] || {
      main: pMeta?.mainChar || "ken",
      pastMains: pMeta?.subChars || ["ryu"]
    };
    const elo = pStat?.eloRating || 1930;

    // 1. 今シーズン（SFL 2026）の実戦ログを最優先で tournament bouts に収録
    for (const m of matchesData.matches) {
      if (!m.played || !m.bouts) continue;
      for (const b of m.bouts) {
        const isHome = b.homePlayer === pKey;
        const isAway = b.awayPlayer === pKey;
        if (!isHome && !isAway) continue;

        const myChar = (isHome ? b.homeChara : b.awayChara) || charProfile.main;
        const oppPlayerKey = isHome ? b.awayPlayer : b.homePlayer;
        const oppChar = (isHome ? b.awayChara : b.homeChara) || "ken";
        const myBattle = isHome ? b.homeBattle : b.awayBattle;
        const oppBattle = isHome ? b.awayBattle : b.homeBattle;
        const won = (isHome ? b.homePoint : b.awayPoint) > 0 || myBattle > oppBattle;

        const oppTeamMeta = Object.values(TEAM_META_MAP).find((t) => t.players.includes(oppPlayerKey));

        bouts.push({
          id: `sfl26-${m.id}-${b.status}-${pKey}`,
          tournamentName: `SFL 2026 Pro-JP (${m.sectionTitle})`,
          category: "SFL",
          date: m.scheduledAt ? m.scheduledAt.split(" ")[0] : "2026-09-15",
          round: b.statusName || "本戦",
          playerKey: pKey,
          myChar,
          opponentPlayerKey: oppPlayerKey,
          opponentPlayerName: PLAYER_NAME_MAP[oppPlayerKey] || oppPlayerKey,
          opponentTeam: oppTeamMeta?.shortName,
          opponentChar: oppChar,
          myScore: myBattle,
          opponentScore: oppBattle,
          won,
        });
      }
    }

    // 日付順にソート（新しい順）
    bouts.sort((a, b) => b.date.localeCompare(a.date));
    resultPlayers[pKey] = bouts;
  }

  const outputData: Sf6TournamentMatchupsData = {
    updatedAt: new Date().toISOString(),
    source: "SFL 2026 Pro-JP 公式戦実戦対戦ログ（※実在の公式戦のみを集計。未対戦キャラクターは0戦表示）",
    sf6ReleaseDate: "2023-06-02",
    players: resultPlayers,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), "utf-8");
  console.log(`Successfully generated SF6 tournament dataset for ${allPlayers.length} players at ${OUTPUT_FILE}`);
  return outputData;
}

export function generateSf6Tournaments() {
  return main();
}

if (process.argv[1] && process.argv[1].includes("generate-sf6-tournaments")) {
  main();
}
