/**
 * Per-game analyzer.
 *
 * Walks every move in a PGN, asks Stockfish for an evaluation of the
 * position before and after the move, and records:
 *   - centipawn loss (CPL)
 *   - the engine's preferred move
 *   - a quality label (best / inaccuracy / blunder / etc.)
 *
 * Then aggregates per-color accuracy + per-phase grades.
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import { classifyMove, accuracyFromAverageCpl } from "./moveQuality.js";
import type { MoveAnalysis, PhaseGrades } from "../../shared/schema.js";

export interface AnalyzedGame {
  whiteAccuracy: number;
  blackAccuracy: number;
  moveAnalysis: MoveAnalysis[];
  evalGraph: { ply: number; cp: number }[];
  whitePhaseGrades: PhaseGrades;
  blackPhaseGrades: PhaseGrades;
  depth: number;
}

const DEFAULT_DEPTH = 8;

export async function analyzeGame(pgn: string, depth = DEFAULT_DEPTH): Promise<AnalyzedGame> {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return emptyAnalysis(depth);
  }
  const history = chess.history({ verbose: true });
  if (history.length === 0) return emptyAnalysis(depth);

  // Replay one move at a time so we capture FEN-before / FEN-after.
  const replay = new Chess();
  const moveAnalyses: MoveAnalysis[] = [];
  const evalGraph: { ply: number; cp: number }[] = [{ ply: 0, cp: 0 }];

  let prevEval: number | null = null;

  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const fenBefore = replay.fen();
    const isWhite = replay.turn() === "w";

    // Eval before the move (engine's best move from this position).
    const before = await stockfish.evaluate(fenBefore, depth);
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    const fenAfter = replay.fen();
    const after = await stockfish.evaluate(fenAfter, depth);

    // CPL is from the perspective of the player who just moved.
    // Eval is in white POV; flip for black.
    const evalBeforeFromMover = isWhite ? before.evaluation : -before.evaluation;
    const evalAfterFromMover = isWhite ? after.evaluation : -after.evaluation;
    // Going from "before" (it's mover's turn) to "after" (opponent's turn) the
    // sign of "best for mover" should drop. So the loss is:
    //   loss = bestForMover(before) - achievedForMover(after)
    // bestForMover(before) = evalBeforeFromMover (best line)
    // achievedForMover(after) = -evalAfterFromOpponent = evalAfterFromMover (already flipped)
    const cpl = Math.max(0, evalBeforeFromMover - evalAfterFromMover);
    const evalImprovement = Math.max(0, evalAfterFromMover - (prevEval ?? 0));
    const hadDecisiveAdvantage = Math.abs(evalBeforeFromMover) > 350;

    const quality = classifyMove({
      cpl,
      ply: i,
      evalImprovement,
      hadDecisiveAdvantage,
    });

    moveAnalyses.push({
      ply: i + 1,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ""}`,
      fenBefore,
      fenAfter,
      evalBefore: clampCp(before.evaluation),
      evalAfter: clampCp(after.evaluation),
      cpl: Math.round(cpl),
      bestMove: before.bestMove,
      quality,
      isWhite,
    });

    evalGraph.push({ ply: i + 1, cp: clampCp(after.evaluation) });
    prevEval = evalAfterFromMover;
  }

  const whiteCpls = moveAnalyses.filter((m) => m.isWhite).map((m) => m.cpl);
  const blackCpls = moveAnalyses.filter((m) => !m.isWhite).map((m) => m.cpl);

  const whiteAccuracy = accuracyFromAverageCpl(avg(whiteCpls));
  const blackAccuracy = accuracyFromAverageCpl(avg(blackCpls));

  return {
    whiteAccuracy,
    blackAccuracy,
    moveAnalysis: moveAnalyses,
    evalGraph,
    whitePhaseGrades: gradesFor(moveAnalyses, true),
    blackPhaseGrades: gradesFor(moveAnalyses, false),
    depth,
  };
}

function clampCp(cp: number): number {
  if (cp > 1500) return 1500;
  if (cp < -1500) return -1500;
  return Math.round(cp);
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function gradesFor(moves: MoveAnalysis[], isWhite: boolean): PhaseGrades {
  const own = moves.filter((m) => m.isWhite === isWhite);
  const opening = own.filter((m) => m.ply <= 16);
  const middle = own.filter((m) => m.ply > 16 && m.ply <= 60);
  const end = own.filter((m) => m.ply > 60);
  return {
    opening: Math.round(accuracyFromAverageCpl(avg(opening.map((m) => m.cpl)))),
    middlegame: Math.round(accuracyFromAverageCpl(avg(middle.map((m) => m.cpl)))),
    endgame: Math.round(accuracyFromAverageCpl(avg(end.map((m) => m.cpl)))),
  };
}

function emptyAnalysis(depth: number): AnalyzedGame {
  return {
    whiteAccuracy: 0,
    blackAccuracy: 0,
    moveAnalysis: [],
    evalGraph: [],
    whitePhaseGrades: { opening: 0, middlegame: 0, endgame: 0 },
    blackPhaseGrades: { opening: 0, middlegame: 0, endgame: 0 },
    depth,
  };
}
