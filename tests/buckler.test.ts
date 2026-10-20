import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDia,
  normalizePlay,
  normalizeReplay,
  type BucklerMatch,
  type BucklerSnapshot,
} from "../src/lib/buckler/records";
import { buildBucklerProfile, pickDiaBlock } from "../src/lib/buckler/aggregate";
import {
  BucklerAuthError,
  BucklerBudgetError,
  BucklerClient,
} from "../scripts/buckler/client";
import { jstDate, recentMonths } from "../scripts/buckler/sync";

const ME = "1000000001";

function replay(meIsP1: boolean, myRounds: number[], oppSid = "1000000099") {
  const me = {
    player: { short_id: Number(ME), fighter_id: "Me" },
    character_tool_name: "gouki",
    battle_input_type: 0,
    master_rating: 2000,
    league_point: 30000,
    round_results: myRounds,
  };
  const opp = {
    player: { short_id: Number(oppSid), fighter_id: "SomeoneElse" },
    character_tool_name: "deejay",
    battle_input_type: 1,
    master_rating: 1900,
    league_rank: 36,
    round_results: myRounds.map((r) => (r === 0 ? 1 : 0)),
  };
  return {
    replay_id: "R1",
    replay_battle_type: 1,
    uploaded_at: 1_790_000_000,
    player1_info: meIsP1 ? me : opp,
    player2_info: meIsP1 ? opp : me,
  };
}

test("normalizeReplay: 自分側の判定・勝敗・相手の個人情報を残さない", () => {
  for (const meIsP1 of [true, false]) {
    const m = normalizeReplay(replay(meIsP1, [0, 1, 6]), ME, new Map());
    assert.ok(m);
    assert.equal(m.myChar, "gouki_akuma");
    assert.equal(m.oppChar, "dee_jay");
    assert.equal(m.won, true);
    assert.equal(m.roundsWon, 2);
    assert.equal(m.roundsLost, 1);
    assert.equal(m.oppSflKey, null);
    assert.ok(!JSON.stringify(m).includes("SomeoneElse"), "相手の名前を保存しない");
    assert.ok(!JSON.stringify(m).includes("1000000099"), "相手のIDを保存しない");
  }
  const vsPro = normalizeReplay(replay(true, [0, 0]), ME, new Map([["1000000099", "kawano"]]));
  assert.equal(vsPro?.oppSflKey, "kawano");
  assert.equal(vsPro?.won, false);
  assert.equal(normalizeReplay(replay(true, [1, 1]), "999", new Map()), null);
});

test("normalizePlay: キャラ別成績・対キャラ・行動傾向", () => {
  const snap = normalizePlay(
    {
      fighter_banner_info: { favorite_character_tool_name: "cviper" },
      play: {
        current_season_id: 13,
        battle_stats: { drive_parry: 1.5, label: "x" as unknown as number },
        character_league_infos: [
          { character_tool_name: "cviper", is_played: true, league_info: { league_rank: 36, master_rating: 2367, league_point: 289305 } },
          { character_tool_name: "ryu", is_played: false, league_info: {} },
          { character_tool_name: "deejay", is_played: true, league_info: { league_rank: 36, master_rating: 1766 } },
        ],
        character_win_rates: [
          { character_tool_name: "all", battle_count: 2100, win_count: 1400 },
          { character_tool_name: "cviper", battle_count: 2000, win_count: 1300 },
          { character_tool_name: "deejay", battle_count: 89, win_count: 59 },
        ],
        character_win_rates_by_rival_character: [
          {
            character_tool_name: "cviper",
            rival_character_win_rates: [
              { rival_character_tool_name: "all", battle_count: 2000, win_count: 1300 },
              { rival_character_tool_name: "honda", battle_count: 30, win_count: 20 },
              { rival_character_tool_name: "ryu", battle_count: 0, win_count: 0 },
            ],
          },
        ],
      },
    },
    "2026-10-20",
    "2026-10-20T00:00:00Z"
  );
  assert.deepEqual(snap.characters.map((c) => c.char), ["cviper", "dee_jay"]);
  assert.equal(snap.characters[0].mr, 2367);
  assert.equal(snap.characters[1].battles, 89);
  assert.deepEqual(snap.vsChar, { cviper: { ehonda: { n: 30, w: 20 } } });
  assert.deepEqual(snap.battleStats, { drive_parry: 1.5 });
  assert.equal(snap.favoriteChar, "cviper");
});

test("normalizeDia: 位置で対応付け・0..1 に換算・列順の違いを吸収", () => {
  const dia = normalizeDia(
    {
      diaData: {
        c: {
          ci_sort: {
            "36": {
              opponent_header: [{ tool_name: "ken" }, { tool_name: "ryu" }],
              records: [
                { tool_name: "ryu", values: [{ val: "4.500" }, { val: "-" }] },
                { tool_name: "ken", values: [{ val: "-" }, { val: "5.500" }] },
              ],
            },
          },
        },
      },
    },
    "202609",
    "dia_master"
  );
  const blk = pickDiaBlock(dia);
  assert.ok(blk);
  assert.equal(blk.key, "36");
  assert.deepEqual(blk.chars, ["ryu", "ken"]);
  // 行キャラ順の正方行列: ryu vs ken = 0.45, ken vs ryu = 0.55
  assert.deepEqual(blk.matrix, [
    [null, 0.45],
    [0.55, null],
  ]);
});

