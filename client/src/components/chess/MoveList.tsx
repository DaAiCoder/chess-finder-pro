import * as React from "react";
import type { MoveAnalysis } from "@shared/schema";
import { QUALITY_META } from "@/lib/moveQuality";
import { cn } from "@/lib/utils";

export function MoveList({
  moves,
  currentPly,
  onSelect,
}: {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelect: (ply: number) => void;
}) {
  const rows = React.useMemo(() => {
    const out: { num: number; white?: MoveAnalysis; black?: MoveAnalysis }[] = [];
    for (const m of moves) {
      const moveNum = Math.ceil(m.ply / 2);
      let row = out[out.length - 1];
      if (!row || row.num !== moveNum) {
        row = { num: moveNum };
        out.push(row);
      }
      if (m.isWhite) row.white = m;
      else row.black = m;
    }
    return out;
  }, [moves]);

  return (
    <div className="text-sm font-mono divide-y divide-border max-h-[60vh] overflow-y-auto">
      {rows.map((row) => (
        <div key={row.num} className="grid grid-cols-[2.5rem_1fr_1fr] items-center px-2 py-1">
          <span className="text-muted-foreground">{row.num}.</span>
          <MoveCell move={row.white} active={currentPly === row.white?.ply} onClick={onSelect} />
          <MoveCell move={row.black} active={currentPly === row.black?.ply} onClick={onSelect} />
        </div>
      ))}
    </div>
  );
}

function MoveCell({
  move,
  active,
  onClick,
}: {
  move?: MoveAnalysis;
  active: boolean;
  onClick: (ply: number) => void;
}) {
  if (!move) return <span className="text-muted-foreground">…</span>;
  const meta = QUALITY_META[move.quality];
  return (
    <button
      onClick={() => onClick(move.ply)}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-0.5 text-left transition-colors",
        active ? "bg-primary/20 text-primary" : "hover:bg-secondary",
      )}
    >
      <span>{move.san}</span>
      <span style={{ color: meta.color }} title={meta.label} className="ml-1 text-xs font-semibold">
        {meta.icon}
      </span>
    </button>
  );
}
