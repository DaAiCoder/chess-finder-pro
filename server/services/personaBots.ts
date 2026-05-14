import type { PerMoveEval } from "./stockfish.js";

export type PersonaId = "balanced" | "capablanca" | "tal" | "petrosian";

/**
 * Re-ranks MultiPV lines before picking a move — engine lines must be
 * ordered strongest-first for sane fallbacks.
 */
export function personaPickMove(lines: PerMoveEval[], persona: PersonaId): string {
  if (!lines.length) return "";
  const slice = lines.slice(0, Math.min(12, lines.length));
  switch (persona) {
    case "tal": {
      const i = Math.floor(Math.random() * Math.min(3, slice.length));
      return slice[i]!.uci;
    }
    case "capablanca": {
      const start = Math.min(4, Math.max(0, slice.length - 3));
      const i = start + Math.floor(Math.random() * (slice.length - start));
      return slice[i]!.uci;
    }
    case "petrosian": {
      const start = Math.min(2, slice.length - 1);
      const i = start + Math.floor(Math.random() * Math.min(3, slice.length - start));
      return slice[i]!.uci;
    }
    case "balanced":
    default:
      return slice[0]!.uci;
  }
}
