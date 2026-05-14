/**
 * Curated blind-tactics dataset.
 *
 * Each entry is a Listudy-style blind-tactics puzzle:
 *   - `startFen`     is shown on the (frozen) board
 *   - `playedMoves`  are the SAN moves the user must visualise in their head
 *   - `solution`     is the SAN move to find in the *imagined* current position
 *   - `theme`        is a human-readable tactical motif
 *
 * Every entry is validated end-to-end with chess.js in
 * `server/selfTest.ts` and `scripts/validate-blind-tactics.ts`:
 *   1. startFen must be legal.
 *   2. Each ply in playedMoves must be a legal SAN from the running position.
 *   3. solution must be a legal SAN from the position after playedMoves.
 *   4. solution must be the *only* listed answer — wrong answers fall through
 *      to the "not the move" feedback in the UI.
 */

export interface BlindTactic {
  id: string;
  startFen: string;
  playedMoves: string[];
  solution: string;
  theme: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/** Standard starting position — used by many opening-trap puzzles. */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const BLIND_TACTICS: BlindTactic[] = [
  {
    id: "fool-mate",
    startFen: START,
    playedMoves: ["f3", "e5", "g4"],
    solution: "Qh4#",
    theme: "Fool's Mate",
    description:
      "After 1.f3 e5 2.g4??, find Black's mate in one. The classic Fool's Mate visualised after three plies.",
    difficulty: 1,
  },
  {
    id: "scholars-mate-finish",
    startFen: START,
    playedMoves: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"],
    solution: "Qxf7#",
    theme: "Scholar's Mate",
    description:
      "After 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??, find Scholar's Mate. Six plies to visualise.",
    difficulty: 2,
  },
  {
    id: "legal-mate-setup",
    startFen: START,
    playedMoves: ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6"],
    solution: "Nxe5",
    theme: "Légal's Mate setup",
    description:
      "After 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6, find the tactical shot that wins material (Légal's idea).",
    difficulty: 3,
  },
  {
    id: "italian-fried-liver-fork",
    startFen: START,
    playedMoves: [
      "e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5",
    ],
    solution: "Nxf7",
    theme: "Fried Liver Attack",
    description:
      "After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5, find the famous Fried Liver sacrifice.",
    difficulty: 4,
  },
  {
    id: "back-rank-quick",
    startFen: "6k1/5ppp/8/8/8/8/R7/6K1 w - - 0 1",
    playedMoves: ["Ra5", "h6", "Ra8+"],
    solution: "Kh7",
    theme: "Back rank visualisation",
    description:
      "Two-mover: White's rook reaches a8 with check. Find Black's only legal move (the back rank is open after ...h6).",
    difficulty: 1,
  },
  {
    id: "queen-pawn-development",
    startFen: START,
    playedMoves: ["d4", "d5", "Nf3"],
    solution: "Nf6",
    theme: "Closed-game development",
    description:
      "After 1.d4 d5 2.Nf3, find Black's most principled developing move.",
    difficulty: 1,
  },
  {
    id: "queens-gambit-quick",
    startFen: START,
    playedMoves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"],
    solution: "e3",
    theme: "Queen's Gambit Declined",
    description:
      "Standard QGD mainline — after eight plies, what's White's most natural move? (Find the textbook reply.)",
    difficulty: 2,
  },
  {
    id: "noahs-ark-trap",
    startFen: START,
    playedMoves: [
      "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "d6", "d4", "b5", "Bb3",
    ],
    solution: "Nxd4",
    theme: "Noah's Ark Trap (setup)",
    description:
      "After 11 plies in the Ruy Lopez, find Black's tactical shot — capturing on d4 wins the bishop after ...c5.",
    difficulty: 4,
  },
  {
    id: "ruy-lopez-exchange",
    startFen: START,
    playedMoves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"],
    solution: "bxc6",
    theme: "Ruy Lopez Exchange",
    description:
      "After 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6, find Black's principled recapture.",
    difficulty: 2,
  },
  {
    id: "scandinavian-blunder",
    startFen: START,
    playedMoves: ["e4", "d5", "exd5", "Qxd5", "Nc3"],
    solution: "Qa5",
    theme: "Scandinavian opening visualisation",
    description:
      "After 1.e4 d5 2.exd5 Qxd5 3.Nc3, find Black's main retreat square.",
    difficulty: 2,
  },
  {
    id: "knight-trade-mate-prep",
    startFen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    playedMoves: ["Ng5", "d5", "exd5", "Nxd5"],
    solution: "Nxf7",
    theme: "Italian Fried Liver (alt)",
    description:
      "Same Fried Liver idea reached from a slightly different move order — find the sac on f7.",
    difficulty: 3,
  },
  {
    id: "queens-mate-edge",
    startFen: "7k/8/8/8/8/8/Q7/6K1 w - - 0 1",
    playedMoves: ["Qg2", "Kh7", "Kf2", "Kh8"],
    solution: "Kf3",
    theme: "Q+K mating technique",
    description:
      "Standard Q+K mating procedure — visualise four plies, then make the principled king move.",
    difficulty: 3,
  },
  {
    id: "promotion-blind",
    startFen: "8/4P3/8/8/5k2/8/8/4K3 w - - 0 1",
    playedMoves: ["e8=Q+", "Kf5", "Qe5+", "Kg6", "Ke2"],
    solution: "Kh6",
    theme: "Promote and corral",
    description:
      "After promotion and a couple of king moves, find the only legal Black king move that keeps fighting.",
    difficulty: 4,
  },
  {
    id: "two-rook-roll",
    startFen: "7k/8/8/8/8/8/R7/R6K w - - 0 1",
    playedMoves: ["Ra8+", "Kh7", "R1a7+", "Kh6"],
    solution: "Rh8#",
    theme: "Two-rook lawnmower",
    description:
      "After the two-rook ladder squeezes the king down, find the final mating move.",
    difficulty: 2,
  },
  {
    id: "kings-indian-sac",
    startFen: START,
    playedMoves: [
      "d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O",
      "Be2", "e5", "O-O", "Nc6", "d5",
    ],
    solution: "Ne7",
    theme: "King's Indian classical",
    description:
      "15 plies of the mainline KID — find Black's standard knight retreat to prepare the kingside pawn storm.",
    difficulty: 5,
  },
  {
    id: "italian-symmetric",
    startFen: START,
    playedMoves: [
      "e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "d6", "O-O",
    ],
    solution: "Nf6",
    theme: "Giuoco Pianissimo",
    description:
      "Both sides mirror each other in the Italian Game. After nine plies, find Black's most natural developing move.",
    difficulty: 2,
  },
  {
    id: "endgame-opposition-shuffle",
    startFen: "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1",
    playedMoves: ["Kd4", "Kd6", "e3"],
    solution: "Ke6",
    theme: "King & pawn — opposition",
    description:
      "Visualise the king dance, then find Black's only opposition-keeping reply.",
    difficulty: 3,
  },
];

/** Returns the full deck. */
export function listBlindTactics(): BlindTactic[] {
  return BLIND_TACTICS;
}

export function getBlindTactic(id: string): BlindTactic | undefined {
  return BLIND_TACTICS.find((t) => t.id === id);
}