function m(partial: Partial<BucklerMatch>): BucklerMatch {
  return {
    id: String(Math.random()),
    t: 0,
    mode: 1,
    myChar: "cviper",
    myInput: 0,
    myMr: 2300,
    myLp: null,
    oppChar: "ryu",
    oppInput: 0,
    oppMr: 2200,
    oppLeague: 36,
    oppSflKey: null,
    won: true,
    roundsWon: 2,
    roundsLost: 0,
    ...partial,
  };
}

test("buildBucklerProfile: 期間別の活動量・MR推移・最近増えたキャラ", () => {
  const now = 1_790_000_000;
  const day = 86_400;
  const matches: BucklerMatch[] = [];
  // 15〜40日前: C.ヴァイパーのみ
  for (let i = 0; i < 30; i++) matches.push(m({ t: now - (15 + i) * day, myMr: 2300 }));
  // 直近14日: ディージェイ 12戦 + C.ヴァイパー 13戦
  for (let i = 0; i < 12; i++) matches.push(m({ t: now - i * day - 60, myChar: "dee_jay", won: false }));
  for (let i = 0; i < 13; i++) matches.push(m({ t: now - i * day - 120, myMr: 2310 + i, mode: i % 2 ? 1 : 4 }));
  const snap: BucklerSnapshot = {
    date: "2026-10-20",
    fetchedAt: "",
    seasonId: 13,
    favoriteChar: "cviper",
    characters: [{ char: "cviper", leagueRank: 36, lp: 1, mr: 2367, mrRanking: 25, battles: 2000, wins: 1300 }],
    vsChar: { cviper: { ryu: { n: 40, w: 30 }, ken: { n: 5, w: 5 } } },
    battleStats: { drive_parry: 1.5, secret_internal: 1 },
  };
  const p = buildBucklerProfile("fuudo", matches, [snap], now);
  assert.ok(p);
  assert.equal(p.mainChar, "cviper");
  assert.equal(p.last7Days.matches, 7 + 7);
  assert.equal(p.last30Days.byMode.custom > 0, true);
  assert.deepEqual(p.risingChars.map((c) => c.char), ["dee_jay"]);
  assert.ok(p.mrTrend.length > 0);
  assert.deepEqual(p.mainVsChar, [{ char: "ryu", n: 40, w: 30 }]);
  assert.deepEqual(p.battleStats, { drive_parry: 1.5 }, "公開対象の行動傾向のみ");
  assert.equal(p.storedMatches, matches.length);
  assert.equal(buildBucklerProfile("x", [], [], now), null);
});

test("jstDate / recentMonths", () => {
  assert.equal(jstDate(Date.UTC(2026, 9, 19, 16, 0)), "2026-10-20");
  assert.deepEqual(recentMonths(3, new Date(Date.UTC(2026, 0, 15))), ["202512", "202511", "202510"]);
});

function mockFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
const FAST = { minDelayMs: 0, jitterMs: 0, maxRequests: 10 };

test("BucklerClient: buildId の再取得・未ログイン検知・未公開月・上限", async () => {
  let build = "OLD";
  const mock = mockFetch((url) => {
    if (url.endsWith("/buckler/ja-jp")) return html(`<script>{"buildId":"${build}"}</script>`);
    if (url.includes("/_next/data/OLD/")) {
      build = "NEW";
      return new Response("", { status: 404 });
    }
    if (url.includes("/_next/data/NEW/") && url.includes("profile/1/play"))
      return json({ pageProps: { common: { statusCode: 200, loginUser: { id: 1 } }, play: {} } });
    if (url.includes("logged-out")) return json({ pageProps: { common: { statusCode: 403, loginUser: false } } });
    if (url.includes("/api/en/stats/")) return new Response("", { status: 403 });
    return new Response("", { status: 500 });
  });
  try {
    const client = new BucklerClient("buckler_id=x", FAST);
    const pp = await client.pageProps<{ play: object }>("profile/1/play");
    assert.deepEqual(pp.play, {});
    assert.ok(mock.calls.some((u) => u.includes("/_next/data/NEW/")), "404 で buildId を取り直す");

    await assert.rejects(() => client.pageProps("logged-out"), BucklerAuthError);
    assert.equal(await client.stats("dia_master", "202610"), null);

    const tiny = new BucklerClient("buckler_id=x", { ...FAST, maxRequests: 1 });
    await tiny.stats("dia_master", "202610");
    await assert.rejects(() => tiny.stats("dia_master", "202609"), BucklerBudgetError);
  } finally {
    mock.restore();
  }
  assert.throws(() => new BucklerClient("", FAST), BucklerAuthError);
});
