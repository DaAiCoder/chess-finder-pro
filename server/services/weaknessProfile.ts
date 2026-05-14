/**
 * Per-user weakness profile.
 *
 * Aggregates:
 *   - `user_motif_skill` rows (from onboarding + drill)
 *   - `training_attempts` joined to `training_problems.tacticType`
 *   - `motif_metrics` (legacy aggregate per (user, motifKey))
 *
 * Outputs the bottom-N motifs ranked by accuracy / rating with a
 * deep-link to the trainer that practises them.
 */

import { storage } from "../storage.js";

export interface WeaknessRow {
  motifKey: string;
  /** Human-readable name ("Pin", "Discovered Attack"). */
  name: string;
  /** 0-100 accuracy from training attempts. */
  accuracyPct: number;
  /** Total attempts so far (lower = less confidence). */
  attempts: number;
  /** Glicko-ish skill rating from calibration / drill. */
  rating: number;
  /** Deep-link href to the trainer pre-filtered to this motif. */
  href: string;
}

const MOTIF_NICE_NAMES: Record<string, string> = {
  fork: "Fork",
  "royal-fork": "Royal Fork",
  pin: "Pin",
  skewer: "Skewer",
  "discovered-attack": "Discovered Attack",
  "discovered-check": "Discovered Check",
  "double-check": "Double Check",
  "double-attack": "Double Attack",
  "back-rank": "Back-Rank Mate",
  "smothered-mate": "Smothered Mate",
  deflection: "Deflection",
  decoy: "Decoy",
  interference: "Interference",
  zwischenzug: "Zwischenzug",
  windmill: "Windmill",
  "trapped-piece": "Trapped Piece",
  "overloaded-piece": "Overloaded Piece",
  "x-ray": "X-Ray Attack",
  "hanging-piece": "Hanging Piece",
  "greek-gift": "Greek Gift",
  "passed-pawn": "Passed Pawn",
  opposition: "Opposition",
  lucena: "Lucena Position",
  philidor: "Philidor Position",
};

export async function computeWeaknesses(
  userId: number,
  limit = 3,
): Promise<WeaknessRow[]> {
  const [skills, metrics] = await Promise.all([
    storage.listUserMotifSkills(userId),
    storage.listMotifMetrics(userId),
  ]);

  /* Build a unified row keyed by motifKey. */
  const map = new Map<string, WeaknessRow>();
  for (const s of skills) {
    map.set(s.motifKey, {
      motifKey: s.motifKey,
      name: MOTIF_NICE_NAMES[s.motifKey] ?? prettify(s.motifKey),
      accuracyPct:
        s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : 0,
      attempts: s.attempts,
      rating: s.rating,
      href: motifHref(s.motifKey),
    });
  }
  for (const m of metrics) {
    const row = map.get(m.motifKey);
    if (row) {
      row.attempts = Math.max(row.attempts, m.attempts);
      // Blend metric accuracy into existing accuracy 50/50.
      const blended = Math.round((row.accuracyPct + (m.accuracy ?? 0)) / 2);
      row.accuracyPct = blended;
    } else {
      map.set(m.motifKey, {
        motifKey: m.motifKey,
        name: MOTIF_NICE_NAMES[m.motifKey] ?? prettify(m.motifKey),
        accuracyPct: Math.round(m.accuracy ?? 0),
        attempts: m.attempts ?? 0,
        rating: 1200,
        href: motifHref(m.motifKey),
      });
    }
  }

  return Array.from(map.values())
    .filter((r) => r.attempts > 0)
    .sort((a, b) => {
      // Worst accuracy first, then lowest rating, then most attempts (least
      // noise) wins as a tiebreaker.
      if (a.accuracyPct !== b.accuracyPct) return a.accuracyPct - b.accuracyPct;
      if (a.rating !== b.rating) return a.rating - b.rating;
      return b.attempts - a.attempts;
    })
    .slice(0, limit);
}

function motifHref(motifKey: string): string {
  if (motifKey === "back-rank" || motifKey === "smothered-mate" || motifKey === "mating-net") {
    return "/training/checkmate-patterns";
  }
  return `/training/tactics?motif=${encodeURIComponent(motifKey)}`;
}

function prettify(key: string): string {
  return key
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
