/**
 * Advantage capitalization problems.
 *
 * Pulls positions where a player had a decisive advantage (>+200 cp) but
 * threw it away with a poor move. The user is asked to find the strong
 * continuation.
 */

import { Chess } from "chess.js";
import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";

export function generateAdvantageProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const out: InsertTrainingProblem[] = [];
  for (const m of moves) {
    const evalForMover = m.isWhite ? m.evalBefore : -m.evalBefore;
    if (evalForMover < 200) continue;
    if (m.quality !== "miss" && m.quality !== "blunder" && m.quality !== "mistake") continue;
    if (!m.bestMove) continue;
    const sol = uciToSan(m.fenBefore, m.bestMove);
    if (!sol) continue;
    out.push({
      module: "advantage-capitalization",
      fen: m.fenBefore,
      solution: [sol],
      difficulty: 3,
      themes: ["conversion"],
      tacticType: "convert-advantage",
      explanation: `You had a winning position; the strongest follow-up is ${sol}.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: { ply: m.ply, evalBefore: m.evalBefore },
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
