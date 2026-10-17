import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  MatchesDataSchema,
  ScenariosDataSchema,
  StandingsDataSchema,
} from "../src/lib/schema";
import type {
  MatchesData,
  ScenariosData,
  StandingsData,
  TeamScenarioAnalysis,
  TeamStanding,
} from "../src/lib/types";
import { PLAYER_NAME_MAP, TEAM_META_MAP } from "../src/lib/simulator";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");
const STANDINGS_FILE = path.join(DATA_DIR, "standings.json");
const SCENARIOS_FILE = path.join(DATA_DIR, "scenarios.json");

interface GeneratedTeamNarrative {
  statusSummary: string;
  playoffOutlook: string;
  route1Narrative: string;
  route2Narrative: string;
  route3Narrative: string;
  route4Narrative: string;
}

function tryGenerateWithAgyCli(prompt: string): GeneratedTeamNarrative | null {
  const agyBin = process.env.AGY_BIN || "agy";
  if (process.env.DISABLE_AGY === "true") return null;

  try {
    const check = spawnSync(agyBin, ["--version"], {
      encoding: "utf8",
      timeout: 3000,
    });
    if (check.status !== 0 || check.error) {
      return null;
    }

    const res = spawnSync(agyBin, ["-p", prompt], {
      encoding: "utf8",
      timeout: 60000,
    });
    if (res.status !== 0 || !res.stdout) return null;

    const jsonMatch = res.stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as GeneratedTeamNarrative;
  } catch {
    return null;
  }
}

async function tryGenerateWithGeminiApi(
  prompt: string
): Promise<GeneratedTeamNarrative | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text) as GeneratedTeamNarrative;
  } catch {
    return null;
  }
}

