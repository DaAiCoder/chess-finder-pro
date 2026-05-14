import { clamp } from "@/lib/utils";

export function EvalGraph({
  data,
  currentPly,
  onSelect,
  width = 480,
  height = 80,
}: {
  data: { ply: number; cp: number }[];
  currentPly?: number;
  onSelect?: (ply: number) => void;
  width?: number;
  height?: number;
}) {
  if (data.length === 0)
    return (
      <div
        className="flex items-center justify-center rounded border border-border bg-card text-xs text-muted-foreground"
        style={{ width, height }}
      >
        No analysis yet
      </div>
    );

  const minCp = -800;
  const maxCp = 800;

  const points = data
    .map((d, i) => {
      const x = (i / Math.max(1, data.length - 1)) * width;
      const cp = clamp(d.cp, minCp, maxCp);
      const y = height - ((cp - minCp) / (maxCp - minCp)) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const baseline = height / 2;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Evaluation graph"
      onClick={(e) => {
        if (!onSelect) return;
        const rect = (e.target as SVGElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ply = Math.round((x / width) * (data.length - 1));
        onSelect(data[clamp(ply, 0, data.length - 1)].ply);
      }}
      style={{ cursor: onSelect ? "pointer" : "default" }}
    >
      <rect x={0} y={0} width={width} height={height} fill="hsl(var(--card))" rx={4} />
      <line x1={0} y1={baseline} x2={width} y2={baseline} stroke="hsl(var(--border))" strokeDasharray="2 2" />
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
      {currentPly != null && (
        <line
          x1={(currentPly / Math.max(1, data.length - 1)) * width}
          y1={0}
          x2={(currentPly / Math.max(1, data.length - 1)) * width}
          y2={height}
          stroke="hsl(var(--accent))"
          strokeWidth={1.2}
        />
      )}
    </svg>
  );
}
