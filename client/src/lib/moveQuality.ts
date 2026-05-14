import type { MoveQuality } from "@shared/schema";

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
