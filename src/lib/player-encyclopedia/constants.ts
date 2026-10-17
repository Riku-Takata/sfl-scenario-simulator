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

export const ALL_SF6_CHARS = [
  "ryu", "luke", "jamie", "chunli", "guile", "kimberly", "juri", "ken",
  "blanka", "dhalsim", "ehonda", "dee_jay", "manon", "marisa", "jp",
  "zangief", "lily", "cammy", "rashid", "aki", "ed", "gouki_akuma",
  "vega_mbison", "terry", "mai", "elena", "sagat", "cviper",
];

export function formatCharName(charKey: string): string {
  if (!charKey) return "不明";
  return CHAR_NAME_JP_MAP[charKey] || charKey.toUpperCase();
}
