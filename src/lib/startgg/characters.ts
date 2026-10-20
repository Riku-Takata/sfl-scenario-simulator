/**
 * start.gg のキャラクター名 → 本アプリの内部キー (SFL公式APIのキー体系) 変換
 */

const START_GG_CHAR_KEY_MAP: Record<string, string> = {
  ryu: "ryu",
  luke: "luke",
  jamie: "jamie",
  chunli: "chunli",
  guile: "guile",
  kimberly: "kimberly",
  juri: "juri",
  ken: "ken",
  blanka: "blanka",
  dhalsim: "dhalsim",
  ehonda: "ehonda",
  honda: "ehonda",
  deejay: "dee_jay",
  manon: "manon",
  marisa: "marisa",
  jp: "jp",
  zangief: "zangief",
  lily: "lily",
  cammy: "cammy",
  rashid: "rashid",
  aki: "aki",
  ed: "ed",
  akuma: "gouki_akuma",
  gouki: "gouki_akuma",
  mbison: "vega_mbison",
  bison: "vega_mbison",
  vega: "vega_mbison",
  terry: "terry",
  mai: "mai",
  elena: "elena",
  sagat: "sagat",
  cviper: "cviper",
  viper: "cviper",
  alex: "alex",
  ingrid: "ingrid",
  yasmine: "yasmine",
};

export function normalizeStartggCharName(name: string | null | undefined): string | null {
  if (!name) return null;
  const norm = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!norm || norm === "random") return null;
  return START_GG_CHAR_KEY_MAP[norm] ?? norm;
}
