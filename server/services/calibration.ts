/**
 * Onboarding calibration & per-motif skill tracker.
 *
 * Approach: a lightweight Glicko-like update. Each motif starts at
 * rating 1200, RD (rating deviation) 350. The user's "puzzle rating"
 * for a motif uses a single-rating Elo update with K scaled by RD —
 * confident answers shrink RD quickly; cold motifs move fast and
 * stabilize.
 *
 * Public API:
 *   - `pickOnboardingPuzzles(n)` — returns N problems spanning the main
 *     motif categories at progressive difficulties.
 *   - `recordAttempt(userId, motifKey, problemDifficulty, success)` —
 *     updates the user's per-motif skill and returns the new rating.
 *   - `recommendModules(userId)` — sorts user's motifs by lowest rating
 *     and returns the top-3 modules to practice.
 */

import { storage } from "../storage.js";
import type { TrainingProblem, UserMotifSkill } from "../../shared/schema.js";

const DEFAULT_RATING = 1200;
const DEFAULT_RD = 350;
const MIN_RD = 50;

/** Difficulty (1-5) → rough rating equivalent. */
const DIFFICULTY_TO_RATING: Record<number, number> = {
  1: 1000,
  2: 1200,
  3: 1400,
  4: 1600,
  5: 1800,
};

/**
 * Hand-picked motif keys to cover during onboarding — broad enough to
 * surface meaningful weaknesses while keeping the calibration short.
 */
const CALIBRATION_MOTIFS = [
  "fork",
  "pin",
  "skewer",
  "discovered-attack",
  "back-rank",
  "smothered-mate",
  "deflection",
  "trapped-piece",
];

export interface OnboardingPuzzle {
  problem: TrainingProblem;
  /** Motif key the puzzle exercises (for skill attribution). */
  motifKey: string;
  /** UI index (0-based). */
  index: number;
}

/** Returns up to `n` puzzles drawn from the training problems pool. */
export async function pickOnboardingPuzzles(
  n: number,
): Promise<OnboardingPuzzle[]> {
  const all = await storage.listTrainingProblems();
  const out: OnboardingPuzzle[] = [];
  const seenIds = new Set<number>();
  let idx = 0;
  for (const motifKey of CALIBRATION_MOTIFS) {
    if (out.length >= n) break;
    const match = all.find((p) => {
      if (seenIds.has(p.id)) return false;
      if (p.tacticType && p.tacticType.toLowerCase().includes(motifKey)) return true;
      const themes = (p.themes ?? []) as unknown;
      if (Array.isArray(themes)) {
        return themes.some(
          (t) => typeof t === "string" && t.toLowerCase().includes(motifKey),
        );
      }
      return false;
    });
    if (match) {
      out.push({ problem: match, motifKey, index: idx++ });
      seenIds.add(match.id);
    }
  }
  // Pad with mate-in-1 patterns if we couldn't hit the target count.
  if (out.length < n) {
    const mates = all.filter(
      (p) => p.module === "checkmate-patterns" && !seenIds.has(p.id),
    );
    for (const m of mates) {
      if (out.length >= n) break;
      out.push({ problem: m, motifKey: "mating-net", index: idx++ });
      seenIds.add(m.id);
    }
  }
  return out;
}

/** Elo-with-RD update. Returns the new rating + new RD. */
function updateSkill(
  rating: number,
  rd: number,
  opponentRating: number,
  success: boolean,
): { rating: number; rd: number } {
  // Larger K for higher RD so cold motifs move quickly.
  const k = 12 + Math.min(28, (rd - MIN_RD) / 10);
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  const actual = success ? 1 : 0;
  return {
    rating: Math.round(rating + k * (actual - expected)),
    rd: Math.max(MIN_RD, Math.round(rd * 0.9)),
  };
}

/** Records a single attempt against a motif and returns the new skill row. */
export async function recordMotifAttempt(
  userId: number,
  motifKey: string,
  problemDifficulty: number,
  success: boolean,
): Promise<UserMotifSkill> {
  const opp = DIFFICULTY_TO_RATING[problemDifficulty] ?? DEFAULT_RATING;
  const existing = await storage.getUserMotifSkill(userId, motifKey);
  const baseRating = existing?.rating ?? DEFAULT_RATING;
  const baseRd = existing?.rd ?? DEFAULT_RD;
  const baseAttempts = existing?.attempts ?? 0;
  const baseCorrect = existing?.correct ?? 0;
  const { rating, rd } = updateSkill(baseRating, baseRd, opp, success);
  return storage.upsertUserMotifSkill({
    userId,
    motifKey,
    rating,
    rd,
    attempts: baseAttempts + 1,
    correct: baseCorrect + (success ? 1 : 0),
    updatedAt: new Date(),
  });
}

export interface ModuleRecommendation {
  module: string;
  href: string;
  motifKey: string;
  rating: number;
  accuracyPct: number | null;
  reason: string;
}

/** Returns three modules sorted by weakest motif rating. */
export async function recommendModules(
  userId: number,
): Promise<ModuleRecommendation[]> {
  const skills = await storage.listUserMotifSkills(userId);
  if (skills.length === 0) return [];
  const ranked = [...skills].sort((a, b) => a.rating - b.rating).slice(0, 3);
  return ranked.map((s) => {
    const accuracyPct =
      s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : null;
    return {
      module: motifToModule(s.motifKey).label,
      href: motifToModule(s.motifKey).href,
      motifKey: s.motifKey,
      rating: s.rating,
      accuracyPct,
      reason:
        accuracyPct != null
          ? `${accuracyPct}% accuracy on ${s.motifKey} so far`
          : `low confidence on ${s.motifKey}`,
    };
  });
}

function motifToModule(motifKey: string): { label: string; href: string } {
  if (
    motifKey === "back-rank" ||
    motifKey === "smothered-mate" ||
    motifKey === "mating-net"
  ) {
    return { label: "Checkmate Patterns", href: "/training/checkmate-patterns" };
  }
  // Default → tactics trainer pre-filtered to this motif.
  return {
    label: `Tactics: ${motifKey}`,
    href: `/training/tactics?motif=${encodeURIComponent(motifKey)}`,
  };
}
