/**
 * Eval timeline with motif markers.
 *
 * Drawn as an SVG area chart (white POV centipawns) with one click-
 * able marker per ply that fired a motif. Hovering a marker shows the
 * motif tag; clicking scrubs the board and surfaces the coach
 * explanation panel.
 *
 * Designed to drop into `game-analysis.tsx` above the board without
 * pulling in recharts so the bundle stays slim.
 */

import * as React from "react";
import { clamp } from "@/lib/utils";

export interface EvalTimelinePoint {
  ply: number;
  cp: number;
}

export interface EvalTimelineMarker {
  ply: number;
  motif: string;
  /** Centipawn swing on this ply (signed). */
  cpDelta?: number;
  /** Brief one-line tooltip body. */
  hint?: string;
}

export interface EvalTimelineProps {
  data: EvalTimelinePoint[];
  markers: EvalTimelineMarker[];
  currentPly?: number;
  onSelect?: (ply: number, marker?: EvalTimelineMarker) => void;
  width?: number;
  height?: number;
}

const MIN_CP = -800;
const MAX_CP = 800;

export function EvalTimeline({
  data,
  markers,
  currentPly,
  onSelect,
  width = 640,
  height = 120,
}: EvalTimelineProps) {
  const [hover, setHover] = React.useState<EvalTimelineMarker | null>(null);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded border border-border bg-card text-xs text-muted-foreground"
        style={{ width, height }}
      >
        No analysis available — run a full game review to populate.
      </div>
    );
  }

  const xForPly = (ply: number) => {
    const i = Math.max(0, Math.min(data.length - 1, ply));
    return (i / Math.max(1, data.length - 1)) * width;
  };
  const yForCp = (cp: number) => {
    const c = clamp(cp, MIN_CP, MAX_CP);
    return height - ((c - MIN_CP) / (MAX_CP - MIN_CP)) * height;
  };

  const baseline = height / 2;
  const points = data
    .map((d, i) => `${(i / Math.max(1, data.length - 1)) * width},${yForCp(d.cp)}`)
    .join(" ");

  const areaPoints = `0,${baseline} ${points} ${width},${baseline}`;

  return (
    <div className="relative" style={{ width, height: height + 20 }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Evaluation timeline"
        onClick={(e) => {
          if (!onSelect) return;
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const ply = Math.round((x / width) * (data.length - 1));
          const sel = data[clamp(ply, 0, data.length - 1)];
          const marker = markers.find((m) => m.ply === sel.ply);
          onSelect(sel.ply, marker);
        }}
        style={{ cursor: onSelect ? "pointer" : "default", display: "block" }}
      >
        <rect x={0} y={0} width={width} height={height} fill="hsl(var(--card))" rx={6} />
        {/* Centerline */}
        <line
          x1={0}
          y1={baseline}
          x2={width}
          y2={baseline}
          stroke="hsl(var(--border))"
          strokeDasharray="2 4"
        />
        {/* White-advantage area (above baseline) */}
        <polygon
          points={areaPoints}
          fill="hsl(var(--primary) / 0.12)"
          stroke="hsl(var(--primary))"
          strokeWidth={1.4}
        />
        {/* Current-ply scrub line */}
        {currentPly != null && (
          <line
            x1={xForPly(currentPly)}
            y1={0}
            x2={xForPly(currentPly)}
            y2={height}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
          />
        )}
        {/* Motif markers */}
        {markers.map((m) => {
          const x = xForPly(m.ply);
          const cpEntry = data.find((d) => d.ply === m.ply);
          const y = cpEntry ? yForCp(cpEntry.cp) : baseline;
          const fill = severityFill(m.cpDelta);
          return (
            <g key={`${m.ply}-${m.motif}`}>
              <circle
                cx={x}
                cy={y}
                r={5}
                fill={fill}
                stroke="white"
                strokeWidth={1.5}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(m)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(m.ply, m);
                }}
              >
                <title>{`${m.motif}${m.hint ? `: ${m.hint}` : ""}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      {/* X-axis ply ticks (sparse) */}
      <div className="text-[10px] text-muted-foreground flex justify-between px-1 mt-0.5">
        <span>1</span>
        <span>{Math.floor(data.length / 2)}</span>
        <span>{data.length}</span>
      </div>

      {hover && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded bg-foreground text-background text-[10px] font-mono"
          style={{ pointerEvents: "none" }}
        >
          ply {hover.ply}: {hover.motif}
          {hover.cpDelta != null && ` (${hover.cpDelta > 0 ? "+" : ""}${hover.cpDelta})`}
        </div>
      )}
    </div>
  );
}

function severityFill(cpDelta?: number): string {
  if (cpDelta == null) return "hsl(217 91% 60%)"; // info blue
  const abs = Math.abs(cpDelta);
  if (abs >= 300) return "hsl(0 84% 60%)"; // rose
  if (abs >= 150) return "hsl(38 92% 50%)"; // amber
  return "hsl(217 91% 60%)";
}
