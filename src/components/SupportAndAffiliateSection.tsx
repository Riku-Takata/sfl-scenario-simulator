import React from "react";
import { AFFILIATE_ITEMS, DONATION_CONFIG } from "@/config/affiliates";

interface Props {
  bmcUrl?: string;
  compact?: boolean;
}

export function SupportAndAffiliateSection({
  bmcUrl = DONATION_CONFIG.bmcUrl,
  compact = false,
}: Props) {
  return (
    <aside
      style={{
        width: "100%",
        marginTop: compact ? "1.5rem" : "2.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {/* 1. Buy Me a Coffee (応援・ドネーション) */}
      <div
        style={{
          padding: "1.1rem 1.25rem",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid var(--border-color)",
          boxShadow: "var(--shadow-sm)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-sub)",
            marginBottom: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          {DONATION_CONFIG.appealText}
        </p>
        <a
          href={bmcUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.55rem 1.15rem",
            borderRadius: "8px",
            background: "#FFDD00",
            color: "#000000",
            fontWeight: 800,
            fontSize: "0.86rem",
            textDecoration: "none",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            transition: "transform 0.15s ease",
          }}
        >
          <span>☕</span>
          <span>開発者を支援する（Buy Me a Coffee）</span>
          <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>↗</span>
        </a>
      </div>

      {/* 2. 格ゲー・esports関連ギア (アフィリエイト・PR枠) */}
      <div
        style={{
          padding: "1.15rem",
          borderRadius: "12px",
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.85rem",
          }}
        >
          <span
            style={{
              fontSize: "0.88rem",
              fontWeight: 800,
              color: "var(--text-main)",
            }}
          >
            対戦・観戦おすすめギア
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              background: "#e2e8f0",
              padding: "0.15rem 0.45rem",
              borderRadius: "4px",
            }}
          >
            PR
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {AFFILIATE_ITEMS.map((item) => (
            <a
              key={item.id}
              href={item.linkUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              style={{
                display: "block",
                padding: "0.85rem",
                borderRadius: "8px",
                background: "#ffffff",
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.35rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    color: "var(--primary)",
                    background: "var(--primary-bg)",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                  }}
                >
                  {item.badgeText}
                </span>
                {item.priceText && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    {item.priceText}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "0.86rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  marginBottom: "0.25rem",
                  lineHeight: 1.3,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontSize: "0.76rem",
                  color: "var(--text-sub)",
                  lineHeight: 1.45,
                }}
              >
                {item.subtitle}
              </div>
            </a>
          ))}
        </div>

        <div
          style={{
            marginTop: "0.75rem",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            textAlign: "right",
          }}
        >
          ※上記リンクはアフィリエイト広告を含みます。収益はシミュレーターのサーバー維持費に充てられます。
        </div>
      </div>
    </aside>
  );
}
