import test from "node:test";
import assert from "node:assert/strict";
import {
  detectSectionVideos,
  parseChannelVideos,
  sectionSlugFromTitle,
  parseChannelPlaylists,
  detectSectionPlaylists,
  fetchSectionPlaylists,
} from "../scripts/recap/youtube-archive";
import { updateArchiveLinks } from "../scripts/refresh-archive-links";
import { MatchRecapsDataSchema } from "../src/lib/schema";

const html = (data: unknown) => `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;

test("parseChannelVideos: 新旧どちらのレイアウトからも動画IDとタイトルを取り出す", () => {
  const page = html({
    contents: [
      {
        lockupViewModel: {
          contentId: "uJmB3lK0WNo",
          metadata: { lockupMetadataViewModel: { title: { content: "「ストリートファイターリーグ JAPAN 2026」Division F 第5節　☆☆" } } },
        },
      },
      { videoRenderer: { videoId: "OvwqJkBiJqw", title: { runs: [{ text: "「ストリートファイターリーグ JAPAN 2026」" }, { text: "Division F 第4節" }] } } },
      { lockupViewModel: { contentId: "uJmB3lK0WNo", metadata: { lockupMetadataViewModel: { title: { content: "重複" } } } } },
    ],
  });
  assert.deepEqual(parseChannelVideos(page), [
    { videoId: "uJmB3lK0WNo", title: "「ストリートファイターリーグ JAPAN 2026」Division F 第5節　☆☆" },
    { videoId: "OvwqJkBiJqw", title: "「ストリートファイターリーグ JAPAN 2026」Division F 第4節" },
  ]);
  assert.deepEqual(parseChannelVideos("<html>no data</html>"), []);
});

test("sectionSlugFromTitle: シーズン・ディビジョン・節番号から slug を作る", () => {
  assert.equal(sectionSlugFromTitle("「ストリートファイターリーグ JAPAN 2026」Division F 第4節　☆☆18時40分より", "2026"), "div-f-sec4");
  assert.equal(sectionSlugFromTitle("「ストリートファイターリーグ JAPAN 2026」Division S 第１０節", "2026"), "div-s-sec10", "全角数字");
  assert.equal(sectionSlugFromTitle("「ストリートファイターリーグ JAPAN 2025」Division S 第4節", "2026"), null, "別シーズン");
  assert.equal(sectionSlugFromTitle("「CAPCOM Pro Tour 2026 ワールドウォリアー」日本大会 #4", "2026"), null);
});

test("detectSectionVideos: 同じ節が複数ある場合は一覧で先に出た (新しい) 動画", () => {
  const videos = [
    { videoId: "NEW", title: "「ストリートファイターリーグ JAPAN 2026」Division S 第5節" },
    { videoId: "OLD", title: "「ストリートファイターリーグ JAPAN 2026」Division S 第5節 (再)" },
    { videoId: "F4", title: "「ストリートファイターリーグ JAPAN 2026」Division F 第4節" },
    { videoId: "X", title: "Evo France 2026" },
  ];
  assert.deepEqual(detectSectionVideos(videos, "2026"), { "div-s-sec5": "NEW", "div-f-sec4": "F4" });
});

test("official playlist discovery supports lockups, legacy grids and title variations", () => {
  const playlists = parseChannelPlaylists(html({ contents: [
    { lockupViewModel: { contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST", contentId: "PLnew", metadata: { lockupMetadataViewModel: { title: { content: "試合動画：Division S 第５節【ストリートファイターリーグ JAPAn 2026】" } } } } },
    { gridPlaylistRenderer: { playlistId: "PLold", title: { runs: [{ text: "試合動画：Division F 第3節【ストリートファイターリーグ JAPAN 2026】" }] } } },
    { lockupViewModel: { contentType: "LOCKUP_CONTENT_TYPE_VIDEO", contentId: "VIDEO", metadata: { lockupMetadataViewModel: { title: { content: "ストリートファイターリーグ JAPAN 2026 Division S 第5節" } } } } },
  ] }));
  assert.equal(playlists.length, 2);
  assert.deepEqual(detectSectionPlaylists(playlists, "2026"), {
    "div-s-sec5": "https://www.youtube.com/playlist?list=PLnew",
    "div-f-sec3": "https://www.youtube.com/playlist?list=PLold",
  });
});

test("playlist discovery follows continuation pages", async (t) => {
  const playlist = (id: string, section: number) => ({ gridPlaylistRenderer: { playlistId: id, title: { simpleText: `Division S 第${section}節【ストリートファイターリーグ JAPAN 2026】` } } });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    calls++;
    if (calls === 1) return new Response(html({ contents: [playlist("PL5", 5), { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "NEXT" } } } }] }) + '<script>"INNERTUBE_CLIENT_VERSION":"test"</script>');
    assert.equal(JSON.parse(String(init?.body)).continuation, "NEXT");
    return new Response(JSON.stringify({ items: [playlist("PL2", 2)] }));
  });
  assert.deepEqual(await fetchSectionPlaylists("2026"), {
    "div-s-sec5": "https://www.youtube.com/playlist?list=PL5",
    "div-s-sec2": "https://www.youtube.com/playlist?list=PL2",
  });
  assert.equal(calls, 2);
});

test("playlist discovery retains earlier pages when pagination fails", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls > 1) return new Response("unavailable", { status: 503 });
    return new Response(html({ contents: [
      { playlistRenderer: { playlistId: "PL5", title: { simpleText: "Division S 第5節【ストリートファイターリーグ JAPAN 2026】" } } },
      { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "NEXT" } } } },
    ] }) + '<script>"INNERTUBE_CLIENT_VERSION":"test"</script>');
  });
  assert.deepEqual(await fetchSectionPlaylists("2026"), { "div-s-sec5": "https://www.youtube.com/playlist?list=PL5" });
});

test("fallback playlist validation rejects the previous season and retains a verified matching section", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/playlists")) return new Response(html({}));
    const title = url.includes("OLD") ? "Division F 第2節【ストリートファイターリーグ JAPAN 2025】" : "Division S 第2節【ストリートファイターリーグ JAPAN 2026】";
    return new Response(html({ metadata: { playlistMetadataRenderer: { title } } }));
  });
  assert.deepEqual(await fetchSectionPlaylists("2026", {
    "div-f-sec2": "https://www.youtube.com/playlist?list=OLD",
    "div-s-sec2": "https://www.youtube.com/playlist?list=CURRENT",
  }), { "div-f-sec2": "", "div-s-sec2": "https://www.youtube.com/playlist?list=CURRENT" });
});

test("metadata-only refresh repairs past links without changing scores or articles; outages preserve links", () => {
  const data = MatchRecapsDataSchema.parse({ updatedAt: "2026-10-24", generatorMode: "deterministic-rules", latestSection: { s: 5, f: 4 }, recentSections: { s: [], f: [] }, pastSections: { s: [
    { sectionNumber: 2, sectionTitle: "第2節", scheduledAt: "2026-09-01", youtubeUrl: "https://www.youtube.com/@CapcomFightersJP", playlistUrl: "https://www.youtube.com/playlist?list=OLD", matches: [{ home: "fav", away: "sol", homePoint: 10, awayPoint: 30, winner: "away" }] },
  ], f: [] } });
  const matches = JSON.stringify(data.pastSections.s[0].matches);
  assert.equal(updateArchiveLinks(data, { "div-s-sec2": "4-TyAmHuxGY" }, { "div-s-sec2": "https://www.youtube.com/playlist?list=NEW" }), true);
  assert.equal(data.pastSections.s[0].playlistUrl, "https://www.youtube.com/playlist?list=NEW");
  assert.equal(JSON.stringify(data.pastSections.s[0].matches), matches);
  assert.equal(data.updatedAt, "2026-10-24");
  assert.equal(updateArchiveLinks(data, {}, {}), false);
  assert.equal(updateArchiveLinks(data, {}, { "div-s-sec2": "" }), true);
  assert.equal(data.pastSections.s[0].playlistUrl, undefined);
});
