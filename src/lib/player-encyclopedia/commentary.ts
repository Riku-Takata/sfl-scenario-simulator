/**
 * 選手特徴の解説文 (データに基づく定型生成)
 *
 * SFL公式戦・SFL公式stats・start.gg プレミア大会・Buckler ランクマの各集計から、
 * 根拠となる数値とサンプル数を添えて段落を組み立てる。データが無い段落は出さない。
 */
import { formatCharName } from "./constants";
import type { PlayerEncyclopediaEntry } from "./types";

export interface CommentarySection {
  heading: string;
  text: string;
  /** 根拠の出典 */
  sources: string[];
}

function pct(won: number, total: number): string {
  return total > 0 ? `${Math.round((won / total) * 100)}%` : "-";
}

function rankAmong<T>(list: T[], target: T, value: (x: T) => number | null): { rank: number; size: number } | null {
  const mine = value(target);
  if (mine == null) return null;
  const values = list.map(value).filter((v): v is number => v != null);
  return { rank: values.filter((v) => v > mine).length + 1, size: values.length };
}

function overview(p: PlayerEncyclopediaEntry, all: PlayerEncyclopediaEntry[]): CommentarySection {
  const parts: string[] = [];
  const sources = ["SFL公式戦"];
  const perf = rankAmong(all, p, (x) => x.tournamentProfile?.performanceRating ?? null);
  if (perf && p.tournamentProfile) {
    const level =
      perf.rank <= 5 ? "リーグ屈指の実績" : perf.rank <= 15 ? "上位クラスの実績" : perf.rank <= 30 ? "中位の実績" : "これから伸ばしたい実績";
    parts.push(
      `直近1年のプレミア大会でのパフォーマンスレーティングはSFL選手${perf.size}人中${perf.rank}位で、${level}です（セット勝率${p.tournamentProfile.sets.rate ?? "-"}%）。`
    );
    sources.push("start.gg");
  }
  if (p.sfl.entry > 0) {
    parts.push(
      `今季のSFLは${p.sfl.entry}試合に出場して${p.sfl.victory}勝${p.sfl.losses}敗、${p.sfl.point}ptを獲得しています（バトル勝率${p.sfl.battleWinRate}%）。`
    );
  } else {
    parts.push("今季のSFLはまだ出場がありません。");
  }
  return { heading: "総評", text: parts.join(""), sources };
}

function tournament(p: PlayerEncyclopediaEntry): CommentarySection | null {
  const t = p.tournamentProfile;
  if (!t || t.eventsCount === 0) return null;
  const parts: string[] = [];
  const best = t.bestResult;
  parts.push(
    `プレミア大会には${t.eventsCount}大会出場し、` +
      (best?.placement != null ? `最高成績は${best.tournamentName}の${best.placement}位。` : "") +
      (t.top8Count > 0 ? `Top8入りは${t.top8Count}回です。` : "Top8入りはまだありません。")
  );
  const notes: string[] = [];
  if (t.decidingGame.total >= 8) notes.push(`最終ゲームまでもつれたセットは${t.decidingGame.won}勝${t.decidingGame.lost}敗`);
  if (t.comeback.total >= 6) notes.push(`第1ゲームを落としたセットからの逆転は${t.comeback.total}回中${t.comeback.won}回`);
  if (t.losersBracket.total >= 8) notes.push(`ルーザーズ側では${t.losersBracket.won}勝${t.losersBracket.lost}敗`);
  if (t.vsSflPlayers.total >= 4) notes.push(`SFL選手との対戦は${t.vsSflPlayers.won}勝${t.vsSflPlayers.lost}敗`);
  if (notes.length) parts.push(`${notes.join("、")}。`);
  if (t.tags.length) parts.push(`SFL選手の中では「${t.tags.slice(0, 3).join("」「")}」が際立ちます。`);
  return { heading: "大会での勝ち方", text: parts.join(""), sources: ["start.gg"] };
}

function playStyle(p: PlayerEncyclopediaEntry): CommentarySection | null {
  const s = p.playStyle;
  if (!s) return null;
  const ranked = s.metrics.filter((m) => m.rank != null && m.percentile != null);
  if (ranked.length === 0) {
    return {
      heading: "試合内のスタイル",
      text: `今季のSFL出場は${s.battles}バトルで、スタイルを判断するにはまだサンプルが不足しています。`,
      sources: ["SFL公式stats"],
    };
  }
  const extremes = [...ranked]
    .sort((a, b) => Math.abs((b.percentile ?? 0.5) - 0.5) - Math.abs((a.percentile ?? 0.5) - 0.5))
    .slice(0, 3)
    .map((m) => `${m.label} ${m.unit === "%" ? `${m.value}%` : `${m.value?.toFixed(2)}回/バトル`}（${m.cohortSize}人中${m.rank}位）`);
  const parts = [
    s.tags.length
      ? `SFLの試合内データでは「${s.tags.slice(0, 3).join("」「")}」タイプです。`
      : "SFLの試合内データでは、目立って偏った傾向はありません。",
    `特徴的な数値は${extremes.join("、")}。`,
  ];
  if (s.changes.length) parts.push(`昨季からの変化: ${s.changes[0]}。`);
  parts.push(`（今季${s.battles}バトル時点）`);
  return { heading: "試合内のスタイル", text: parts.join(""), sources: ["SFL公式stats"] };
}

