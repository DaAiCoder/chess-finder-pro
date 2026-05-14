/**
 * Pawn-Structure catalogue.
 *
 * Each structure ships with:
 *   - A canonical FEN that exhibits the structure.
 *   - 3 plans for the side with the structure (or against it).
 *   - 5 pawn breaks (typical levers).
 *   - 5 drill positions where the user must execute the canonical plan.
 *
 * The drill rows feed the `pawn-structures` training module via
 * `pawnStructureDrillSeeds()` — each is a single-move task tagged with
 * the structure id so the trainer UI can group them.
 *
 * Validation pipeline (in seed-training.ts + selfTest.ts):
 *   - `pruneInvalidSolutions("pawn-structures")` removes any drill
 *     whose `solution` cannot be replayed legally.
 *   - `backfillCuratedSeeds("pawn-structures", pawnStructureDrillSeeds())`
 *     ensures every curated drill survives redeploys.
 *   - Self-test verifies each `fen` parses and each `solution[0]` is legal.
 */

import type { InsertTrainingProblem } from "../../shared/schema.js";

export interface PawnStructureDrill {
  /** Position FEN with the side-to-move set so `solution[0]` is legal. */
  fen: string;
  /** SAN of the plan-aligned move (one move) the user must find. */
  solution: string;
  /** Short prose explanation of why this move executes the plan. */
  explanation: string;
  /** 1–5 difficulty band for the adaptive picker. */
  difficulty: number;
}

export interface PawnStructure {
  /** url-safe id, e.g. "iqp". */
  id: string;
  name: string;
  /** Reference FEN showing the structure (used in the overview panel). */
  fen: string;
  /** 3 strategic plans for the side with (or against) the structure. */
  plans: string[];
  /** 5 typical pawn breaks/levers. */
  breaks: string[];
  /** 5 drill positions tied to the structure. */
  drills: PawnStructureDrill[];
  /** Short overview prose. */
  overview: string;
}

/* ---------------------------------------------------------------------- */
/* The catalogue                                                          */
/* ---------------------------------------------------------------------- */

