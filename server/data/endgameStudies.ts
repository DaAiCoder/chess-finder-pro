/**
 * Composed endgame studies catalogue.
 *
 * Famous studies from Réti, Saavedra, Troitsky, etc. — each presented as
 * a single-move puzzle (the only-move that solves the study) followed by
 * an explanation of the idea. The full mainline is stored as
 * `metadata.mainline` so the trainer can replay the whole study.
 *
 * Validation pipeline:
 *   - `pruneInvalidSolutions("endgame-studies")` removes anything that
 *     doesn't reach the stored solution legally.
 *   - `backfillCuratedSeeds("endgame-studies", endgameStudyDrills())`
 *     re-inserts curated studies on every boot.
 */

import type { InsertTrainingProblem } from "../../shared/schema.js";

export interface EndgameStudy {
  id: string;
  /** Display name (composer + year). */
  name: string;
  /** Composer. */
  composer: string;
  year?: string;
  /** Position FEN — side to move plays the only-move. */
  fen: string;
  /** SAN of the only move that solves the study. */
  solution: string;
  /** Full canonical line (SAN), starting with `solution`. */
  mainline: string[];
  /** Short prose. */
  explanation: string;
  difficulty: number;
  /** Tag for filtering. */
  theme: string;
}

/* ---------------------------------------------------------------------- */
/* The catalogue                                                          */
/* ---------------------------------------------------------------------- */

