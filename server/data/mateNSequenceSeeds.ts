/**
 * Curated forced mate *sequences* (mate in 2+ by the side to move).
 * Each entry is validated on module load (throws if illegal or not mate).
 *
 * Bulk mate-in-one KQvK/KRvK positions are generated in
 * `server/services/bulkTrainingSeeds.ts`. Extend this file with verified
 * multi-move lines as you curate them (run `npx tsx` against chess.js first).
 */

import { Chess } from "chess.js";

export interface MateNSequenceSeed {
  id: string;
  fen: string;
  solution: string[];
  difficulty: number;
  themes: string[];
  tacticType: string;
  explanation: string;
  /** Number of plies the *student* plays (side to move at puzzle start). */
  mateUserPlies: number;
  mateKind: string;
  estEloMin: number;
  estEloMax: number;
}

export const MATE_N_SEQUENCE_SEEDS: MateNSequenceSeed[] = [];

for (const s of MATE_N_SEQUENCE_SEEDS) {
  const ch = new Chess(s.fen);
  for (const san of s.solution) {
    if (!ch.move(san)) {
      throw new Error(`mateNSequenceSeeds ${s.id}: illegal SAN "${san}"`);
    }
  }
  if (!ch.isCheckmate()) {
    throw new Error(`mateNSequenceSeeds ${s.id}: solution does not end in checkmate`);
  }
}
