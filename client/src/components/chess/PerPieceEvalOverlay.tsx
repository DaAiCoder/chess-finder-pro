import * as React from "react";

export interface PerPieceEval {
  /** Source square (e.g. "e2") of the piece this badge belongs to. */
  square: string;
  /** Best move's destination for this piece (e.g. "e4"). */
  bestTo: string;
  /** Evaluation in pawns from white's POV (e.g. 0.4 means +0.4 for white). */
  evalPawns: number;
  /** Mate-in-N from white's POV, or null. */
  mateIn: number | null;
  /** True if this piece's best move is the global best. */
  isBest: boolean;
}

/**
 * Absolute-positioned eval badges layered over a Chessground board.
 *
 * The board's outer container must be `position: relative` and a perfect square.
 * Each badge is positioned by computing the source square's percent-coords in
 * the orientation-flipped grid.
 */
export function PerPieceEvalOverlay({
  evals,
  orientation = "white",
}: {
  evals: PerPieceEval[];
  orientation?: "white" | "black";
}) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {evals.map((e) => {
        const { leftPct, topPct } = squareToPercent(e.square, orientation);
        const label = formatEval(e.evalPawns, e.mateIn);
        const bg = e.isBest ? "#3b82f6" /* blue */ : "#16a34a" /* green */;
        return (
          <div
            key={e.square}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: "12.5%",
              height: "12.5%",
            }}
          >
            <div
              className="absolute -top-1 -right-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.5)] tabular-nums leading-tight"
              style={{ backgroundColor: bg }}
              title={`Best move from ${e.square}: ${e.bestTo}`}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function squareToPercent(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97; // 0..7 a..h
  const rank = Number(square[1]) - 1;     // 0..7 1..8
  if (orientation === "white") {
    return { leftPct: file * 12.5, topPct: (7 - rank) * 12.5 };
  }
  return { leftPct: (7 - file) * 12.5, topPct: rank * 12.5 };
}

function formatEval(cpPawns: number, mateIn: number | null): string {
  if (mateIn != null) {
    const sign = mateIn > 0 ? "+" : "-";
    return `${sign}M${Math.abs(mateIn)}`;
  }
  const v = cpPawns;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  return `${sign}${abs.toFixed(1)}`;
}
