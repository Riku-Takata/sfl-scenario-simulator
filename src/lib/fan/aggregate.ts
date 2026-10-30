/**
 * 分類済み投稿 → 著者ごとの寄与 → チームの件数
 *
 * 寄与上限 (設計書 §6.2) をここで適用し、以降の集計・ブートストラップはすべて
 * AuthorContribution を単位にする。
 */
import { MAX_POSTS_PER_AUTHOR, MIN_ENGAGEMENT_AGE_HOURS } from "./config";
import type { AuthorContribution, ClassifiedPost, EngagementCounts, TeamCounts } from "./types";

/**
 * e = log(1 + likes + 2·reposts + replies + quotes)。
 * 1項目でも欠けていれば使わない (null)。
 */
export function engagementValue(counts: EngagementCounts | null): number | null {
  if (!counts) return null;
  const { likes, reposts, replies, quotes } = counts;
  if (likes === null || reposts === null || replies === null || quotes === null) return null;
  return Math.log(1 + likes + 2 * reposts + replies + quotes);
}

/** 投稿直後に観測した値は伸びきっていないので、一定時間経った投稿だけを使う */
function usableEngagement(post: ClassifiedPost): number | null {
  if (post.engagementAgeHours === null || post.engagementAgeHours < MIN_ENGAGEMENT_AGE_HOURS) return null;
  return engagementValue(post.engagement);
}

/**
 * 著者ごとに強度の高い順で最大 k 件だけ残す。unrelated は集計対象外なので先に除く。
 * 同じ強度は投稿日時・投稿IDの順にして結果を決定的にする。
 */
export function capPostsPerAuthor(
  posts: readonly ClassifiedPost[],
  k: number = MAX_POSTS_PER_AUTHOR
): ClassifiedPost[] {
  const byAuthor = new Map<string, ClassifiedPost[]>();
  for (const post of posts) {
    if (post.label === "unrelated") continue;
    const list = byAuthor.get(post.authorKey);
    if (list) list.push(post);
    else byAuthor.set(post.authorKey, [post]);
  }
  const kept: ClassifiedPost[] = [];
  for (const list of byAuthor.values()) {
    list.sort(
      (a, b) =>
        b.supportStrength - a.supportStrength ||
        a.createdAt - b.createdAt ||
        (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0)
    );
    kept.push(...list.slice(0, k));
  }
  return kept;
}

/** 寄与上限を適用して著者ごとにまとめる (著者キー順) */
export function contributionsByAuthor(
  posts: readonly ClassifiedPost[],
  k: number = MAX_POSTS_PER_AUTHOR
): AuthorContribution[] {
  const map = new Map<string, AuthorContribution>();
  for (const post of capPostsPerAuthor(posts, k)) {
    let c = map.get(post.authorKey);
    if (!c) {
      c = {
        authorKey: post.authorKey,
        relevant: 0,
        support: 0,
        neutral: 0,
        criticism: 0,
        uncertain: 0,
        strengths: [],
        engagements: [],
      };
      map.set(post.authorKey, c);
    }
    switch (post.label) {
      case "support": {
        c.relevant++;
        c.support++;
        c.strengths.push(post.supportStrength);
        const e = usableEngagement(post);
        if (e !== null) c.engagements.push(e);
        break;
      }
      case "neutral":
        c.relevant++;
        c.neutral++;
        break;
      case "criticism":
        c.relevant++;
        c.criticism++;
        break;
      case "uncertain":
        c.uncertain++;
        break;
    }
  }
  return [...map.values()].sort((a, b) => (a.authorKey < b.authorKey ? -1 : a.authorKey > b.authorKey ? 1 : 0));
}

export function countTeam(authors: readonly AuthorContribution[]): TeamCounts {
  const counts: TeamCounts = {
    relevant: 0,
    support: 0,
    neutral: 0,
    criticism: 0,
    uncertain: 0,
    uniqueSupporters: 0,
  };
  for (const a of authors) {
    counts.relevant += a.relevant;
    counts.support += a.support;
    counts.neutral += a.neutral;
    counts.criticism += a.criticism;
    counts.uncertain += a.uncertain;
    if (a.support > 0) counts.uniqueSupporters++;
  }
  return counts;
}
