/**
 * Generate tactics problems by mining a player's blunders.
 *
 * Given an analyzed game, every blunder/mistake position becomes a candidate
 * problem: the position BEFORE the bad move is presented to the user, and
 * the engine's preferred move is the solution.
 */

import { Chess } from "chess.js";
import type { GameAnalysis, InsertTrainingProblem, MoveAnalysis } from "../../shared/schema.js";
import { detectMotifsInGame } from "./motifDetector.js";

export function generateTacticsFromAnalysis(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
  module?: string;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const problems: InsertTrainingProblem[] = [];
  const motifs = detectMotifsInGame(args.pgn, args.gameId);
  const motifByPly = new Map<number, string[]>();
  for (const m of motifs) {
    const cur = motifByPly.get(m.ply) ?? [];
    cur.push(m.motifKey);
    motifByPly.set(m.ply, cur);
  }

  for (const move of moves) {
    if (move.quality !== "blunder" && move.quality !== "mistake" && move.quality !== "miss") continue;
    if (!move.bestMove) continue;
    const themes = motifByPly.get(move.ply) ?? [];
    const tacticType = themes[0] ?? "general";
    const explanation = `${move.san} loses about ${move.cpl} centipawns. The engine prefers ${move.bestMove}.`;

    problems.push({
      module: args.module ?? "tactics",
      fen: move.fenBefore,
      solution: [uciToSan(move.fenBefore, move.bestMove)].filter(Boolean) as string[],
      difficulty: difficultyForCpl(move.cpl),
      themes,
      tacticType,
      explanation,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: { ply: move.ply, cpl: move.cpl },
    });
  }
  return problems;
}

function difficultyForCpl(cpl: number): number {
  if (cpl > 600) return 1; // very obvious
  if (cpl > 400) return 2;
  if (cpl > 250) return 3;
  if (cpl > 150) return 4;
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
