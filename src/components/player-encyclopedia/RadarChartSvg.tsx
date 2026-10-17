import React from "react";
import type { PlayerEncyclopediaEntry } from "@/lib/player-encyclopedia";

interface RadarChartSvgProps {
  params: PlayerEncyclopediaEntry["parameters"];
  color: string;
}

export function RadarChartSvg({ params, color }: RadarChartSvgProps) {
  const size = 250;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 84;

  const axes = [
    { label: "ポイント獲得", value: params.pointEfficiency },
    { label: "大将・勝負強さ", value: params.clutchPower },
    { label: "HOME制圧力", value: params.homeControl },
    { label: "AWAY突破力", value: params.awayResilience },
    { label: "ラウンド支配", value: params.roundDominance },
    { label: "対応キャラ幅", value: params.matchupCoverage },
  ];

  const getPoint = (index: number, val: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const gridLevels = [25, 50, 75, 100];
  const dataPoints = axes.map((a, i) => getPoint(i, a.value));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
      role="img"
      aria-label="選手パラメーター6角形レーダーチャート"
    >
      {/* 背景グリッド */}
      {gridLevels.map((lvl) => {
        const pts = axes
          .map((_, i) => {
            const p = getPoint(i, lvl);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={pts}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={lvl === 100 ? 1.5 : 1}
            strokeDasharray={lvl === 50 ? "3 2" : undefined}
          />
        );
      })}

      {/* 軸線 */}
      {axes.map((_, i) => {
        const end = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        );
      })}

      {/* データポリゴン */}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2.5}
      />

      {/* 頂点ドット & ラベル */}
      {axes.map((a, i) => {
        const p = dataPoints[i];
        const labelPoint = getPoint(i, 126);
        return (
          <g key={a.label}>
            <circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={700}
              fill="var(--text-main)"
            >
              {a.label}
            </text>
            <text
              x={labelPoint.x}
              y={labelPoint.y + 11}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={800}
              fill={color}
            >
              {a.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
