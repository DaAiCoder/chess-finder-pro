/**
 * Endgame problem generator.
 *
 * Pulls positions where each side has <= 8 pieces (rough endgame threshold)
 * and the user made a sub-optimal move. The user is asked for the engine move.
 */

import { Chess } from "chess.js";
import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";

export function generateEndgameProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const out: InsertTrainingProblem[] = [];
  for (const m of moves) {
    if (m.cpl < 50) continue;
    if (!isEndgame(m.fenBefore)) continue;
    if (!m.bestMove) continue;
    const sol = uciToSan(m.fenBefore, m.bestMove);
    if (!sol) continue;
    out.push({
      module: "endgame",
      fen: m.fenBefore,
      solution: [sol],
      difficulty: 3,
      themes: ["endgame"],
      tacticType: "endgame-technique",
      explanation: `In this endgame the precise move is ${sol}.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: { ply: m.ply },
    });
  }
  return out;
}

function isEndgame(fen: string): boolean {
  const board = fen.split(" ")[0];
  let majorMinor = 0;
  for (const ch of board) {
    if ("QRBNqrbn".includes(ch)) majorMinor++;
  }
  return majorMinor <= 6;
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
