import type { VideoChapter } from "../../src/lib/types";

/**
 * SFL公式アーカイブの概要欄「▼タイムスタンプ」からBout区間を切り出す。
 * 例: "43:52 TEAM MATCH 1 先鋒戦" ～ 次のチャプター "54:49 中堅戦ホーム側オーダー発表"
 */

const BOUT_LABELS = ["先鋒戦", "中堅戦", "大将戦", "延長戦"] as const;

export function parseTimestampToSec(label: string): number | null {
  const parts = label.split(":").map((p) => Number(p));
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseChaptersFromDescription(description: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const m = rawLine.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
    if (!m) continue;
    const startSec = parseTimestampToSec(m[1]);
    if (startSec === null) continue;
    chapters.push({ startSec, title: m[2].trim() });
  }
  return chapters.sort((a, b) => a.startSec - b.startSec);
}

/**
 * statusは公式APIのBout番号 (0=先鋒, 1=中堅, 2=大将, 3=延長)。
 * Boutのチャプターが無ければ null。終端は次のチャプター（無ければ開始+30分）。
 */
export function findBoutWindow(
  chapters: VideoChapter[],
  matchNumber: number,
  status: number
): { startSec: number; endSec: number } | null {
  const label = BOUT_LABELS[status];
  if (!label) return null;
  const pattern = new RegExp(`TEAM\\s*MATCH\\s*${matchNumber}\\s*${label}`);
  const idx = chapters.findIndex((c) => pattern.test(c.title));
  if (idx < 0) return null;
  const startSec = chapters[idx].startSec;
  const endSec = chapters[idx + 1]?.startSec ?? startSec + 30 * 60;
  return { startSec, endSec };
}

export function findMatchStartSec(chapters: VideoChapter[], matchNumber: number): number | null {
  const pattern = new RegExp(`TEAM\\s*MATCH\\s*${matchNumber}\\s*選手入場`);
  return chapters.find((c) => pattern.test(c.title))?.startSec ?? null;
}

export function extractYoutubeVideoId(url: string): string | null {
  const m = url.match(/(?:watch\?v=|youtu\.be\/|youtube\.com\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** 視聴ページHTMLの shortDescription からチャプターを取得する（APIキー不要）。 */
export async function fetchYoutubeChapters(videoId: string): Promise<VideoChapter[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" },
  });
  if (!res.ok) throw new Error(`YouTube page HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!m) throw new Error("shortDescription not found in YouTube page");
  const description = JSON.parse(`"${m[1]}"`) as string;
  return parseChaptersFromDescription(description);
}