export const PAWN_STRUCTURES: PawnStructure[] = [
  {
    id: "iqp",
    name: "Isolated Queen's Pawn (IQP)",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/3P4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 0 9",
    overview:
      "White (or Black) has a pawn on d4 with no friendly c- or e-pawn. The IQP grants space and active minor pieces but is a long-term weakness in endgames.",
    plans: [
      "Pile pieces on d4's outpost on e5 — knight + bishop battery.",
      "Push d5 at the right moment to dissolve the weakness and open lines.",
      "Attack the kingside with Ne5, Bd3, Qd1-h5/Bc2, Re3-h3.",
    ],
    breaks: ["d5", "e5", "c5 (for the side without the IQP)", "f4-f5", "b4 (queenside expansion)"],
    drills: [
      {
        fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/3P4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 0 9",
        solution: "Ne5",
        difficulty: 3,
        explanation:
          "Classic IQP play: Ne5 plants the model IQP piece — the centralised knight eyes c6 / f7 / g6 and dominates the position.",
      },
      {
        fen: "r2q1rk1/pp1n1ppp/2pbpn2/3p4/3P4/1QN1PN2/PP1B1PPP/R3R1K1 w - - 0 11",
        solution: "Ne5",
        difficulty: 3,
        explanation:
          "Knight on e5 is the model IQP piece — eyes c6 + f7 + g6 and cannot be chased without weakening Black's structure.",
      },
      {
        fen: "r1bq1rk1/1p3ppp/p1n1pn2/3p4/3P4/2N1PN2/PP1BBPPP/R2Q1RK1 w - - 0 10",
        solution: "Bd3",
        difficulty: 3,
        explanation:
          "Reroute the light-squared bishop to d3 — aims at h7 and clears the e-file for queen lifts.",
      },
      {
        fen: "r1bq1rk1/pp1n1ppp/4pn2/3p4/3P4/2N1PN2/PP1QBPPP/R3R1K1 w - - 6 10",
        solution: "Bd3",
        difficulty: 4,
        explanation:
          "Recentralise — Bd3 prepares Re1-e3-h3 lift, the canonical kingside-attack regrouping.",
      },
      {
        fen: "r1bq1rk1/pp3pp1/2n1pn1p/3p4/3P4/P1NBPN2/1P3PPP/R1BQ1RK1 w - - 0 10",
        solution: "Bh7+",
        difficulty: 4,
        explanation:
          "Bishop swings out to h7 with check — the classical IQP infiltration along the b1-h7 diagonal.",
      },
    ],
  },
  {
    id: "hanging-pawns",
    name: "Hanging Pawns (c4 + d4)",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/8/2PP4/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9",
    overview:
      "Two side-by-side pawns on c4 + d4 with no neighbours on b/e. They control central squares and support kingside attacks, but become weak if forced to advance.",
    plans: [
      "Advance d5 to gain space and open lines for the bishop pair.",
      "Trade the dark-squared bishop for Black's defensive knight on f6.",
      "Use the rook on c1 to support c5 at the right moment.",
    ],
    breaks: ["d5", "c5", "e4 (after Black plays ...d5 themselves)", "b4 (queenside)", "f4-f5"],
    drills: [
      {
        fen: "r1bq1rk1/pp3ppp/2n1pn2/8/2PP4/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9",
        solution: "Bg5",
        difficulty: 3,
        explanation:
          "Bg5 prepares the trade of dark-squared bishops — easing the path to d5.",
      },
      {
        fen: "r2q1rk1/pp2bppp/2n1pn2/8/2PP4/2N1BN2/PP1Q1PPP/R4RK1 w - - 0 11",
        solution: "Rfd1",
        difficulty: 3,
        explanation:
          "Both rooks on the centre files — the model setup before pushing d5.",
      },
      {
        fen: "r2q1rk1/1p3ppp/p1n1pn2/8/2PP4/2N1BN2/PP1Q1PPP/3R1RK1 w - - 0 12",
        solution: "d5",
        difficulty: 4,
        explanation:
          "The thematic d5 break — the hanging pawns transform into a passed pawn and bishop diagonal.",
      },
      {
        fen: "r2q1rk1/pp3ppp/2nbpn2/8/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9",
        solution: "Qe2",
        difficulty: 3,
        explanation:
          "Centralise the queen on e2 and connect rooks — Qd2 is also fine but Qe2 supports the e3-e4 break.",
      },
      {
        fen: "r1bq1rk1/pp1n1ppp/4pn2/8/2PP4/2N1BN2/PP1Q1PPP/R4RK1 w - - 0 11",
        solution: "Qd3",
        difficulty: 3,
        explanation:
          "Qd3 centralises the queen and prepares the model d5 push together with rook lifts on the d-file.",
      },
    ],
  },
  {
    id: "french-chain",
    name: "French Chain (d5 vs e6/d4)",
    fen: "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
    overview:
      "Advance French / Stonewall family: locked pawn chain with e5 spearheading. Strategy revolves around attacking the base of each chain.",
    plans: [
      "Black: undermine d4 with ...c5 and ...Nc6.",
      "White: defend d4 with Nf3+Be2, then play b3, Bb2, c3 cementing the chain.",
      "White: attack the kingside with f4 + h4-h5 and queen lift Qd2-h4.",
    ],
    breaks: ["c5 (Black)", "f6 (Black)", "h4-h5 (White)", "Nb5-d6 outpost", "Bxa6 sacrifice on the b-file"],
    drills: [
      {
        fen: "rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4",
        solution: "Nf3",
        difficulty: 2,
        explanation:
          "Standard French Advance — Nf3 defends d4 and prepares Be2.",
      },
      {
        fen: "r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 5",
        solution: "Be2",
        difficulty: 2,
        explanation:
          "Be2 supports the chain; the Be2-Bd3 manoeuvre is part of the long-term plan against ...f6.",
      },
      {
        fen: "r1bqkbnr/pp3ppp/2n5/2ppP3/2pP4/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 6",
        solution: "Be2",
        difficulty: 3,
        explanation:
          "Even after ...c4 keeps the bishop active on the kingside diagonal — slow chain defence wins eventually.",
      },
      {
        fen: "rnbqk1nr/pp3pbp/4p1p1/2ppP3/3P4/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 6",
        solution: "h4",
        difficulty: 4,
        explanation:
          "Against fianchetto setups, White launches h4-h5 to crack the kingside chain at its base.",
      },
      {
        fen: "r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2N1BN2/PPP2PPP/R2QKB1R b KQkq - 4 5",
        solution: "Nh6",
        difficulty: 4,
        explanation:
          "Routing the knight via h6→f5 hits d4 — the classical Black plan in the French Advance.",
      },
    ],
  },
  {
    id: "carlsbad",
    name: "Carlsbad Structure (c+d+e vs c+d+e, exchange QGD)",
    fen: "r1bq1rk1/pp1n1ppp/2pbpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9",
    overview:
      "Symmetrical centre after exchange QGD: White typically plays the minority attack on the queenside, Black aims for kingside expansion or central tension.",
    plans: [
      "Minority attack: b2-b4-b5 to create a weakness on c6.",
      "Black: …Ne4 or …Nh5 followed by …f5 expansion.",
      "Centralise rooks on c1 + b1 to support b4-b5.",
    ],
    breaks: ["b4-b5 (minority attack)", "c4 (Black-side break)", "f5 (Black)", "e4 (White)", "g4 (rare, kingside)"],
    drills: [
      {
        fen: "r1bq1rk1/pp1n1ppp/2pbpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9",
        solution: "Rb1",
        difficulty: 3,
        explanation:
          "Rb1 is the first step of the minority attack — the rook supports the eventual b4-b5 push targeting c6.",
      },
      {
        fen: "r1bq1rk1/pp1n1ppp/2pbpn2/3p4/3P4/2NBPN2/PPQ2PPP/R1B2RK1 w - - 0 10",
        solution: "b4",
        difficulty: 3,
        explanation:
          "b4 is the first step of the minority attack — fix the queenside before b5.",
      },
      {
        fen: "r1bq1rk1/p2n1ppp/2pbpn2/1p1p4/1P1P4/2NBPN2/P1Q2PPP/R1B2RK1 w - - 0 11",
        solution: "a4",
        difficulty: 4,
        explanation:
          "After …b5, the lever is a4 — opening files against c6 / b5.",
      },
      {
        fen: "r1bq1rk1/p2n1pp1/2pbpn1p/3p4/1P1P4/2NBPN2/P1Q2PPP/R1B2RK1 w - - 0 11",
        solution: "Rb1",
        difficulty: 3,
        explanation:
          "Rb1 supports the imminent b5 — co-ordination first, push second.",
      },
      {
        fen: "r2q1rk1/pp1bbppp/2p1pn2/3pN3/3P4/2N1P3/PPQ1BPPP/R4RK1 w - - 0 11",
        solution: "f3",
        difficulty: 4,
        explanation:
          "f3 supports an eventual e4 break — the Bf6 trade prepared the central break.",
      },
    ],
  },
  {
    id: "stonewall",
    name: "Stonewall (d5+e6+f5+c6)",
    fen: "rnbq1rk1/pp3ppp/2p1pn2/3p4/3P1P2/2N1PN2/PPP3PP/R1BQKB1R b KQ - 0 7",
    overview:
      "Black erects pawns on c6, d5, e6, f5. Solid but the e5 outpost and dark-squared weaknesses are long-term problems.",
    plans: [
      "Black: occupy e4 with a knight (Ne4) — the king-piece of the Stonewall.",
      "Black: trade the dark-squared bishop via Bd6 → c7 + Bd6-e7-h4.",
      "White: route a knight to e5 supported by f4, then prepare g4 break.",
    ],
    breaks: ["g4 (White)", "c4 (White)", "Ne4 (Black outpost)", "exf5 capture lines", "...c5 release"],
    drills: [
      {
        fen: "rnbq1rk1/pp3ppp/2p1pn2/3p4/3P1P2/2N1PN2/PPP3PP/R1BQKB1R b KQ - 0 7",
        solution: "Nbd7",
        difficulty: 2,
        explanation:
          "Nbd7 develops the queenside knight, prepares the Ne4 outpost — the soul of the Stonewall.",
      },
      {
        fen: "rnbq1rk1/pp4pp/2pbpn2/3p1p2/3P1P2/2N1PN2/PPP3PP/R1BQKB1R w KQ - 0 8",
        solution: "Bd3",
        difficulty: 3,
        explanation:
          "Bd3 trades Black's plan to play …Ne4 — keep the option of pushing g4 later.",
      },
      {
        fen: "r1bq1rk1/pp3pp1/2pbpn1p/3p1p2/3P1P2/2NBPN2/PPP3PP/R2QK2R w KQ - 0 9",
        solution: "O-O",
        difficulty: 2,
        explanation:
          "Castle first; Stonewall plans always start with king safety on both sides.",
      },
      {
        fen: "r1bq1rk1/1p3ppp/p1pbpn2/3p1p2/3P1P2/2NBPN2/PPP3PP/R1BQ1RK1 b - - 0 9",
        solution: "Ne4",
        difficulty: 3,
        explanation:
          "Ne4 is the soul of the Stonewall — the knight on e4 is unkickable without weakening White's structure.",
      },
      {
        fen: "r1bq1rk1/1p3ppp/p1pbp3/3p1p2/3PnP2/2NBPN2/PPP3PP/R1BQ1RK1 w - - 0 10",
        solution: "Nxe4",
        difficulty: 3,
        explanation:
          "Trading the Ne4 outpost is sometimes forced — but doing it on White's terms (Nxe4 fxe4) is usually fine.",
      },
    ],
  },
  {
    id: "maroczy",
    name: "Maroczy Bind (c4 + e4)",
    fen: "r1bq1rk1/pp3ppp/2nppn2/8/2P1P3/2N1B3/PP3PPP/R2QKB1R w KQ - 0 9",
    overview:
      "White restrains Black's …d5 break with pawns on c4 and e4. Slow positional squeeze in many Sicilian / English structures.",
    plans: [
      "Trade dark-squared bishops to leave Black with the bad bishop.",
      "Restrain …b5 and …d5 indefinitely; convert space later.",
      "Build f3 + Bd2 + Rc1 → seize the c-file.",
    ],
    breaks: ["d5 (Black equalising)", "b4 (White queenside)", "f4-f5 (White)", "g4-g5 (kingside)", "...a6+b5 sequence"],
    drills: [
      {
        fen: "r1bq1rk1/pp3ppp/2nppn2/8/2P1P3/2N1B3/PP3PPP/R2QKB1R w KQ - 0 9",
        solution: "Be2",
        difficulty: 2,
        explanation:
          "Standard Maroczy development — Be2 keeps options of f3 + Qd2 + Rd1 for the long squeeze.",
      },
      {
        fen: "r1bq1rk1/pp3ppp/2nppn2/8/2P1P3/2N1BP2/PP2B1PP/R2QK2R w KQ - 0 10",
        solution: "Qd2",
        difficulty: 3,
        explanation:
          "Qd2 prepares Bh6 trades + queenside coordination.",
      },
      {
        fen: "r1bq1rk1/pp2bppp/2nppn2/8/2P1P3/2N1BP2/PP1QB1PP/R3K2R w KQ - 0 11",
        solution: "O-O",
        difficulty: 2,
        explanation:
          "Castle short — Maroczy structures usually keep kings on the same wing and squeeze the centre.",
      },
      {
        fen: "r2q1rk1/pp2bppp/1bnppn2/8/2P1P3/2N1BP2/PP1QB1PP/R4RK1 w - - 0 12",
        solution: "Nd5",
        difficulty: 4,
        explanation:
          "Nd5 is the model Maroczy outpost — trades a defender or invades.",
      },
      {
        fen: "r2q1rk1/pp2bp1p/1bnpp1p1/3N4/2P1P3/4BP2/PP1QB1PP/R4RK1 b - - 0 13",
        solution: "exd5",
        difficulty: 3,
        explanation:
          "Take the dominating Maroczy knight with the pawn — the Maroczy bind dissolves and Black gets active piece play.",
      },
    ],
  },
  {
    id: "benoni",
    name: "Modern Benoni (c5+e6 vs d5)",
    fen: "rnbq1rk1/pp1p1pbp/4pnp1/2pP4/2P5/2N2NP1/PP2PPBP/R1BQK2R b KQ - 0 7",
    overview:
      "Black sacrifices space for dynamic counterplay along the half-open e-file and the long diagonal. White has a pawn wedge and clear plans.",
    plans: [
      "Black: …Re8 + …Nbd7-e5 + …Nh5 manoeuvres; the …b5 lever is key.",
      "White: support the d5 pawn and try f4 + e5 advance.",
      "White: trade dark-squared bishops via Bg5 to weaken …d6/e6.",
    ],
    breaks: ["b5 (Black queenside)", "f4-f5-e5 (White)", "e4-e5 (White)", "f7-f5 (Black, rare)", "a6 + b5"],
    drills: [
      {
        fen: "rnbq1rk1/pp1p1pbp/4pnp1/2pP4/2P5/2N2NP1/PP2PPBP/R1BQK2R b KQ - 0 7",
        solution: "exd5",
        difficulty: 2,
        explanation:
          "Standard Benoni: take on d5 to fix White's structure and create the half-open e-file.",
      },
      {
        fen: "rnbq1rk1/pp1p1pbp/5np1/2pp4/2P5/2N2NP1/PP2PPBP/R1BQK2R w KQ - 0 8",
        solution: "cxd5",
        difficulty: 2,
        explanation:
          "Recapture cxd5 reaches the canonical Modern Benoni — Black gets the long diagonal, White the protected passed d-pawn.",
      },
      {
        fen: "rnbq1rk1/pp3pbp/3p1np1/2pP4/4P3/2N2NP1/PP3PBP/R1BQ1RK1 b - - 0 9",
        solution: "Re8",
        difficulty: 3,
        explanation:
          "Re8 pressures the e-file — the key Benoni rook move before …Na6-c7-b5.",
      },
      {
        fen: "rn1q1rk1/pp3pbp/3p1np1/2pP3b/4P3/2N2NP1/PP3PBP/R1BQ1RK1 w - - 0 10",
        solution: "Re1",
        difficulty: 3,
        explanation:
          "Re1 contests the open e-file — usually the move-order trick is to prevent …Bxf3.",
      },
      {
        fen: "r2q1rk1/pp1n1pbp/3p1np1/2pP4/4P3/2N2NP1/PP3PBP/R1BQ1RK1 b - - 0 10",
        solution: "Ne5",
        difficulty: 4,
        explanation:
          "Ne5 occupies the strong square in front of the pawn chain — trading favourable pieces.",
      },
    ],
  },
];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

/** Flatten the drill rows into `InsertTrainingProblem`s for seeding. */
export function pawnStructureDrillSeeds(): InsertTrainingProblem[] {
  return PAWN_STRUCTURES.flatMap((s) =>
    s.drills.map((d) => ({
      module: "pawn-structures",
      fen: d.fen,
      solution: [d.solution],
      difficulty: d.difficulty,
      themes: ["pawn-structure", s.id],
      tacticType: s.name,
      explanation: d.explanation,
      source: "seed",
      metadata: { structureId: s.id, structureName: s.name },
    } satisfies InsertTrainingProblem)),
  );
}

/** Public listing for the trainer overview UI. */
export function listPawnStructures(): PawnStructure[] {
  return PAWN_STRUCTURES;
}

export function findPawnStructure(id: string): PawnStructure | undefined {
  return PAWN_STRUCTURES.find((s) => s.id === id);
}
