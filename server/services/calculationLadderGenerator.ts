/**
 * Calculation Ladder problem generator.
 *
 * Picks a tactics problem from the user's library (or seeds) whose
 * solution is 3-5 forcing moves long and ranks it by length, motif
 * count, and engine eval swing. The ladder maps:
 *   - rung 1-2 → 3-ply solutions (mate-in-2 / win-1-move)
 *   - rung 3-5 → 5-ply solutions
 *   - rung 6-8 → 7-ply solutions
 *   - rung 9-10 → 9+ ply, dense motifs
 *
 * If we don't have a fitting problem in storage we fall back to any
 * problem at a similar difficulty rather than 404-ing.
 */

import { storage } from "../storage.js";
import type { TrainingProblem } from "../../shared/schema.js";

export interface CalculationProblem {
  problem: TrainingProblem;
  rung: number;
  /** Length of the expected solution sequence. */
  plies: number;
}

/** Returns the best-fitting problem for `rung` (1-10). */
export async function pickCalculationProblem(
  _userId: number,
  rung: number,
): Promise<CalculationProblem | null> {
  const targetPlies = rungToPlies(rung);
  const pool = await storage.listTrainingProblems();
  if (pool.length === 0) return null;

  const len = (p: TrainingProblem) =>
    Array.isArray(p.solution) ? (p.solution as unknown[]).length : 0;

  // Exact-length match.
  let candidates = pool.filter((p) => len(p) === targetPlies);
  // Fallback to ±1 ply.
  if (candidates.length === 0) {
    candidates = pool.filter((p) => {
      const n = len(p);
      return Math.abs(n - targetPlies) <= 1 && n > 0;
    });
  }
  // Final fallback: pick by difficulty.
  if (candidates.length === 0) {
    const targetDiff = Math.min(5, Math.max(1, Math.round(rung / 2)));
    candidates = pool.filter((p) => p.difficulty === targetDiff);
  }
  if (candidates.length === 0) candidates = pool;

  // Deterministic-ish per-rung selection so reloading the page doesn't
  // bounce around. Hash the rung into the candidate list.
  const pick = candidates[(rung * 7919) % candidates.length];
  return {
    problem: pick,
    rung,
    plies: len(pick) || targetPlies,
  };
}

function rungToPlies(rung: number): number {
  if (rung <= 2) return 3;
  if (rung <= 5) return 5;
  if (rung <= 8) return 7;
  return 9;
}
