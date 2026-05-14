/**
 * Blunder-prevention quiz generator.
 *
 * For each blunder a user made, builds a multiple-choice problem:
 * the actual blunder + 2-3 alternative legal moves, asking the user
 * to pick the best one.
 */

import { Chess } from "chess.js";
import type {
  GameAnalysis,
  InsertTrainingProblem,
  MoveAnalysis,
} from "../../shared/schema.js";

export function generateBlunderPreventerProblems(args: {
  pgn: string;
  analysis: GameAnalysis;
  gameId: number;
}): InsertTrainingProblem[] {
  const moves = (args.analysis.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const out: InsertTrainingProblem[] = [];
  for (const m of moves) {
    if (m.quality !== "blunder") continue;
    if (!m.bestMove) continue;
    const choices = buildChoices(m);
    if (!choices) continue;
    out.push({
      module: "blunder-preventer",
      fen: m.fenBefore,
      solution: [choices.correct],
      difficulty: 3,
      themes: ["blunder-prevention"],
      tacticType: "blunder-prevention",
      explanation: `Avoid ${m.san} — it loses about ${m.cpl} centipawns. The engine prefers ${choices.correct}.`,
      source: "from-game",
      sourceGameId: args.gameId,
      metadata: { choices: choices.list, ply: m.ply },
    });
  }
  return out;
}

function buildChoices(m: MoveAnalysis): { correct: string; list: string[] } | null {
  try {
    const chess = new Chess(m.fenBefore);
    const all = chess.moves({ verbose: true });
    if (all.length < 3) return null;

    const correctMove = chess.move({
      from: m.bestMove!.slice(0, 2),
      to: m.bestMove!.slice(2, 4),
      promotion: m.bestMove!.length > 4 ? m.bestMove!.slice(4) : undefined,
    });
    if (!correctMove) return null;
    const correctSan = correctMove.san;

    const blunderSan = m.san;
    const others = all
      .map((mv) => mv.san)
      .filter((s) => s !== correctSan && s !== blunderSan)
      .slice(0, 2);

    const list = shuffle([correctSan, blunderSan, ...others]);
    return { correct: correctSan, list };
  } catch {
    return null;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
