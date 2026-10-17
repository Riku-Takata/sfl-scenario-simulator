import sharp from "sharp";
import { writeFileSync } from "fs";

const ogpSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="40%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#facc15" />
      <stop offset="100%" stop-color="#eab308" />
    </linearGradient>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#60a5fa" />
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowOrange" cx="20%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#f97316" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#f97316" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background Base & Glows -->
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glow)" />
  <rect width="1200" height="630" fill="url(#glowOrange)" />

  <!-- Outer Framing Border -->
  <rect x="24" y="24" width="1152" height="582" rx="20" fill="none" stroke="#334155" stroke-width="2" stroke-opacity="0.8" />
  <rect x="28" y="28" width="1144" height="574" rx="16" fill="none" stroke="url(#gold)" stroke-width="1.5" stroke-opacity="0.35" />

  <!-- Badge Top -->
  <g transform="translate(80, 80)">
    <rect width="260" height="42" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
    <text x="130" y="27" font-family="'Noto Sans JP', 'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="18" fill="url(#gold)" text-anchor="middle" letter-spacing="1">
      SFL 2026 Pro-JP
    </text>
  </g>

  <!-- Tagline Badge -->
  <g transform="translate(360, 80)">
    <rect width="320" height="42" rx="8" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" stroke-width="1.5" />
    <text x="160" y="27" font-family="'Noto Sans JP', 'Segoe UI', system-ui, sans-serif" font-weight="800" font-size="16" fill="#93c5fd" text-anchor="middle">
      Division S &amp; Division F 全12チーム
    </text>
  </g>

  <!-- Main Headline Title -->
  <text x="80" y="225" font-family="'Noto Sans JP', 'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="58" fill="#ffffff" letter-spacing="-1">
    順位・プレイオフ突破条件
  </text>
  <text x="80" y="305" font-family="'Noto Sans JP', 'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="62" fill="url(#gold)" letter-spacing="-1">
    シミュレーター
  </text>

  <!-- Subtitle Description -->
  <text x="80" y="380" font-family="'Noto Sans JP', 'Segoe UI', system-ui, sans-serif" font-weight="600" font-size="22" fill="#cbd5e1">
    最新順位表・残り試合の条件分岐シミュレーター・全48選手カルテ・次節予想カード生成
  </text>

  <!-- 4 Feature Pills -->
  <g transform="translate(80, 430)">
    <!-- Pill 1 -->
    <rect x="0" y="0" width="235" height="50" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="117" y="32" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="800" font-size="17" fill="#f8fafc" text-anchor="middle">
      📊 リアルタイム順位計算
    </text>

    <!-- Pill 2 -->
    <rect x="255" y="0" width="235" height="50" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="372" y="32" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="800" font-size="17" fill="#f8fafc" text-anchor="middle">
      🎯 1〜3位突破確率分析
    </text>

    <!-- Pill 3 -->
    <rect x="510" y="0" width="235" height="50" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="627" y="32" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="800" font-size="17" fill="#f8fafc" text-anchor="middle">
      ⚔️ 48選手データ図鑑
    </text>

    <!-- Pill 4 -->
    <rect x="765" y="0" width="275" height="50" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="902" y="32" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="800" font-size="17" fill="#f8fafc" text-anchor="middle">
      📷 予想カード画像出力・共有
    </text>
  </g>

  <!-- Footer Disclaimer -->
  <text x="80" y="555" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="600" font-size="15" fill="#64748b">
    ※当サイトは非公式ファンサイトです。カプコンおよびストリートファイターリーグ公式とは関係ありません。
  </text>
  <text x="1120" y="555" font-family="'Noto Sans JP', system-ui, sans-serif" font-weight="800" font-size="16" fill="url(#primaryGrad)" text-anchor="end">
    sfl-scenario-simulator.vercel.app
  </text>
</svg>
`;

async function run() {
  const buf = Buffer.from(ogpSvg);
  await sharp(buf)
    .png({ quality: 95 })
    .toFile("public/ogp.png");
  console.log("Created public/ogp.png (1200x630)");

  // Apple touch icon (180x180)
  const touchIconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="50%" stop-color="#facc15" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
      <linearGradient id="flame" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ef4444" />
        <stop offset="100%" stop-color="#f97316" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#bg)" />
    <path d="M50 18 L76 34 L76 66 L50 82 L24 66 L24 34 Z" fill="none" stroke="url(#flame)" stroke-width="4" stroke-linejoin="round" />
    <text x="50" y="58" font-family="system-ui, sans-serif" font-weight="900" font-size="28" fill="url(#gold)" text-anchor="middle">SFL</text>
  </svg>
  `;
  await sharp(Buffer.from(touchIconSvg))
    .png()
    .toFile("public/apple-touch-icon.png");
  console.log("Created public/apple-touch-icon.png (180x180)");
}

run();
