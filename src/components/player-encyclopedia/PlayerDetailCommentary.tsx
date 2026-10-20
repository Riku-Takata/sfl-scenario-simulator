import React from "react";
import type { CommentarySection } from "@/lib/player-encyclopedia";

interface PlayerDetailCommentaryProps {
  name: string;
  commentary: CommentarySection[];
}

export function PlayerDetailCommentary({ name, commentary }: PlayerDetailCommentaryProps) {
  if (commentary.length === 0) return null;
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        paddingTop: "1.1rem",
        marginBottom: "1.25rem",
      }}
    >
      <h3 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: "0.65rem" }}>
        総合解説：大会・試合内データ・ランクマから見る{name}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {commentary.map((s) => (
          <div
            key={s.heading}
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "0.75rem 0.9rem",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.4rem",
                marginBottom: "0.3rem",
              }}
            >
              <span style={{ fontSize: "0.9rem", fontWeight: 800 }}>{s.heading}</span>
              {s.sources.map((src) => (
                <span key={src} className="badge" style={{ fontSize: "0.68rem" }}>
                  {src}
                </span>
              ))}
            </div>
            <p style={{ fontSize: "0.86rem", color: "var(--text-sub)", lineHeight: 1.7 }}>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
