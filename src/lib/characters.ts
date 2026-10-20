/**
 * SF6 キャラクター定義 (アプリ全体の唯一の定義元)
 *
 * key はアプリ内部キー。SFL公式API (sf.esports.capcom.com/api/sfl20xx/?data=characters) の
 * キー体系に合わせているが、歴史的経緯で "dee_jay" のみ公式の "deejay" と異なるため
 * normalizeSflCharKey で吸収する。
 */

export interface Sf6Character {
  key: string;
  /** 英字表記 (SFL公式APIの name) */
  name: string;
  /** 日本語表記 (公式キャラクターページの表記) */
  nameJp: string;
}

export const SF6_CHARACTERS: Sf6Character[] = [
  { key: "ryu", name: "RYU", nameJp: "リュウ" },
  { key: "luke", name: "LUKE", nameJp: "ルーク" },
  { key: "jamie", name: "JAMIE", nameJp: "ジェイミー" },
  { key: "chunli", name: "CHUN-LI", nameJp: "春麗" },
  { key: "guile", name: "GUILE", nameJp: "ガイル" },
  { key: "kimberly", name: "KIMBERLY", nameJp: "キンバリー" },
  { key: "juri", name: "JURI", nameJp: "ジュリ" },
  { key: "ken", name: "KEN", nameJp: "ケン" },
  { key: "blanka", name: "BLANKA", nameJp: "ブランカ" },
  { key: "dhalsim", name: "DHALSIM", nameJp: "ダルシム" },
  { key: "ehonda", name: "E.HONDA", nameJp: "E.本田" },
  { key: "dee_jay", name: "DEE JAY", nameJp: "ディージェイ" },
  { key: "manon", name: "MANON", nameJp: "マノン" },
  { key: "marisa", name: "MARISA", nameJp: "マリーザ" },
  { key: "jp", name: "JP", nameJp: "JP" },
  { key: "zangief", name: "ZANGIEF", nameJp: "ザンギエフ" },
  { key: "lily", name: "LILY", nameJp: "リリー" },
  { key: "cammy", name: "CAMMY", nameJp: "キャミィ" },
  { key: "rashid", name: "RASHID", nameJp: "ラシード" },
  { key: "aki", name: "A.K.I.", nameJp: "A.K.I." },
  { key: "ed", name: "ED", nameJp: "エド" },
  { key: "gouki_akuma", name: "GOUKI (AKUMA)", nameJp: "豪鬼" },
  { key: "vega_mbison", name: "VEGA (M.BISON)", nameJp: "ベガ" },
  { key: "terry", name: "TERRY", nameJp: "テリー" },
  { key: "mai", name: "MAI", nameJp: "不知火舞" },
  { key: "elena", name: "ELENA", nameJp: "エレナ" },
  { key: "sagat", name: "SAGAT", nameJp: "サガット" },
  { key: "cviper", name: "C.VIPER", nameJp: "C.ヴァイパー" },
  { key: "alex", name: "ALEX", nameJp: "アレックス" },
  { key: "ingrid", name: "INGRID", nameJp: "イングリッド" },
  { key: "yasmine", name: "YASMINE", nameJp: "ヤスミン" },
];

export const SF6_CHARACTER_KEYS: string[] = SF6_CHARACTERS.map((c) => c.key);

const SFL_KEY_ALIASES: Record<string, string> = {
  deejay: "dee_jay",
  honda: "ehonda",
  akuma: "gouki_akuma",
  gouki: "gouki_akuma",
  mbison: "vega_mbison",
  vega: "vega_mbison",
};

/**
 * SFL公式API / Buckler の character_tool_name → 内部キー
 * (Buckler は gouki / deejay / honda 表記。SFL未対応の新キャラは公式キーのまま返す)
 * 公式は操作タイプを "ken(m)" のように括弧で付けることがあるため除去する
 */
export function normalizeSflCharKey(raw: string | null | undefined): string {
  if (!raw) return "";
  const base = raw.split("(")[0].trim().toLowerCase();
  return SFL_KEY_ALIASES[base] ?? base;
}

/** SFL公式APIのキャラキーに付く操作タイプ ("c" クラシック / "m" モダン) */
export function sflCharMode(raw: string | null | undefined): "c" | "m" | null {
  const m = raw?.match(/\((\w)\)/);
  if (!m) return null;
  return m[1].toLowerCase() === "m" ? "m" : "c";
}
