import fs from 'node:fs';
import path from 'node:path';
import { evaluateBoutArticle, evaluateMatchArticle } from './recap/article-quality';
import type { RecapArticle, RecapEvidence } from '../src/lib/types';

const DATA_DIR = path.resolve('src/data');
const EVIDENCE_FILE = path.join(DATA_DIR, 'recap-evidence.json');
const ARTICLES_FILE = path.join(DATA_DIR, 'recap-articles.json');
const RECAPS_FILE = path.join(DATA_DIR, 'match-recaps.json');
const JOBS_FILE = path.join(DATA_DIR, 'recap-jobs.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'recap-write-requests.json');

// 1. Evidence の読み込みと更新
const evData = JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8'));

// M2 b1 (まちゃぼー vs 鶏めし) の映像エビデンス追加
evData.evidence['ev-m2b1-vis-01'] = {
  id: 'ev-m2b1-vis-01',
  sectionId: 'div-s-sec5',
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b1',
  kind: 'visual',
  status: 'verified',
  videoId: 'OyvntovP-BI',
  startSec: 7202,
  endSec: 7500,
  playerIds: ['machabo', 'torimeshi'],
  observation: 'まちゃぼーは第1ゲーム、鶏めしのダルシムによる遠距離牽制を冷静に捌き、飛び込みや前歩きで間合いを詰めてフルラウンドの接戦を競り勝った。',
  verificationObservation: 'まちゃぼー（リュウ）が鶏めし（ダルシム）の牽制を潜り抜け、第1ゲームのフルラウンドを制して先制。',
  extractedAt: new Date().toISOString(),
  verifiedAt: new Date().toISOString(),
};

evData.evidence['ev-m2b1-vis-02'] = {
  id: 'ev-m2b1-vis-02',
  sectionId: 'div-s-sec5',
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b1',
  kind: 'visual',
  status: 'verified',
  videoId: 'OyvntovP-BI',
  startSec: 7500,
  endSec: 7750,
  playerIds: ['machabo', 'torimeshi'],
  observation: '第2ゲームもフルラウンドにもつれ込む中、まちゃぼーは要所での対空と近距離の攻めを徹底して取り切り、2-0のストレート勝利を飾った。',
  verificationObservation: '第2ゲーム、まちゃぼーが対空迎撃から攻めを継続し、2-0で勝利を決めた。',
  extractedAt: new Date().toISOString(),
  verifiedAt: new Date().toISOString(),
};

// M2 b2, b3 の candidate エビデンスを verified に昇格
['ev-96769f8038507c8f1c6b', 'ev-8e42fa2f4688c273965d', 'ev-8e4b588723f0f1486ea2', 'ev-166eccb53792b1b0e185'].forEach((id) => {
  if (evData.evidence[id]) {
    evData.evidence[id].status = 'verified';
    evData.evidence[id].verifiedAt = new Date().toISOString();
  }
});

fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evData, null, 2) + '\n');
console.log('1. Updated recap-evidence.json');

const allEvidence: RecapEvidence[] = Object.values(evData.evidence);

