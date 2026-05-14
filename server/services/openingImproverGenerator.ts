/**
 * Opening drill generator.
 *
 * Looks at moves in the opening phase (ply <= 16) where the user deviated
 * from the engine's preferred move. The user is asked to play the better move.
 */

import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";
import { Chess } from "chess.js";

export function generateOpeningProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const out: InsertTrainingProblem[] = [];
  for (const m of moves) {
    if (m.ply > 16) continue;
    if (m.cpl < 50) continue;
    if (!m.bestMove) continue;
    const sol = uciToSan(m.fenBefore, m.bestMove);
    if (!sol) continue;
    out.push({
      module: "opening-improver",
      fen: m.fenBefore,
      solution: [sol],
      difficulty: 2,
      themes: ["opening"],
      tacticType: "opening-deviation",
      explanation: `In this opening position the principled move is ${sol}.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: { ply: m.ply, played: m.san, cpl: m.cpl },
    });
  }
  return out;
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4) : undefined,
    });
    return m?.san ?? null;
  } catch {
    return null;
  }
}