export const ENDGAME_STUDIES: EndgameStudy[] = [
  {
    id: "reti-1921",
    name: "Réti's Study (1921)",
    composer: "Richard Réti",
    year: "1921",
    /** King on h8, pawn on c6 vs King on a6 and pawn on h5. White to move and draw. */
    fen: "7K/8/k1P5/7p/8/8/8/8 w - - 0 1",
    solution: "Kg7",
    mainline: ["Kg7", "h4", "Kf6", "Kb6", "Ke5"],
    explanation:
      "The geometry of the chess board: with Kg7 White's king walks the diagonal toward both his pawn (c-pawn) and Black's pawn (h-pawn), drawing what looks like a lost race. Pure paradox.",
    difficulty: 5,
    theme: "king-walk",
  },
  {
    id: "saavedra-1895",
    name: "Saavedra Position (1895)",
    composer: "Saavedra / Barbier",
    year: "1895",
    /** White: Kb6, Pc6. Black: Ka1, Rd1. White to move and win. */
    fen: "8/8/1KP5/8/8/8/8/k2r4 w - - 0 1",
    solution: "c7",
    mainline: ["c7", "Rd6+", "Kb5", "Rd5+", "Kb4"],
    explanation:
      "Famous study — the underpromotion to rook on c8 avoids stalemate and wins by Rc8-c1 skewer.",
    difficulty: 5,
    theme: "underpromotion",
  },
  {
    id: "troitsky-mate",
    name: "Troitsky Knight Mate",
    composer: "Alexey Troitsky",
    /** White king + 2 knights vs Black king + pawn. White to move and win. */
    fen: "8/8/8/3k4/8/8/4p3/2N1KN2 w - - 0 1",
    solution: "Kd2",
    mainline: ["Kd2", "Kd4", "Kxe2", "Ke4", "Nb3"],
    explanation:
      "Two knights cannot force mate against a lone king — but with a pawn that locks one knight, mate becomes possible. Troitsky proved which positions are winning.",
    difficulty: 5,
    theme: "two-knights",
  },
  {
    id: "philidor-position",
    name: "Philidor Position (defensive draw)",
    composer: "Philidor",
    year: "1777",
    /** King + rook + pawn vs King + rook — the third-rank defence. */
    fen: "5k2/8/3K4/3P4/8/r7/8/4R3 b - - 0 1",
    solution: "Ra6+",
    mainline: ["Ra6+"],
    explanation:
      "The Philidor draw: keep the rook on the third rank (here sixth from Black's POV) until the pawn arrives, then check the king from behind. A drawn book endgame.",
    difficulty: 4,
    theme: "rook-and-pawn",
  },
  {
    id: "lucena-bridge",
    name: "Lucena Position (winning the bridge)",
    composer: "Lucena",
    year: "1497",
    /** White king + pawn + rook vs Black king + rook — building the bridge. */
    fen: "2K5/3P4/8/8/8/k7/7r/4R3 w - - 0 1",
    solution: "Re4",
    mainline: ["Re4", "Rh1", "Kc7", "Rc1+", "Kd6"],
    explanation:
      "Building Lucena's bridge: lift the rook to the fourth rank so it can shield the king from checks once the king escorts the pawn home.",
    difficulty: 4,
    theme: "rook-and-pawn",
  },
  {
    id: "opposition-basic",
    name: "Basic Opposition",
    composer: "Theory",
    fen: "4k3/8/8/8/4K3/8/4P3/8 w - - 0 1",
    solution: "Kd5",
    mainline: ["Kd5", "Kd7", "Kd4", "Ke6", "e3"],
    explanation:
      "Take the diagonal opposition first — the side without the move loses ground. Here Kd5 sidesteps and the king escorts the pawn home.",
    difficulty: 3,
    theme: "opposition",
  },
  {
    id: "vancura-defence",
    name: "Vancura Defence",
    composer: "Josef Vancura",
    year: "1924",
    /** R + a-pawn vs R draw idea — keep the rook on the side, attack from h3. */
    fen: "8/2K5/P7/8/8/k7/8/2r5 b - - 0 1",
    solution: "Rc6",
    mainline: ["Rc6"],
    explanation:
      "Vancura's draw: with rook on the long side, prevent the white king from advancing while keeping checking distance. A practical drawing technique against a + pawn.",
    difficulty: 5,
    theme: "rook-and-pawn",
  },
  {
    id: "underpromotion-knight",
    name: "Knight Underpromotion Check",
    composer: "Studied composition",
    fen: "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1",
    solution: "e8=N+",
    mainline: ["e8=N+"],
    explanation:
      "Underpromote to a knight with check! e8=N+ attacks the black king on g7 from an unexpected square — the classic 'minor promotion' theme in studies.",
    difficulty: 4,
    theme: "underpromotion",
  },
  {
    id: "fortress-king-vs-rook",
    name: "Wrong-Color Bishop Fortress",
    composer: "Theory",
    /** K + B (light) + h-pawn vs lone K, bishop is wrong color — corner draw. */
    fen: "7k/8/6K1/8/8/8/8/8 w - - 0 1",
    solution: "Kf6",
    mainline: ["Kf6", "Kh7", "Kf7", "Kh8", "Kg6"],
    explanation:
      "Stalemate trick — with the wrong-color bishop and h-pawn, even kings can't drive Black out of the corner. A bishop on the wrong colour is the classic draw motif.",
    difficulty: 4,
    theme: "fortress",
  },
  {
    id: "zugzwang-pawn-endgame",
    name: "Zugzwang Pawn Endgame",
    composer: "Theory",
    fen: "8/8/3k4/2p2K2/2P5/8/8/8 w - - 0 1",
    solution: "Ke4",
    mainline: ["Ke4", "Ke6", "Kd3", "Kd6", "Kd2"],
    explanation:
      "Triangulation — the white king loses a tempo with Kf5-e4-d3 to put Black in zugzwang. The only way to win symmetric king-and-pawn positions.",
    difficulty: 4,
    theme: "zugzwang",
  },
];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

export function listEndgameStudies(): EndgameStudy[] {
  return ENDGAME_STUDIES;
}

export function findEndgameStudy(id: string): EndgameStudy | undefined {
  return ENDGAME_STUDIES.find((s) => s.id === id);
}

export function endgameStudyDrills(): InsertTrainingProblem[] {
  return ENDGAME_STUDIES.map((s) => ({
    module: "endgame-studies",
    fen: s.fen,
    solution: [s.solution],
    difficulty: s.difficulty,
    themes: ["endgame-study", s.theme],
    tacticType: s.name,
    explanation: s.explanation,
    source: "seed",
    metadata: {
      studyId: s.id,
      composer: s.composer,
      year: s.year,
      mainline: s.mainline,
    },
  } satisfies InsertTrainingProblem));
}