function characters(p: PlayerEncyclopediaEntry): CommentarySection | null {
  const parts: string[] = [];
  const sources: string[] = [];
  const sflChars = p.usedCharacters.filter((c) => c.battlesTotal > 0);
  if (sflChars.length) {
    parts.push(
      `SFLでは${sflChars
        .slice(0, 3)
        .map((c) => `${c.charName}（${c.battlesWon}勝${c.battlesLost}敗）`)
        .join("、")}を使用。`
    );
    sources.push("SFL公式戦");
  }
  const r = p.rankedProfile;
  if (r) {
    const actLine = (act: NonNullable<typeof r.acts.current>) =>
      act.chars
        .slice(0, 3)
        .map(
          (c) =>
            `${formatCharName(c.char)} ${c.n.toLocaleString()}戦（勝率${pct(c.w, c.n)}${c.mr && c.mr > 0 ? `・MR${c.mr}` : ""}）`
        )
        .join("、");
    const cur = r.acts?.current;
    const prev = r.acts?.previous;
    if (cur && cur.chars.length) {
      parts.push(`今のAct（Act ${cur.seasonId}）のランクマは${actLine(cur)}。`);
      if (prev && prev.chars.length) {
        const prevMain = prev.chars[0].char;
        parts.push(
          prevMain === cur.chars[0].char
            ? `1つ前のAct ${prev.seasonId} も${formatCharName(prevMain)}が中心（${prev.chars[0].n.toLocaleString()}戦）で、メインは変わっていません。`
            : `1つ前のAct ${prev.seasonId} は${actLine(prev)}で、メインが${formatCharName(prevMain)}から${formatCharName(cur.chars[0].char)}に移っています。`
        );
      }
    } else {
      const mains = r.characters
        .filter((c) => c.battles > 0)
        .slice(0, 3)
        .map((c) => `${formatCharName(c.char)}${c.mr && c.mr > 0 ? ` MR${c.mr}` : ""}（今季${c.battles}戦）`);
      if (mains.length) parts.push(`ランクマでは${mains.join("、")}。`);
    }
    if (r.risingChars.length) {
      parts.push(
        `直近14日は${r.risingChars.map((c) => `${formatCharName(c.char)}の割合が${c.priorShare}%→${c.recentShare}%`).join("、")}と増えており、SFLでの起用候補になり得ます。`
      );
    }
    if (r.mrTrend.length >= 2 && r.mainChar) {
      const first = r.mrTrend[0];
      const last = r.mrTrend[r.mrTrend.length - 1];
      const diff = last.mr - first.mr;
      parts.push(`${formatCharName(r.mainChar)}のMRは${first.date}以降で${diff >= 0 ? "+" : ""}${diff}。`);
    }
    sources.push("Buckler");
  }
  const reported = p.tournamentProfile?.characters;
  if (reported && reported.used.length && !r) {
    parts.push(
      `大会で記録されたキャラは${reported.used
        .slice(0, 2)
        .map((c) => `${formatCharName(c.charKey)}（${c.games}ゲーム）`)
        .join("、")}。`
    );
    sources.push("start.gg");
  }
  return parts.length ? { heading: "キャラクター", text: parts.join(""), sources } : null;
}

function matchupHints(p: PlayerEncyclopediaEntry): CommentarySection | null {
  const parts: string[] = [];
  const sources: string[] = [];
  if (p.sfl.homeEntries + p.sfl.awayEntries > 0) {
    parts.push(
      `HOME（後出し）は${p.sfl.homeEntries}戦${p.sfl.homeWins}勝、AWAY（先出し）は${p.sfl.awayEntries}戦${p.sfl.awayWins}勝。`
    );
    sources.push("SFL公式戦");
  }
  if (p.positions.anchor.entries > 0) {
    parts.push(`大将戦は${p.positions.anchor.entries}戦${p.positions.anchor.wins}勝。`);
  }
  const vs = p.rankedProfile?.mainVsChar ?? [];
  if (vs.length >= 3 && p.rankedProfile?.mainChar) {
    const sorted = [...vs].sort((a, b) => a.w / a.n - b.w / b.n);
    const weak = sorted.slice(0, 2);
    const strong = sorted.slice(-2).reverse();
    parts.push(
      `ランクマの${formatCharName(p.rankedProfile.mainChar)}では、${strong
        .map((v) => `${formatCharName(v.char)}に${pct(v.w, v.n)}`)
        .join("・")}と得意な一方、${weak
        .map((v) => `${formatCharName(v.char)}は${pct(v.w, v.n)}`)
        .join("・")}にとどまります（各${Math.min(...vs.map((v) => v.n))}戦以上）。`
    );
    sources.push("Buckler");
  }
  return parts.length ? { heading: "起用と対策のヒント", text: parts.join(""), sources } : null;
}

export function buildCommentary(
  p: PlayerEncyclopediaEntry,
  all: PlayerEncyclopediaEntry[]
): CommentarySection[] {
  return [overview(p, all), tournament(p), playStyle(p), characters(p), matchupHints(p)].filter(
    (s): s is CommentarySection => s != null
  );
}
