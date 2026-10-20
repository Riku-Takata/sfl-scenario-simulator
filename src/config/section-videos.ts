/**
 * 各節の公式YouTubeアーカイブの手動指定。
 * 通常は公式チャンネルの配信一覧から自動検出する (scripts/recap/youtube-archive.ts) ので登録不要。
 * 自動検出が誤る・取れない節だけここに書けば、検出結果より優先される。
 * Bout区間は概要欄の公式チャプターから自動取得する。
 */
export const SECTION_VIDEO_IDS: Record<string, string> = {
  "div-s-sec4": "WfaUMDDZ6Es",
  "div-f-sec3": "3X1zd27viu0",
  "div-f-sec4": "OvwqJkBiJqw",
};
