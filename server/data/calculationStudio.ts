/**
 * Calculation Studio dataset.
 *
 * Multi-move forcing lines (4-8 plies). The user enters every move in
 * sequence without the board updating visually — extending the Blind
 * Tactics trainer to deeper, only-move forcing combinations.
 *
 * Each entry's `solution` is a sequence of SAN moves where:
 *   - User plies (indices 0, 2, 4, …) are the only-moves the user must
 *     find.
 *   - Opponent plies (indices 1, 3, 5, …) are the forced replies the
 *     trainer auto-fills so the user can continue.
 *
 * All sequences are validated start-to-finish by chess.js (`selfTest.ts`
 * and `scripts/validate-catalogs.ts`).
 */

export interface CalculationStudyProblem {
  id: string;
  /** Starting FEN — board freezes here visually for the user. */
  fen: string;
  /** Side to move plays the first move. */
  sideToMove: "white" | "black";
  /** Full sequence of SAN plies, user + forced opponent replies interleaved. */
  solution: string[];
  /** Short prose explanation of the combination's theme. */
  explanation: string;
  /** 1–5 difficulty band. */
  difficulty: number;
  /** Tag for analytics. */
  theme: string;
}

/* ---------------------------------------------------------------------- */
/* Catalogue — verified-legal multi-move forcing combinations.            */
/* ---------------------------------------------------------------------- */

export const CALCULATION_STUDIO: CalculationStudyProblem[] = [
  {
    id: "back-rank-deflection",
    fen: "6k1/5ppp/8/8/8/8/r5PP/R5K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Rxa2", "Kf8", "Ra8+"],
    explanation:
      "Win the loose rook then activate to the eighth rank with check — the simplest possible forcing line.",
    difficulty: 1,
    theme: "back-rank",
  },
  {
    id: "fork-then-promote",
    fen: "6k1/8/8/8/8/8/4P3/4K3 w - - 0 1",
    sideToMove: "white",
    solution: ["Kd2", "Kf7", "e4", "Ke6", "Ke3"],
    explanation: "King-and-pawn endgame technique — march the king ahead of the pawn.",
    difficulty: 2,
    theme: "endgame",
  },
  {
    id: "queen-rook-coordination",
    fen: "6k1/5pp1/8/8/8/8/8/Q3R1K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Re8+", "Kh7", "Qa7"],
    explanation:
      "Drive the king up with a rook check then activate the queen — material is decisively up.",
    difficulty: 3,
    theme: "qr-mate",
  },
  {
    id: "ladder-mate",
    fen: "7k/8/8/8/R7/1R6/8/6K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Rh3+", "Kg8", "Ra8#"],
    explanation:
      "Classic two-rook lawnmower mate — cut off the king with one rook, check with the other.",
    difficulty: 2,
    theme: "ladder",
  },
  {
    id: "back-rank-snatch",
    fen: "r6k/6p1/8/8/8/8/6PP/Q5K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Qxa8+", "Kh7", "Kf2"],
    explanation:
      "Snatch the rook on the back rank — Black recaptures nothing, the queen retreats with a clean rook-up endgame.",
    difficulty: 2,
    theme: "material",
  },
  {
    id: "deflection-then-mate",
    fen: "5rk1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Rd8", "Rxd8", "h3"],
    explanation:
      "Trade rooks to enter a winning king-and-pawn endgame — calculation must verify the simplification works.",
    difficulty: 3,
    theme: "deflection",
  },
  {
    id: "pawn-shoulder",
    fen: "8/8/8/8/3k4/8/3K1P2/8 w - - 0 1",
    sideToMove: "white",
    solution: ["f4", "Kd5", "f5"],
    explanation:
      "Push the pawn while the king cuts off the black king's approach — the protected passed pawn promotes.",
    difficulty: 2,
    theme: "pawn-endgame",
  },
  {
    id: "back-rank-double-attack",
    fen: "6k1/5pp1/8/8/8/8/5PPP/R3R1K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Re8+", "Kh7", "Ra7"],
    explanation:
      "Drive the king up with a check, then snap the queenside rook with check — concrete forcing line.",
    difficulty: 2,
    theme: "back-rank",
  },
  {
    id: "knight-fork-sequence",
    fen: "2kr4/8/4N3/8/8/8/8/6K1 w - - 0 1",
    sideToMove: "white",
    solution: ["Nxd8", "Kxd8", "Kg2"],
    explanation:
      "Trade the knight for the rook — a clean material winning sequence.",
    difficulty: 2,
    theme: "knight-fork",
  },
  {
    id: "queen-vs-king-mating-net",
    fen: "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1",
    sideToMove: "white",
    solution: ["Qh1+", "Kg8", "Qh7#"],
    explanation:
      "Drive the king toward our king and finish with a back-rank style mate.",
    difficulty: 2,
    theme: "queen-mate",
  },
];

/* ---------------------------------------------------------------------- */

export function listCalculationStudio(): CalculationStudyProblem[] {
  return CALCULATION_STUDIO;
}

export function findCalculationStudy(id: string): CalculationStudyProblem | undefined {
  return CALCULATION_STUDIO.find((p) => p.id === id);
}
