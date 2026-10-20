import { SF6_CHARACTERS, SF6_CHARACTER_KEYS } from "../characters";

export const CHAR_NAME_JP_MAP: Record<string, string> = {
  ...Object.fromEntries(SF6_CHARACTERS.map((c) => [c.key, c.nameJp])),
  // 旧データ・表記揺れ
  honda: "E.本田",
  ibuki: "いぶき",
};

export const ALL_SF6_CHARS = SF6_CHARACTER_KEYS;

export function formatCharName(charKey: string): string {
  if (!charKey) return "不明";
  return CHAR_NAME_JP_MAP[charKey] || charKey.toUpperCase();
}