function generateRichDataDrivenNarrative(
  team: TeamScenarioAnalysis,
  standing: TeamStanding,
  divStandings: TeamStanding[],
  matchesData: MatchesData
): GeneratedTeamNarrative {
  const meta = TEAM_META_MAP[team.teamKey];
  const rosterNames = (meta?.players || [])
    .map((p) => PLAYER_NAME_MAP[p] || p)
    .filter(Boolean)
    .join("・");

  const playedTeamMatches = matchesData.matches.filter(
    (m) =>
      m.division === team.division &&
      m.played &&
      (m.home === team.teamKey || m.away === team.teamKey)
  );

  let anchorWins = 0;
  let anchorTotal = 0;
  let tiebreakerWins = 0;
  let tiebreakerLosses = 0;
  const recentResults: string[] = [];

  for (const m of playedTeamMatches) {
    const isHome = m.home === team.teamKey;
    const myPt = isHome ? m.homePoint : m.awayPoint;
    const oppPt = isHome ? m.awayPoint : m.homePoint;
    const oppShort =
      TEAM_META_MAP[isHome ? m.away : m.home]?.shortName ||
      (isHome ? m.away : m.home).toUpperCase();
    const won =
      (isHome && m.winner === "home") || (!isHome && m.winner === "away");
    recentResults.push(
      `第${m.sectionNumber}節 vs ${oppShort}（${isHome ? "HOME" : "AWAY"}: ${myPt}-${oppPt}${m.isTiebreaker ? " 延長" : ""}${won ? "勝" : "敗"}）`
    );

    if (m.isTiebreaker) {
      if (won) tiebreakerWins++;
      else tiebreakerLosses++;
    }
    const anchorBout = m.bouts?.find((b) => b.status === 2);
    if (anchorBout) {
      anchorTotal++;
      const myAnchorPt = isHome ? anchorBout.homePoint : anchorBout.awayPoint;
      if (myAnchorPt === 20) anchorWins++;
    }
  }

  const leader = divStandings[0];
  const second = divStandings[1];
  const third = divStandings[2];
  const fourth = divStandings[3];

  const homeAvg =
    standing.entryHome > 0
      ? Math.round((standing.pointHome / standing.entryHome) * 10) / 10
      : 0;
  const awayAvg =
    standing.entryAway > 0
      ? Math.round((standing.pointAway / standing.entryAway) * 10) / 10
      : 0;

  const statusSummary = [
    `${team.teamName}は第${standing.entry}節終了時点で ${standing.victory}勝${standing.entry - standing.victory}敗・合計${standing.point}pt（バトル得失${standing.battleDiff >= 0 ? "+" : ""}${standing.battleDiff} / ラウンド得失${standing.roundDiff >= 0 ? "+" : ""}${standing.roundDiff}）でDivision ${team.division.toUpperCase()} 現在${standing.rank}位です。`,
    `残り${team.remainingMatches}試合（HOME ${team.remainingHome}戦・AWAY ${team.remainingAway}戦）を踏まえた現在のプレイオフ進出確率は${team.probabilities.playoffTop3}%、2位以内確率は${team.probabilities.top2HomeAdvantage}%、1位突破確率は${team.probabilities.firstPlace}%となっています。`,
  ].join("");

  const playoffOutlook =
    standing.rank === 1
      ? `現在2位${second.shortName}（${second.point}pt）に${standing.point - second.point}pt差、4位${fourth.shortName}（${fourth.point}pt）に${standing.point - fourth.point}pt差をつけて首位を走っています。このまま1位で突破すれば、プレイオフ準決勝が免除され決勝へHOME側としてシード直行できます。`
      : standing.rank <= 3
        ? `現在プレイオフ圏内の${standing.rank}位。4位${fourth.shortName}（${fourth.point}pt）との差は${standing.point - fourth.point}pt、首位${leader.shortName}（${leader.point}pt）との差は${leader.point - standing.point}ptです。2位以上で通過すればプレイオフでのHOME優先権を確保できます。`
        : `現在${standing.rank}位ですが、3位ボーダーの${third.shortName}（${third.point}pt）とは${third.point - standing.point}pt差です。SFLは1節で最大40pt獲得できるため、直接対決での30pt〜40pt勝利で一気にプレイオフ圏内へ浮上可能です。`;

  const r1 = team.routes.route1First;
  const route1Narrative = [
    `1位突破（決勝シード直行）の予想目安は合計${r1.targetPoints}pt（残り${team.remainingMatches}試合で+${Math.max(0, r1.targetPoints - standing.point)}pt、目安${r1.requiredWins}勝${r1.requiredLosses}敗）です。`,
    team.remainingHome >= team.remainingAway
      ? `残り${team.remainingMatches}戦のうち後出し有利なHOME戦が${team.remainingHome}試合残っているため、HOME戦で大将戦（20pt）を含め確実に30pt〜40ptを積み上げることが1位突破への鍵となります。`
      : `残り${team.remainingMatches}戦のうちAWAY戦が${team.remainingAway}試合続きますが、先鋒・中堅で着実にポイントを確保し、上位チームとの直接対決で勝利を収めることで1位突破が視野に入ります。`,
  ].join("");

  const r2 = team.routes.route2Second;
  const route2Narrative = [
    `プレイオフ準決勝で「奇数セット目のHOME権」を確保できる2位通過の予想ボーダーは平均【${team.projectedPoints.divisionSecondBorderAvg}pt】。${team.shortName}の2位確保ターゲットは合計【${r2.targetPoints}pt】（残り+${Math.max(0, r2.targetPoints - standing.point)}pt、目安${r2.requiredWins}勝${r2.requiredLosses}敗）となります。`,
    `SFLでは同じプレイオフ進出でも、2位通過と3位通過では準決勝の被せ権（HOME/AWAY）で勝率が大きく変わります。仮に苦しいAWAY戦で敗れる節があっても、0-40や10-30で終わらせず「20-30（延長戦突入）」で20ptを持ち帰る粘り強さを徹底できれば、2位以内確保率（現在${team.probabilities.top2HomeAdvantage}%）を盤石にできます。`,
  ].join("");

  const r3 = team.routes.route3Third;
  const route3Narrative = [
    `プレイオフ進出の最終防衛ラインとなる3位ボーダーは平均【${team.projectedPoints.divisionThirdBorderAvg}pt】。${team.shortName}がPO進出を果たすためのデッドラインは合計【${r3.targetPoints}pt】（残り+${Math.max(0, r3.targetPoints - standing.point)}pt、最低${r3.requiredWins}勝${r3.requiredLosses}敗ペース）です。`,
    `全10節終了時には複数チームが10pt単位で同率に並ぶケースが多発します。その際のタイブレークは「①ポイント → ②獲得バトル得失差 → ③獲得ラウンド得失差」で決まるため、現在のバトル得失差（${standing.battleDiff >= 0 ? "+" : ""}${standing.battleDiff}）・ラウンド得失差（${standing.roundDiff >= 0 ? "+" : ""}${standing.roundDiff}）を1つでもプラスに保つことが生死を分けます。`,
  ].join("");

  const guides = team.nextSectionCheeringGuide;
  const route4Narrative =
    guides.length > 0
      ? [
          `次節（${matchesData.matches.find((m) => m.division === team.division && !m.played)?.sectionTitle || "次節"}）において、${team.shortName}ファンが自チームの試合と並んで注目すべき「他力本願・応援ガイド」です。`,
          ...guides.map(
            (g, i) =>
              `【注目カード${i + 1}: ${g.homeName} vs ${g.awayName}】もっとも${team.shortName}に有利な結果は「${g.recommendedScoreLabel}（${g.recommendedWinnerName}勝利）」です。${g.reason}（このカードの結果次第でPO進出率は ${g.worstPlayoffProb}% 〜 ${g.bestPlayoffProb}% の間で変動します）。`
          ),
        ].join(" ")
      : `次節の結果がプレイオフ進出争いに直結します。ライバルチームが延長戦ではなく本戦10pt以下に抑えられる展開が理想です。`;

  return {
    statusSummary,
    playoffOutlook,
    route1Narrative,
    route2Narrative,
    route3Narrative,
    route4Narrative,
  };
}

