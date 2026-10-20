/**
 * 公式YouTubeチャンネル (CAPCOM FIGHTERS JP) の配信一覧から、各節の配信アーカイブを自動検出する
 *
 * 配信タイトルは「ストリートファイターリーグ JAPAN 2026」Division F 第4節 … の形式なので、
 * シーズン・ディビジョン・節番号を読み取って節の slug (div-f-sec4) に対応付ける。
 * 手動登録 (src/config/section-videos.ts) があればそちらを優先する。
 */

const STREAMS_URL = "https://www.youtube.com/@CapcomFightersJP/streams";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface ChannelVideo {
  videoId: string;
  title: string;
}

/** 配信一覧ページの埋め込みデータ (ytInitialData) から動画IDとタイトルを取り出す */
export function parseChannelVideos(html: string): ChannelVideo[] {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const out: ChannelVideo[] = [];
  const seen = new Set<string>();
  const push = (videoId: unknown, title: unknown) => {
    if (typeof videoId !== "string" || typeof title !== "string" || seen.has(videoId)) return;
    seen.add(videoId);
    out.push({ videoId, title });
  };
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const obj = o as Record<string, any>;
    // 新しいレイアウト (lockupViewModel) と従来のレイアウト (videoRenderer) の両方に対応
    if (obj.lockupViewModel) {
      const l = obj.lockupViewModel;
      push(l.contentId, l.metadata?.lockupMetadataViewModel?.title?.content);
    }
    if (obj.videoRenderer) {
      const v = obj.videoRenderer;
      push(v.videoId, v.title?.runs?.map((r: { text: string }) => r.text).join("") ?? v.title?.simpleText);
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(data);
  return out;
}

/** 配信タイトル → 節の slug (例: div-f-sec4)。該当しなければ null */
export function sectionSlugFromTitle(title: string, season: string): string | null {
  const normalized = title.normalize("NFKC");
  if (!normalized.includes(`ストリートファイターリーグ JAPAN ${season}`)) return null;
  const m = normalized.match(/Division\s*([SF])\s*第\s*(\d+)\s*節/i);
  if (!m) return null;
  return `div-${m[1].toLowerCase()}-sec${Number(m[2])}`;
}

/** チャンネルの配信一覧から 節 slug → 動画ID を検出 (同じ節が複数あれば一覧で先に出た新しい方) */
export function detectSectionVideos(videos: ChannelVideo[], season: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of videos) {
    const slug = sectionSlugFromTitle(v.title, season);
    if (slug && !out[slug]) out[slug] = v.videoId;
  }
  return out;
}

export async function fetchSectionVideos(season: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(STREAMS_URL, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
    });
    if (!res.ok) {
      console.warn(`[Archive] YouTube streams page: HTTP ${res.status}`);
      return {};
    }
    const detected = detectSectionVideos(parseChannelVideos(await res.text()), season);
    console.log(`[Archive] detected ${Object.keys(detected).length} section archives from the official channel`);
    return detected;
  } catch (err) {
    console.warn(`[Archive] could not read the official channel: ${(err as Error).message}`);
    return {};
  }
}
