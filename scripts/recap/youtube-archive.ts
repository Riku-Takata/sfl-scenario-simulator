/**
 * 公式YouTubeチャンネル (CAPCOM FIGHTERS JP) の配信一覧から、各節の配信アーカイブを自動検出する
 *
 * 配信タイトルは「ストリートファイターリーグ JAPAN 2026」Division F 第4節 … の形式なので、
 * シーズン・ディビジョン・節番号を読み取って節の slug (div-f-sec4) に対応付ける。
 * 手動登録 (src/config/section-videos.ts) があればそちらを優先する。
 */

const STREAMS_URL = "https://www.youtube.com/@CapcomFightersJP/streams";
const PLAYLISTS_URL = "https://www.youtube.com/@CapcomFightersJP/playlists";
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
  if (!new RegExp(`ストリートファイターリーグ\\s*JAPAN\\s*${season}(?!\\d)`, "i").test(normalized)) return null;
  const m = normalized.match(/Division\s*([SF])\s*第\s*(\d+)\s*節/i);
  if (!m) return null;
  return `div-${m[1].toLowerCase()}-sec${Number(m[2])}`;
}

export interface ChannelPlaylist { playlistId: string; title: string }

function initialData(html: string): unknown {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return match ? JSON.parse(match[1]) : {};
}

export function parseChannelPlaylists(data: unknown): ChannelPlaylist[] {
  if (typeof data === "string") data = initialData(data);
  const playlists: ChannelPlaylist[] = [];
  const seen = new Set<string>();
  const walk = (value: any): void => {
    if (!value || typeof value !== "object") return;
    const renderer = value.playlistRenderer ?? value.gridPlaylistRenderer;
    const lockup = value.lockupViewModel;
    const id = renderer?.playlistId ?? (lockup?.contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST" ? lockup.contentId : undefined);
    const title = renderer?.title?.simpleText ?? renderer?.title?.runs?.map((r: any) => r.text).join("") ?? lockup?.metadata?.lockupMetadataViewModel?.title?.content;
    if (typeof id === "string" && /^[\w-]+$/.test(id) && typeof title === "string" && !seen.has(id)) {
      seen.add(id);
      playlists.push({ playlistId: id, title });
    }
    Object.values(value).forEach(walk);
  };
  walk(data);
  return playlists;
}

export function detectSectionPlaylists(playlists: ChannelPlaylist[], season: string): Record<string, string> {
  const detected: Record<string, string> = {};
  for (const playlist of playlists) {
    const slug = sectionSlugFromTitle(playlist.title, season);
    if (slug && !detected[slug]) detected[slug] = `https://www.youtube.com/playlist?list=${playlist.playlistId}`;
  }
  return detected;
}

function continuationToken(data: any): string | undefined {
  if (!data || typeof data !== "object") return;
  if (data.continuationItemRenderer) return data.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
  for (const value of Object.values(data)) {
    const token = continuationToken(value);
    if (token) return token;
  }
}

/** Follow playlist pagination so earlier sections remain discoverable late in the season. */
export async function fetchSectionPlaylists(season: string, fallbacks: Record<string, string> = {}): Promise<Record<string, string>> {
  const detected: Record<string, string> = {};
  try {
    const headers = { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" };
    const response = await fetch(PLAYLISTS_URL, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    let data = initialData(html);
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      for (const [slug, url] of Object.entries(detectSectionPlaylists(parseChannelPlaylists(data), season))) {
        detected[slug] ??= url;
      }
      const token = continuationToken(data);
      if (!token || !clientVersion || seen.has(token) || page === 9) break;
      seen.add(token);
      const next = await fetch("https://www.youtube.com/youtubei/v1/browse", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion, hl: "ja" } }, continuation: token }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!next.ok) throw new Error(`continuation HTTP ${next.status}`);
      data = await next.json();
    }
    console.log(`[Archive] detected ${Object.keys(detected).length} section playlists from the official channel`);
  } catch (error) {
    console.warn(`[Archive] could not finish reading official playlists: ${(error as Error).message}`);
  }
  // The official result API sometimes points at a previous season. Validate
  // links absent from the channel listing; an empty value explicitly rejects one.
  for (const [slug, url] of Object.entries(fallbacks)) {
    if (slug in detected || !url) continue;
    try {
      const parsed = new URL(url);
      if (!["www.youtube.com", "youtube.com"].includes(parsed.hostname) || parsed.pathname !== "/playlist" || !parsed.searchParams.get("list")) {
        detected[slug] = "";
        continue;
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" } });
      if (!response.ok) continue;
      const data = initialData(await response.text()) as any;
      const title = data.metadata?.playlistMetadataRenderer?.title;
      if (typeof title === "string") {
        detected[slug] = sectionSlugFromTitle(title, season) === slug ? url : "";
        if (!detected[slug]) console.warn(`[Archive] Rejected mismatched playlist for ${slug}: ${title}`);
      }
    } catch (error) {
      console.warn(`[Archive] Could not validate ${slug}; preserving its cached link: ${(error as Error).message}`);
    }
  }
  return detected;
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
      signal: AbortSignal.timeout(30_000),
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
