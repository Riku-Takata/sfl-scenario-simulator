export interface AffiliateItem {
  id: string;
  category: "controller" | "monitor" | "audio" | "living";
  title: string;
  subtitle: string;
  priceText?: string;
  linkUrl: string;
  badgeText: string;
}

export const DONATION_CONFIG = {
  bmcUrl: "https://buymeacoffee.com/riku.chestnut",
  appealText:
    "シミュレーターが役に立ったら、サーバー・インフラ維持費のサポート（コーヒー1杯分）をいただけると励みになります！",
};

export const AFFILIATE_ITEMS: AffiliateItem[] = [
  {
    id: "leverless-standard",
    category: "controller",
    title: "競技用 薄型レバーレスコントローラー",
    subtitle:
      "SF6のインパクト返し・対空反応を極限まで引き上げる超低遅延スイッチ＆SOCDクリーナー搭載。",
    priceText: "¥18,900〜",
    linkUrl: "https://amzn.to/example-leverless",
    badgeText: "対戦・大会仕様",
  },
  {
    id: "esports-earphone",
    category: "audio",
    title: "プロゲーミングイヤホン（遮音・定位性重視）",
    subtitle:
      "技の発生音やドライブラッシュの予兆を聞き逃さない競技用チューニング。配信視聴にも最適。",
    priceText: "¥6,800〜",
    linkUrl: "https://amzn.to/example-earphone",
    badgeText: "観戦・プレイ兼用",
  },
  {
    id: "gaming-monitor-240hz",
    category: "monitor",
    title: "24.5型 240Hz ゲーミングモニター（0.5ms）",
    subtitle:
      "SFLの熱戦やランクマッチを遅延なく楽しむ、高リフレッシュレート＆黒挿入機能対応モデル。",
    priceText: "¥34,800〜",
    linkUrl: "https://amzn.to/example-monitor",
    badgeText: "プロ環境同等",
  },
  {
    id: "ergonomic-cushion",
    category: "living",
    title: "高反発ゲーミング座布団・骨盤サポートクッション",
    subtitle:
      "長時間のSFL公式配信視聴や長時間の対戦練習でも腰・お尻への負担を大幅軽減。",
    priceText: "¥4,980〜",
    linkUrl: "https://amzn.to/example-cushion",
    badgeText: "長時間視聴・対戦",
  },
];
