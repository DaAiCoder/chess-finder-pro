/**
 * Defender problem generator.
 *
 * Surfaces "only-move" defensive positions: the position was roughly
 * balanced, but the move played dropped it to clearly losing — and the
 * engine's preferred reply would have held. This is the inverse of the
 * tactics generator (find-the-win) and the advantage generator (convert
 * the plus): here the user must hold a position that's about to fall.
 *
 * Heuristic — for each move where:
 *   - the side to move was within ~70cp of equal (roughly balanced),
 *   - the move played dumped the position to clearly losing for them,
 *   - Stockfish still recommends a concrete alternative (`bestMove`),
 *   - and the mistake was serious enough (`mistake`, `blunder`, or a heavy
 *     `inaccuracy`),
 *
 * emit a problem at `fenBefore` with the engine best move as the solution.
 *
 * Note: `quality === "miss"` (from {@link classifyMove}) only fires when
 * the player *already had a decisive advantage* and spoiled it — those
 * positions are never "balanced", so we **do not** key off `"miss"` here.
 */

import { Chess } from "chess.js";
import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";

export function generateDefenderProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const out: InsertTrainingProblem[] = [];

  const BALANCED_ABS_MAX = 70;
  const LOST_FOR_MOVER = -180;

  for (const m of moves) {
    if (!m.bestMove) continue;

    // evalBefore / evalAfter are stored from white's POV — flip for black
    // movers so we can talk about the position from the side-to-move.
    const evalBeforeMover = m.isWhite ? m.evalBefore : -m.evalBefore;
    const evalAfterMover = m.isWhite ? m.evalAfter : -m.evalAfter;

    if (Math.abs(evalBeforeMover) > BALANCED_ABS_MAX) continue;
    if (evalAfterMover > LOST_FOR_MOVER) continue;

    const okQuality =
      m.quality === "mistake" ||
      m.quality === "blunder" ||
      (m.quality === "inaccuracy" && evalAfterMover <= LOST_FOR_MOVER);
    if (!okQuality) continue;

    const bestSan = uciToSan(m.fenBefore, m.bestMove);
    if (!bestSan) continue;

    out.push({
      module: "defender",
      fen: m.fenBefore,
      solution: [bestSan],
      difficulty: difficultyFor(evalBeforeMover, evalAfterMover),
      themes: ["defender", "only-move"],
      tacticType: "defender",
      explanation:
        `${m.san} dropped a balanced position to about ${Math.round(evalAfterMover)}cp. ` +
        `${bestSan} was the only move that held.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: {
        ply: m.ply,
        evalBefore: evalBeforeMover,
        evalAfter: evalAfterMover,
        playedSan: m.san,
      },
    });
  }
  return out;
}

function difficultyFor(evalBefore: number, evalAfter: number): number {
  // The bigger the swing from balanced to lost, the more obvious the
  // mistake — and (in puzzle terms) the easier the defensive resource.
  const swing = Math.abs(evalAfter - evalBefore);
  if (swing > 800) return 2;
  if (swing > 500) return 3;
  if (swing > 300) return 4;
  return 5;
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci.slice(4) : undefined;
    const m = c.move({ from, to, promotion: promo });
    return m?.san ?? null;
  } catch {
    return null;
  }
}
