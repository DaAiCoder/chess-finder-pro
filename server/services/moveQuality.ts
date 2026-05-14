import type { MoveQuality } from "../../shared/schema.js";

/**
 * Classify a move based on its centipawn loss (CPL), the position phase
 * (`ply`), and how much the eval improved (used for brilliant/great).
 *
 * Calibrated for shallow (depth 8) Stockfish analysis.
 */
export function classifyMove(args: {
  cpl: number;
  ply: number;
  evalImprovement: number;
  hadDecisiveAdvantage: boolean;
}): MoveQuality {
  const { cpl, ply, evalImprovement, hadDecisiveAdvantage } = args;

  if (cpl === 0 && evalImprovement > 300) return "brilliant";
  if (cpl === 0 && evalImprovement > 150) return "great";
  if (ply < 16 && cpl <= 30) return "book";
  if (cpl === 0) return "best";
  if (cpl <= 20) return "excellent";
  if (cpl <= 50) return "good";
  if (hadDecisiveAdvantage && cpl > 200) return "miss";
  if (cpl <= 100) return "inaccuracy";
  if (cpl <= 300) return "mistake";
  return "blunder";
}

/** Lichess accuracy formula: 103.1668 * e^(−0.04354 * avgCpl) − 3.1669. */
export function accuracyFromAverageCpl(avgCpl: number): number {
  if (!Number.isFinite(avgCpl)) return 0;
  const acc = 103.1668 * Math.exp(-0.04354 * avgCpl) - 3.1669;
  return Math.max(0, Math.min(100, Number(acc.toFixed(1))));
}

export const QUALITY_META: Record<
  MoveQuality,
  { icon: string; color: string; label: string }
> = {
  brilliant:  { icon: "!!", color: "#a855f7", label: "Brilliant" },
  great:      { icon: "!",  color: "#22d3ee", label: "Great" },
  best:       { icon: "★",  color: "#10b981", label: "Best" },
  excellent:  { icon: "✓",  color: "#14b8a6", label: "Excellent" },
  good:       { icon: "+",  color: "#22c55e", label: "Good" },
  book:       { icon: "📖", color: "#3b82f6", label: "Book" },
  inaccuracy: { icon: "?!", color: "#eab308", label: "Inaccuracy" },
  miss:       { icon: "✗",  color: "#f97316", label: "Miss" },
  mistake:    { icon: "?",  color: "#f97316", label: "Mistake" },
  blunder:    { icon: "??", color: "#ef4444", label: "Blunder" },
};
