/**
 * Intuition problem generator.
 *
 * "Spot the mistake" — given a 5-move window centered on a real
 * blunder/mistake from the user's game, the trainer asks the user to
 * click which move was the error. The actual board for the puzzle
 * starts at the FEN _before_ the window opens; the UI walks through
 * the moves on hover and the user picks the bad one from a SAN list.
 *
 * For each move where quality is "blunder" or "mistake", we slice
 * +/-2 plies of context around it so the user has to reason about
 * the run-up rather than just spotting the obviously bad move in
 * isolation.
 */

import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";

const WINDOW_RADIUS = 2; // 2 before + bad move + 2 after = 5 moves

export function generateIntuitionProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  if (moves.length === 0) return [];

  const out: InsertTrainingProblem[] = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.quality !== "blunder" && m.quality !== "mistake") continue;

    const start = Math.max(0, i - WINDOW_RADIUS);
    const end = Math.min(moves.length - 1, i + WINDOW_RADIUS);
    const window = moves.slice(start, end + 1);

    const sequence = window.map((w) => w.san);
    const badIdx = i - start;
    const fenStart = moves[start].fenBefore;

    out.push({
      module: "intuition",
      fen: fenStart,
      solution: [m.san],
      difficulty: difficultyFor(m.quality, m.cpl),
      themes: ["intuition", "spot-the-mistake"],
      tacticType: "intuition",
      explanation:
        `${m.san} was the mistake (~${Math.round(m.cpl)}cp loss). Train your eye to catch ` +
        `the moment the position turned.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: {
        sequence,
        badIdx,
        fenStart,
        ply: m.ply,
        windowStart: moves[start].ply,
      },
    });
  }

  return out;
}

function difficultyFor(quality: string, cpl: number): number {
  // Big blunders are easy to spot; small mistakes are the real test.
  if (quality === "blunder" && cpl > 500) return 2;
  if (quality === "blunder") return 3;
  if (cpl > 200) return 4;
  return 5;
}
