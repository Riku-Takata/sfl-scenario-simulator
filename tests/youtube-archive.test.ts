import test from "node:test";
import assert from "node:assert/strict";
import {
  detectSectionVideos,
  parseChannelVideos,
  sectionSlugFromTitle,
} from "../scripts/recap/youtube-archive";

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