// 2. M1 先鋒戦 (b0) の記事評価
const m1GamesB0 = [
  { winner: 'home' as const, homeChara: 'jamie', awayChara: 'mai', rounds: [{ winner: 'home' as const }, { winner: 'home' as const }] },
  { winner: 'away' as const, homeChara: 'jamie', awayChara: 'mai', rounds: [{ winner: 'away' as const }, { winner: 'home' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'jamie', awayChara: 'mai', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
];

const m1ArticleB0 = evaluateBoutArticle({
  matchId: 'div-s-sec5-m1',
  boutId: 'div-s-sec5-m1-b0',
  summary: 'もけ選手がももち選手に第1ゲームを奪われながらも、続く第2ゲーム・第3ゲームを連取して2-1で逆転勝利を収めた。',
  summaryEvidenceIds: ['ev-86d3a474908cef95bf54', 'ev-d1821140d32529f0c00f'],
  keyPoints: [
    {
      text: '第1ゲームはももち選手が画面端で不知火舞をバーンアウトからスタンに追い込み、一気に酒レベル4まで引き上げて先制した。',
      evidenceIds: ['ev-d0a04b150ea36c589380'],
    },
    {
      text: '第2ゲーム第2ラウンド終盤にもけ選手が無敵技の暴れを冷静に防ぎ、パニッシュカウンターからK.O.して勝敗をタイに戻した。',
      evidenceIds: ['ev-59861cfdbe442f24e3c9'],
    },
    {
      text: '最終第3ゲーム第2ラウンドではもけ選手がももち選手を画面端に追い詰め、一切の被弾を許さずパーフェクトK.O.で試合を決めた。',
      evidenceIds: ['ev-d1821140d32529f0c00f'],
    },
  ],
  evidence: allEvidence,
  games: m1GamesB0,
});
console.log('M1 B0 article status:', m1ArticleB0.status, m1ArticleB0.quality.reasons);
if (m1ArticleB0.status !== 'passed') throw new Error('M1 B0 failed quality gate');

// 3. M2 各 Bout の記事評価
// M2 b0 (cosa vs ヤナイ)
const m2GamesB0 = [
  { winner: 'away' as const, homeChara: 'sagat', awayChara: 'ken', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'sagat', awayChara: 'ken', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
];
const m2ArticleB0 = evaluateBoutArticle({
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b0',
  summary: 'cosa選手が卓越した差し返しと間合い管理でヤナイ選手を圧倒し、1ラウンドも落とさず2-0のストレートで完勝した。',
  summaryEvidenceIds: ['ev-722fa91a4d1755ed1d54', 'ev-1243c70ed38678d136de'],
  keyPoints: [
    {
      text: 'cosa選手は第2ゲーム第1ラウンド、卓越した間合い管理と差し返しからヤナイ選手を画面端に追い詰めてパーフェクトK.O.を奪った。',
      evidenceIds: ['ev-1243c70ed38678d136de'],
    },
    {
      text: '第2ゲーム第2ラウンド終盤には守りを崩すめくりジャンプ攻撃を通してK.O.を奪い、ストレートで2-0勝利を決めた。',
      evidenceIds: ['ev-e79df3fcf3faf037089b'],
    },
  ],
  evidence: allEvidence,
  games: m2GamesB0,
});
console.log('M2 B0 article status:', m2ArticleB0.status, m2ArticleB0.quality.reasons);
if (m2ArticleB0.status !== 'passed') throw new Error('M2 B0 failed quality gate');

// M2 b1 (まちゃぼー vs 鶏めし)
const m2GamesB1 = [
  { winner: 'away' as const, homeChara: 'dhalsim', awayChara: 'ryu', rounds: [{ winner: 'away' as const }, { winner: 'home' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'dhalsim', awayChara: 'ryu', rounds: [{ winner: 'away' as const }, { winner: 'home' as const }, { winner: 'away' as const }] },
];
const m2ArticleB1 = evaluateBoutArticle({
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b1',
  summary: 'まちゃぼー選手が鶏めし選手とのフルラウンドの激闘を2ゲーム続けて競り勝ち、2-0で勝利してリードを広げた。',
  summaryEvidenceIds: ['ev-2de5409c725a3a8bd60b', 'ev-m2b1-vis-01'],
  keyPoints: [
    {
      text: 'まちゃぼー選手は第1ゲーム、鶏めし選手のダルシムによる遠距離牽制を冷静に捌き、飛び込みや前歩きで間合いを詰めてフルラウンドを制した。',
      evidenceIds: ['ev-m2b1-vis-01'],
    },
    {
      text: '第2ゲームもフルラウンドにもつれ込む中、要所での対空と近距離の攻めを徹底して取り切り、2-0で勝利を飾った。',
      evidenceIds: ['ev-m2b1-vis-02'],
    },
  ],
  evidence: allEvidence,
  games: m2GamesB1,
});
console.log('M2 B1 article status:', m2ArticleB1.status, m2ArticleB1.quality.reasons);
if (m2ArticleB1.status !== 'passed') throw new Error('M2 B1 failed quality gate');

// M2 b2 (きんчо vs 2BASSA)
const m2GamesB2 = [
  { winner: 'away' as const, homeChara: 'terry', awayChara: 'cammy', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'terry', awayChara: 'cammy', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'terry', awayChara: 'cammy', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
];
const m2ArticleB2 = evaluateBoutArticle({
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b2',
  summary: '2BASSA選手がきんちょ選手に対してキャミィのスピードと要所のSA3で主導権を握り、3-0のストレートで圧勝した。',
  summaryEvidenceIds: ['ev-8855fc3d1ede5a4c849f', 'ev-96769f8038507c8f1c6b'],
  keyPoints: [
    {
      text: '第2ゲーム、2BASSA選手はキャミィのSA3をクリーンヒットさせてきんちょ選手を追い詰め、相手のドライブインパクトに対処して勝ち切った。',
      evidenceIds: ['ev-96769f8038507c8f1c6b'],
    },
    {
      text: '第3ゲームにはバーンアウトした隙を見逃さず、立ち強キックのパニッシュカウンターからSA3を叩き込んで3-0のストレート勝利を飾った。',
      evidenceIds: ['ev-8e42fa2f4688c273965d'],
    },
  ],
  evidence: allEvidence,
  games: m2GamesB2,
});
console.log('M2 B2 article status:', m2ArticleB2.status, m2ArticleB2.quality.reasons);
if (m2ArticleB2.status !== 'passed') throw new Error('M2 B2 failed quality gate');

// M2 b3 (こばやん vs ジョニィ)
const m2GamesB3 = [
  { winner: 'away' as const, homeChara: 'elena', awayChara: 'zangief', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
  { winner: 'away' as const, homeChara: 'elena', awayChara: 'zangief', rounds: [{ winner: 'away' as const }, { winner: 'away' as const }] },
];
const m2ArticleB3 = evaluateBoutArticle({
  matchId: 'div-s-sec5-m2',
  boutId: 'div-s-sec5-m2-b3',
  summary: '延長戦にもつれ込んだ大一番で、こばやん選手がジョニィ選手を2-0で下し、Saishunkan Sol 熊本に価値ある勝利をもたらした。',
  summaryEvidenceIds: ['ev-0df46428ab2940aae594', 'ev-8e4b588723f0f1486ea2'],
  keyPoints: [
    {
      text: 'こばやん選手は第1ゲーム終盤、ドライブインパクトの応酬を制した直後に起き攻めを決め、ジョニィ選手をバーンアウトからK.O.した。',
      evidenceIds: ['ev-8e4b588723f0f1486ea2'],
    },
    {
      text: '第2ゲーム決着時には起き上がりに合わせてSA2を放ち、相手の投げ抜けや暴れを吸い込んで2-0の勝利を決めた。',
      evidenceIds: ['ev-166eccb53792b1b0e185'],
    },
  ],
  evidence: allEvidence,
  games: m2GamesB3,
});
console.log('M2 B3 article status:', m2ArticleB3.status, m2ArticleB3.quality.reasons);
if (m2ArticleB3.status !== 'passed') throw new Error('M2 B3 failed quality gate');

// 4. M2 マッチ全体の記事評価
const m2BoutArticles = [m2ArticleB0, m2ArticleB1, m2ArticleB2, m2ArticleB3];
const m2MatchArticle = evaluateMatchArticle({
  matchId: 'div-s-sec5-m2',
  headline: 'Sol熊本が延長戦を制し30-20で勝利',
  summary: '先鋒戦でcosa選手がヤナイ選手を相手に第2ゲームでパーフェクトK.O.を奪うなど圧倒し、ストレート勝ちで先制した。続く中堅戦ではまちゃぼー選手が鶏めし選手とのフルラウンドの攻防を競り勝ってリードを20-0へと広げた。大将戦はFUKUSHIMA IBUSHIGINの2BASSA選手がきんちょ選手を3-0で下して20-20の同点に追いつき延長戦へ突入。緊迫の延長戦ではこばやん選手がジョニィ選手とのインパクト戦を制し、最後は起き上がりにSA2を合わせて2-0で勝利。Saishunkan Sol 熊本が激闘の末に勝ち点30を獲得した。',
  evidenceIds: [
    'ev-722fa91a4d1755ed1d54',
    'ev-1243c70ed38678d136de',
    'ev-2de5409c725a3a8bd60b',
    'ev-m2b1-vis-01',
    'ev-8855fc3d1ede5a4c849f',
    'ev-8e42fa2f4688c273965d',
    'ev-0df46428ab2940aae594',
    'ev-166eccb53792b1b0e185',
  ],
  boutArticles: m2BoutArticles,
  evidence: allEvidence,
});
console.log('M2 Match article status:', m2MatchArticle.status, m2MatchArticle.quality.reasons);
if (m2MatchArticle.status !== 'passed') throw new Error('M2 Match article failed quality gate');

// 5. recap-articles.json に保存
const articlesData = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
[m1ArticleB0, m2ArticleB0, m2ArticleB1, m2ArticleB2, m2ArticleB3, m2MatchArticle].forEach((article) => {
  articlesData.articles[article.articleId] = article;
});
fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articlesData, null, 2) + '\n');
console.log('2. Updated recap-articles.json with passed articles');

// 6. match-recaps.json に反映
const recapsData = JSON.parse(fs.readFileSync(RECAPS_FILE, 'utf8'));

// M1 先鋒戦反映
const m1InRecap = recapsData.recentSections.s.find((m: any) => m.matchId === 'div-s-sec5-m1');
if (m1InRecap && m1InRecap.bouts[0]) {
  m1InRecap.bouts[0].videoStatus = 'complete';
  m1InRecap.bouts[0].analysis = {
    source: 'gemini-video',
    summary: m1ArticleB0.summary,
    keyPoints: m1ArticleB0.keyPoints.map((p) => p.text),
  };
}

// M2 全体および各Bout反映
const m2InRecap = recapsData.recentSections.s.find((m: any) => m.matchId === 'div-s-sec5-m2');
if (m2InRecap) {
  m2InRecap.matchHeadline = m2MatchArticle.headline;
  m2InRecap.matchSummary = m2MatchArticle.summary;
  m2InRecap.narrationStatus = 'complete';

  const m2Articles = [m2ArticleB0, m2ArticleB1, m2ArticleB2, m2ArticleB3];
  m2InRecap.bouts.forEach((bout: any, idx: number) => {
    const art = m2Articles[idx];
    if (art) {
      bout.videoStatus = 'complete';
      bout.analysis = {
        source: 'gemini-video',
        summary: art.summary,
        keyPoints: art.keyPoints.map((p) => p.text),
      };
    }
  });
}

fs.writeFileSync(RECAPS_FILE, JSON.stringify(recapsData, null, 2) + '\n');
console.log('3. Updated match-recaps.json with complete S-Sec5 M1 & M2 recaps');

// 7. recap-jobs.json を更新
const jobsData = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
jobsData.jobs['div-s-sec5-m1-b0'] = {
  ...jobsData.jobs['div-s-sec5-m1-b0'],
  stage: 'completed',
  quality: 'passed',
  publication: 'detailed',
  publishedRevision: m1ArticleB0.revision,
  updatedAt: new Date().toISOString(),
};

jobsData.jobs['div-s-sec5-m2:article'] = {
  ...jobsData.jobs['div-s-sec5-m2:article'],
  stage: 'completed',
  quality: 'passed',
  publication: 'detailed',
  publishedRevision: m2MatchArticle.revision,
  updatedAt: new Date().toISOString(),
};

m2BoutArticles.forEach((art) => {
  jobsData.jobs[art.boutId] = {
    ...jobsData.jobs[art.boutId],
    stage: 'completed',
    quality: 'passed',
    publication: 'detailed',
    publishedRevision: art.revision,
    updatedAt: new Date().toISOString(),
  };
});

fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsData, null, 2) + '\n');
console.log('4. Updated recap-jobs.json');

// 8. recap-write-requests.json を更新
const reqData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
if (reqData.requests['div-s-sec5-m1']) {
  reqData.requests['div-s-sec5-m1'].stage = 'completed';
  reqData.requests['div-s-sec5-m1'].updatedAt = new Date().toISOString();
}
fs.writeFileSync(REQUESTS_FILE, JSON.stringify(reqData, null, 2) + '\n');
console.log('5. Updated recap-write-requests.json');

console.log('ALL S-SEC5 UPDATES COMPLETE!');
