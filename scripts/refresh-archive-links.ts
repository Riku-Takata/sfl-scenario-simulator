import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MatchRecapsDataSchema } from "../src/lib/schema";
import type { MatchRecapsData } from "../src/lib/types";
import { SFL_CURRENT_SEASON } from "../src/lib/sfl/play-style";
import { SECTION_VIDEO_IDS } from "../src/config/section-videos";
import { fetchSectionPlaylists, fetchSectionVideos } from "./recap/youtube-archive";

export function updateArchiveLinks(data: MatchRecapsData, videos: Record<string, string>, playlists: Record<string, string>): boolean {
  const before = JSON.stringify(data);
  for (const division of ["s", "f"] as const) {
    for (const section of data.pastSections[division]) {
      const slug = `div-${division}-sec${section.sectionNumber}`;
      const video = SECTION_VIDEO_IDS[slug] ?? videos[slug];
      if (video) section.youtubeUrl = `https://www.youtube.com/watch?v=${video}`;
      section.playlistUrl = slug in playlists ? playlists[slug] || undefined : section.playlistUrl;
    }
    for (const match of data.recentSections[division]) {
      const slug = `div-${division}-sec${data.latestSection[division]}`;
      const video = SECTION_VIDEO_IDS[slug] ?? videos[slug];
      if (video) match.youtubeUrl = `https://www.youtube.com/watch?v=${video}`;
    }
  }
  return before !== JSON.stringify(data);
}

/** Cheap metadata refresh, independent of scores, API keys and article generation. */
export async function refreshArchiveLinks(): Promise<boolean> {
  const file = path.resolve("src/data/match-recaps.json");
  if (!fs.existsSync(file)) return false;
  const data = MatchRecapsDataSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const seed = JSON.parse(fs.readFileSync(path.resolve("src/data/raw-capcom-seed.json"), "utf8"));
  const official = Object.fromEntries((seed.data?.schedules ?? []).map((section: any) => [section.post_name, section.fields.section.links?.playlist?.url]));
  for (const division of ["s", "f"] as const) for (const section of data.pastSections[division]) {
    if (section.playlistUrl) official[`div-${division}-sec${section.sectionNumber}`] = section.playlistUrl;
  }
  const [videos, playlists] = await Promise.all([fetchSectionVideos(SFL_CURRENT_SEASON), fetchSectionPlaylists(SFL_CURRENT_SEASON, official)]);
  if (!updateArchiveLinks(data, videos, playlists)) return false;
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(MatchRecapsDataSchema.parse(data), null, 2), "utf8");
  console.log("[Archive] Updated visible archive links.");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshArchiveLinks().catch((error) => { console.error(error); process.exitCode = 1; });
}