export async function generateAndSaveNarratives(): Promise<ScenariosData> {
  const matchesData = MatchesDataSchema.parse(
    JSON.parse(fs.readFileSync(MATCHES_FILE, "utf8"))
  );
  const standingsData = StandingsDataSchema.parse(
    JSON.parse(fs.readFileSync(STANDINGS_FILE, "utf8"))
  );
  const scenariosData = ScenariosDataSchema.parse(
    JSON.parse(fs.readFileSync(SCENARIOS_FILE, "utf8"))
  );

  let usedMode: ScenariosData["generatorMode"] = "deterministic-engine";

  for (const [teamKey, teamAnalysis] of Object.entries(scenariosData.teams)) {
    const divStandings = standingsData.divisions[teamAnalysis.division];
    const standing = divStandings.find((s) => s.key === teamKey)!;

    const prompt = `あなたはストリートファイターリーグ (SFL 2026) の専門アナリストです。以下の厳密な数理シミュレーション＆CPT Top96キャラ相性予測結果JSONに基づき、${teamAnalysis.teamName}のファン向けに熱量と根拠のある解説JSON（キー: statusSummary, playoffOutlook, route1Narrative, route2Narrative, route3Narrative, route4Narrative）を出力してください。\n${JSON.stringify(
      { standing, analysis: teamAnalysis }
    )}`;

    let generated = tryGenerateWithAgyCli(prompt);
    if (generated) {
      usedMode = "agy";
    } else {
      generated = await tryGenerateWithGeminiApi(prompt);
      if (generated) {
        usedMode = "gemini-api";
      } else {
        generated = generateRichDataDrivenNarrative(
          teamAnalysis,
          standing,
          divStandings,
          matchesData
        );
      }
    }

    teamAnalysis.statusSummary = generated.statusSummary;
    teamAnalysis.playoffOutlook = generated.playoffOutlook;
    teamAnalysis.routes.route1First.narrative = generated.route1Narrative;
    teamAnalysis.routes.route2Second.narrative = generated.route2Narrative;
    teamAnalysis.routes.route3Third.narrative = generated.route3Narrative;
    teamAnalysis.routes.route4Cheering.narrative = generated.route4Narrative;
  }

  scenariosData.generatorMode = usedMode;
  scenariosData.updatedAt = new Date().toISOString();

  const validated = ScenariosDataSchema.parse(scenariosData);
  fs.writeFileSync(
    SCENARIOS_FILE,
    JSON.stringify(validated, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `[Step 3] Validated with Zod & generated 48 scenario narratives (12 teams × 4 routes) using mode: ${usedMode}.`
  );
  return validated;
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateAndSaveNarratives().catch((err) => {
    console.error("[Step 3 Error]", err);
    process.exit(1);
  });
}
