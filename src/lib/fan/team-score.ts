/**
 * 1つの集計窓について、全対象チームのスコア・信頼区間・順位帯・品質を出す。
 *
 * 返す値は開示制御の前のもの。公開するスナップショットを作るときは、
 * 件数に disclosure.ts を必ず通す (scripts/fan/score.ts の責務)。
 */
import { contributionsByAuthor, countTeam } from "./aggregate";
import type { ScoreBaseline } from "./baseline";
import { bootstrapScores, confidenceInterval } from "./bootstrap";
import { assessQuality } from "./quality";
import { assignRankBands } from "./rank-band";
import {
  engagementCap,
  normalizeComponents,
  rawComponents,
  totalScore,
  type NormalizedComponents,
  type ScoringContext,
} from "./scoring";
import { hashSeed } from "./stats";
import type { ClassifiedPost, QualityStatus, TeamCounts } from "./types";

export interface TeamWindowInput {
  teamKey: string;
  posts: readonly ClassifiedPost[];
  truncated: boolean;
  classificationFailures: number;
}

export interface TeamScore {
  teamKey: string;
  quality: QualityStatus;
  counts: TeamCounts;
  /** insufficient のときは以下すべて null */
  score: number | null;
  ci: [number, number] | null;
  rank: number | null;
  rankBand: string | null;
  contribution: NormalizedComponents | null;
  components: (NormalizedComponents & { purityRaw: number | null }) | null;
  engagementAvailable: boolean;
}

export function scoreWindow(input: {
  /** ブートストラップのシードに使う (例: "7d:2026-10-30")。同じ入力なら同じ結果になる */
  windowKey: string;
  teams: readonly TeamWindowInput[];
  baseline: ScoreBaseline;
  iterations?: number;
}): TeamScore[] {
  const authorsByTeam = input.teams.map((team) => contributionsByAuthor(team.posts));
  const ctx: ScoringContext = {
    purityPriorMean: input.baseline.purityPriorMean,
    engagementRef: input.baseline.engagementRef,
    engagementCap: engagementCap(authorsByTeam),
  };

  const results: TeamScore[] = input.teams.map((team, i) => {
    const authors = authorsByTeam[i];
    const counts = countTeam(authors);
    const quality = assessQuality({
      relevant: counts.relevant,
      uncertain: counts.uncertain,
      classificationFailures: team.classificationFailures,
      truncated: team.truncated,
      baselineProvisional: input.baseline.provisional,
    });
    const raw = rawComponents(authors, ctx);
    if (quality === "insufficient") {
      return {
        teamKey: team.teamKey,
        quality,
        counts,
        score: null,
        ci: null,
        rank: null,
        rankBand: null,
        contribution: null,
        components: null,
        engagementAvailable: raw.engagementAvailable,
      };
    }

    const components = normalizeComponents(raw, input.baseline);
    const { score, contribution } = totalScore(components);
    const replicates = bootstrapScores(authors, ctx, input.baseline, {
      seed: hashSeed(`${input.windowKey}:${team.teamKey}`),
      iterations: input.iterations,
    });
    return {
      teamKey: team.teamKey,
      quality,
      counts,
      score,
      ci: confidenceInterval(replicates),
      rank: null,
      rankBand: null,
      contribution,
      components: { ...components, purityRaw: raw.purityRaw },
      engagementAvailable: raw.engagementAvailable,
    };
  });

  const ranked = assignRankBands(
    results.flatMap((r) => (r.score !== null && r.ci !== null ? [{ teamKey: r.teamKey, score: r.score, ci: r.ci }] : []))
  );
  for (const r of ranked) {
    const team = results.find((t) => t.teamKey === r.teamKey)!;
    team.rank = r.rank;
    team.rankBand = r.bandLabel;
  }
  return results;
}
