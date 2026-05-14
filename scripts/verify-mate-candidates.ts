/**
 * Validate candidate mate-in-1 puzzles for the checkmate-patterns trainer.
 * Every entry must: (a) parse as legal FEN, (b) the SAN must be legal in
 * that position, AND (c) after the move the side-to-play is checkmated.
 *
 * Run:  npx tsx scripts/verify-mate-candidates.ts
 */
import { Chess } from "chess.js";

interface Candidate {
  id: string;
  pattern: string; // pretty pattern name
  fen: string;
  san: string; // mate move
  difficulty: number;
  themes: string[];
  explanation: string;
}

const CANDIDATES: Candidate[] = [
  /* ====================================================================== */
  /*  Back-rank family (variety only — existing seed already has many)        */
  /* ====================================================================== */
  {
    id: "br-rook-corner",
    pattern: "Back Rank Mate",
    fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
    san: "Ra8#",
    difficulty: 1,
    themes: ["back-rank", "rook"],
    explanation: "Classical back-rank mate — the king is trapped behind its own pawns.",
  },
  {
    id: "br-queen",
    pattern: "Back Rank Mate",
    fen: "6k1/5ppp/8/8/8/8/Q4PPP/6K1 w - - 0 1",
    san: "Qa8#",
    difficulty: 2,
    themes: ["back-rank", "queen"],
    explanation: "Queen replaces the rook — same corridor, same coffin.",
  },

  /* ====================================================================== */
  /*  Smothered Mate                                                          */
  /* ====================================================================== */
  {
    id: "smothered-h8-classic",
    pattern: "Smothered Mate",
    fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    san: "Nf7#",
    difficulty: 2,
    themes: ["smothered", "knight"],
    explanation: "Smothered mate. King hemmed in by its own pieces; the knight can't be captured.",
  },
  {
    id: "smothered-h1-classic",
    pattern: "Smothered Mate",
    fen: "6k1/8/8/8/8/7n/6PP/6RK b - - 0 1",
    san: "Nf2#",
    difficulty: 2,
    themes: ["smothered", "knight"],
    explanation: "Smothered mate from Black — Black knight delivers; White king is sealed in by pawns and rook.",
  },
  {
    id: "smothered-philidor-legacy",
    pattern: "Smothered Mate",
    fen: "5rk1/6pp/8/8/8/8/4N3/6K1 w - - 0 1",
    san: "Ng3#",
    difficulty: 3,
    themes: ["smothered", "knight"],
    explanation: "Mate placeholder — see verify output (this candidate may not actually mate).",
  },

  /* ====================================================================== */
  /*  Anastasia's Mate (knight + rook, king on edge)                          */
  /* ====================================================================== */
  {
    id: "anastasia-rh3",
    pattern: "Anastasia's Mate",
    fen: "8/4N1pk/8/8/8/R7/8/6K1 w - - 0 1",
    san: "Rh3#",
    difficulty: 3,
    themes: ["rook", "knight", "edge"],
    explanation: "Anastasia's Mate — knight covers g6/g8, rook delivers along the h-file.",
  },
  {
    id: "anastasia-corner",
    pattern: "Anastasia's Mate",
    fen: "8/4N2k/6p1/8/8/R7/8/6K1 w - - 0 1",
    san: "Rh3#",
    difficulty: 3,
    themes: ["rook", "knight", "edge"],
    explanation: "Anastasia variant — pawn on g6 instead of g7; same h-file mate.",
  },

  /* ====================================================================== */
  /*  Arabian Mate (knight + rook in corner)                                  */
  /* ====================================================================== */
  {
    id: "arabian-corner-h8",
    pattern: "Arabian Mate",
    fen: "7k/8/6N1/8/8/8/8/6KR w - - 0 1",
    san: "Rxh8#",
    difficulty: 2,
    themes: ["arabian", "rook", "knight"],
    explanation: "Arabian Mate — knight covers g8 escape, rook delivers from the corner.",
  },
  {
    id: "arabian-corner-a1",
    pattern: "Arabian Mate",
    fen: "6k1/8/8/8/8/1n6/8/R6K b - - 0 1",
    san: "Rxa1#",
    difficulty: 3,
    themes: ["arabian", "rook", "knight"],
    explanation: "Black-side Arabian — rook captures on a1 with knight covering b1/b2.",
  },

  /* ====================================================================== */
  /*  Boden's Mate (criss-crossed bishops)                                    */
  /* ====================================================================== */
  {
    id: "bodens-criss-cross",
    pattern: "Boden's Mate",
    fen: "1k6/2p5/p7/8/8/8/8/R1B2B1K w - - 0 1",
    san: "Ba6#",
    difficulty: 4,
    themes: ["bishop", "boden"],
    explanation: "Boden's Mate — two bishops crisscross to give a deadly diagonal mate.",
  },

  /* ====================================================================== */
  /*  Damiano's Mate (queen + pawn)                                           */
  /* ====================================================================== */
  {
    id: "damiano-classic",
    pattern: "Damiano's Mate",
    fen: "5rk1/5pPp/6Q1/8/8/8/8/6K1 w - - 0 1",
    san: "Qxh7#",
    difficulty: 3,
    themes: ["damiano", "queen", "pawn"],
    explanation: "Damiano's Mate — pawn on g7 supports the queen's killing blow on h7.",
  },

  /* ====================================================================== */
  /*  Greco's Mate (queen + bishop on same diagonal)                          */
  /* ====================================================================== */
  {
    id: "greco-h-file",
    pattern: "Greco's Mate",
    fen: "6rk/5p1p/8/8/8/8/4B3/6KQ w - - 0 1",
    san: "Qxh7#",
    difficulty: 3,
    themes: ["greco", "queen", "bishop"],
    explanation: "Greco's Mate — bishop on the long diagonal supports the queen on h7.",
  },

  /* ====================================================================== */
  /*  Anderssen's Mate (queen/rook on h-file with pawn support)               */
  /* ====================================================================== */
  {
    id: "anderssen-rh8",
    pattern: "Anderssen's Mate",
    fen: "7k/6pR/6P1/8/8/8/8/6K1 w - - 0 1",
    san: "Rxh8#",
    difficulty: 3,
    themes: ["anderssen", "rook", "pawn"],
    explanation: "Anderssen's Mate — rook captures on h8 supported by the pawn on g6.",
  },

  /* ====================================================================== */
  /*  Opera Mate (rook + bishop along open file)                              */
  /* ====================================================================== */
  {
    id: "opera-classic",
    pattern: "Opera Mate",
    fen: "4kr2/3R1pp1/4B3/8/8/8/8/6K1 w - - 0 1",
    san: "Rxd8#",
    difficulty: 3,
    themes: ["opera", "rook", "bishop"],
    explanation: "Opera Mate — bishop pins the king on the open file; rook delivers.",
  },

  /* ====================================================================== */
  /*  Morphy's Mate (bishop + rook combination)                                */
  /* ====================================================================== */
  {
    id: "morphy-classic",
    pattern: "Morphy's Mate",
    fen: "r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 10",
    san: "Bxd1",
    difficulty: 5,
    themes: ["morphy"],
    explanation: "Placeholder — likely not mate; verify will reject.",
  },

  /* ====================================================================== */
  /*  Pillsbury's Mate (rook + bishop)                                        */
  /* ====================================================================== */
  {
    id: "pillsbury-bishop-rook",
    pattern: "Pillsbury's Mate",
    fen: "6k1/5p2/5Pp1/6P1/8/8/8/3R2KB w - - 0 1",
    san: "Rd8#",
    difficulty: 4,
    themes: ["pillsbury", "rook", "bishop"],
    explanation: "Pillsbury's Mate — long diagonal bishop supports back-rank rook delivery.",
  },

  /* ====================================================================== */
  /*  Lolli's Mate (queen + pawn in opening tactics)                          */
  /* ====================================================================== */
  {
    id: "lolli-h-pawn",
    pattern: "Lolli's Mate",
    fen: "r1bqk2r/pppp1Qpp/2n4n/2b1p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
    san: "Kf8",
    difficulty: 4,
    themes: ["lolli"],
    explanation: "Placeholder — likely not mate; verify will reject.",
  },

  /* ====================================================================== */
  /*  Hook Mate (rook + knight + pawn)                                        */
  /* ====================================================================== */
  {
    id: "hook-knight-rook",
    pattern: "Hook Mate",
    fen: "6k1/5N2/8/5PR1/8/8/8/6K1 w - - 0 1",
    san: "Rg5#",
    difficulty: 4,
    themes: ["hook", "rook", "knight", "pawn"],
    explanation: "Placeholder — verifier will reject if not actually mate.",
  },

  /* ====================================================================== */
  /*  Suffocation Mate (knight, blocked king)                                 */
  /* ====================================================================== */
  {
    id: "suffocation-corner",
    pattern: "Suffocation Mate",
    fen: "6rk/5p1p/6N1/8/8/8/8/6K1 w - - 0 1",
    san: "Nxh7",
    difficulty: 3,
    themes: ["suffocation", "knight"],
    explanation: "Placeholder — verifier will reject if not actually mate.",
  },

  /* ====================================================================== */
  /*  Two Bishops Mate (bishop pair on adjacent diagonals)                    */
  /* ====================================================================== */
  {
    id: "two-bishops-corner",
    pattern: "Two Bishops Mate",
    fen: "k7/8/1KB5/8/8/8/8/4B3 w - - 0 1",
    san: "Bd5#",
    difficulty: 3,
    themes: ["bishop-pair"],
    explanation: "Two bishops corner the king — one cuts off escape, the other delivers.",
  },

  /* ====================================================================== */
  /*  Queen + King mate (Lawnmower-ish on edge)                               */
  /* ====================================================================== */
  {
    id: "queen-king-rim",
    pattern: "Queen Mate (Edge)",
    fen: "k7/2K5/Q7/8/8/8/8/8 w - - 0 1",
    san: "Qa6#",
    difficulty: 1,
    themes: ["queen-mate"],
    explanation: "Basic queen mate — the supporting king takes b6/b7, queen finishes on a-file.",
  },
  {
    id: "queen-king-rim2",
    pattern: "Queen Mate (Edge)",
    fen: "7k/5K2/8/7Q/8/8/8/8 w - - 0 1",
    san: "Qh7#",
    difficulty: 2,
    themes: ["queen-mate"],
    explanation: "Queen mate vs king on h8 — kings opposed at one knight-move apart.",
  },

  /* ====================================================================== */
  /*  Rook + King (Ladder/Lawnmower)                                          */
  /* ====================================================================== */
  {
    id: "ladder-mate",
    pattern: "Ladder Mate (Two Rooks)",
    fen: "7k/R7/1R6/8/8/8/8/6K1 w - - 0 1",
    san: "Ra8#",
    difficulty: 1,
    themes: ["ladder", "two-rooks"],
    explanation: "Two rooks — the lawnmower mate on the back rank.",
  },

  /* ====================================================================== */
  /*  Epaulette Mate (king flanked by own pieces)                             */
  /* ====================================================================== */
  {
    id: "epaulette-classic",
    pattern: "Epaulette Mate",
    fen: "r2k1r2/8/3Q4/8/8/8/8/6K1 w - - 0 1",
    san: "Qd7#",
    difficulty: 3,
    themes: ["epaulette", "queen"],
    explanation: "Epaulette Mate — Black king's own rooks on c8/e8 (the 'epaulettes') deny escape.",
  },

  /* ====================================================================== */
  /*  Dovetail / Cozio's Mate                                                 */
  /* ====================================================================== */
  {
    id: "dovetail-classic",
    pattern: "Dovetail Mate",
    fen: "3r1b2/3k4/3Q4/8/8/8/8/6K1 w - - 0 1",
    san: "Qd6#",
    difficulty: 4,
    themes: ["dovetail", "queen"],
    explanation: "Placeholder — verify; classical dovetail has queen 1 square from the king with own pieces blocking diagonals.",
  },

  /* ====================================================================== */
  /*  Swallow's Tail Mate                                                     */
  /* ====================================================================== */
  {
    id: "swallows-tail",
    pattern: "Swallow's Tail Mate",
    fen: "3rkr2/8/4Q3/8/8/8/8/6K1 w - - 0 1",
    san: "Qe7#",
    difficulty: 3,
    themes: ["swallows-tail", "queen"],
    explanation: "Swallow's Tail — queen mates with own rooks blocking d8/f8.",
  },

  /* ====================================================================== */
  /*  Blackburne's Mate (B+B+N)                                               */
  /* ====================================================================== */
  {
    id: "blackburne-classic",
    pattern: "Blackburne's Mate",
    fen: "5rk1/6pp/8/3B4/8/2B5/8/N5K1 w - - 0 1",
    san: "Bxg7",
    difficulty: 5,
    themes: ["blackburne", "bishop", "knight"],
    explanation: "Placeholder; verifier rejects if not mate.",
  },

  /* ====================================================================== */
  /*  Reti's Mate                                                             */
  /* ====================================================================== */
  {
    id: "reti-classic",
    pattern: "Réti's Mate",
    fen: "rnb1kbnr/ppp2ppp/4p3/3q4/3PB3/2N5/PPP2PPP/R2QK1NR w KQkq - 1 6",
    san: "Bxd5",
    difficulty: 5,
    themes: ["reti"],
    explanation: "Placeholder.",
  },

  /* ====================================================================== */
  /*  Légal's Mate                                                            */
  /* ====================================================================== */
  {
    id: "legals-mate",
    pattern: "Légal's Mate",
    fen: "r1bqkb1r/pppp1Qpp/2n4n/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
    san: "Ke7",
    difficulty: 4,
    themes: ["legal"],
    explanation: "Placeholder.",
  },

  /* ====================================================================== */
  /*  Vukovic's Mate (rook + knight + king)                                   */
  /* ====================================================================== */
  {
    id: "vukovic-classic",
    pattern: "Vukovic's Mate",
    fen: "5k2/8/4KN2/7R/8/8/8/8 w - - 0 1",
    san: "Rh8#",
    difficulty: 3,
    themes: ["vukovic", "rook", "knight"],
    explanation: "Vukovic's Mate — knight + king cover escape, rook delivers along the back rank.",
  },

  /* ====================================================================== */
  /*  Pawn Mate                                                               */
  /* ====================================================================== */
  {
    id: "pawn-mate",
    pattern: "Pawn Mate",
    fen: "6k1/5R1p/6P1/8/8/8/8/6K1 w - - 0 1",
    san: "Rxh7#",
    difficulty: 3,
    themes: ["pawn", "rook"],
    explanation: "Placeholder — verifier checks.",
  },

  /* ====================================================================== */
  /*  Promotion Mate                                                          */
  /* ====================================================================== */
  {
    id: "promotion-queen-mate",
    pattern: "Promotion Mate",
    fen: "6k1/4P1pp/5K2/8/8/8/8/8 w - - 0 1",
    san: "e8=Q#",
    difficulty: 3,
    themes: ["promotion", "queen"],
    explanation: "Pawn promotes with check — supported by the king, the new queen mates immediately.",
  },
  {
    id: "promotion-knight-fork-mate",
    pattern: "Underpromotion Mate",
    fen: "5k2/4P3/5K2/8/8/8/8/8 w - - 0 1",
    san: "e8=Q#",
    difficulty: 3,
    themes: ["promotion", "queen"],
    explanation: "Underpromotion-like mate — pawn promotes with king cover.",
  },

  /* ====================================================================== */
  /*  Discovered Check Mate                                                   */
  /* ====================================================================== */
  {
    id: "discovered-check-rook",
    pattern: "Discovered Mate",
    fen: "6k1/6Pp/5N1K/8/8/8/8/8 w - - 0 1",
    san: "Nxh7",
    difficulty: 3,
    themes: ["discovered", "knight", "pawn"],
    explanation: "Placeholder — verify.",
  },

  /* ====================================================================== */
  /*  Double Check Mate (knight + bishop)                                     */
  /* ====================================================================== */
  {
    id: "double-check-bishop-knight",
    pattern: "Double Check Mate",
    fen: "r1bqk2r/ppp2ppp/2n5/3P4/4n3/8/PPP2PPP/RNBQ1RK1 b kq - 0 1",
    san: "Nf2",
    difficulty: 5,
    themes: ["double-check"],
    explanation: "Placeholder.",
  },

  /* ====================================================================== */
  /*  Queen + Knight Mate (corner)                                            */
  /* ====================================================================== */
  {
    id: "queen-knight-corner",
    pattern: "Queen + Knight Mate",
    fen: "6k1/5N2/6Q1/8/8/8/8/6K1 w - - 0 1",
    san: "Qg7#",
    difficulty: 3,
    themes: ["queen", "knight"],
    explanation: "Queen lands next to the king with knight covering escape.",
  },

  /* ====================================================================== */
  /*  Bishop + Knight Mate (forced corner)                                    */
  /* ====================================================================== */
  {
    id: "bn-corner-mate",
    pattern: "Bishop + Knight Mate",
    fen: "k7/2K5/8/2B5/8/2N5/8/8 w - - 0 1",
    san: "Nb5",
    difficulty: 5,
    themes: ["bishop-knight"],
    explanation: "Placeholder — verifier checks.",
  },
];

let pass = 0;
let fail = 0;
const failed: string[] = [];
for (const c of CANDIDATES) {
  let ch: Chess;
  try {
    ch = new Chess(c.fen);
  } catch (err: any) {
    failed.push(`FEN  ${c.id}  ${err.message}`);
    fail++;
    continue;
  }
  let moveOk = false;
  try {
    const m = ch.move(c.san);
    moveOk = !!m;
  } catch (err: any) {
    failed.push(`SAN  ${c.id}  "${c.san}"  ${err.message}`);
    fail++;
    continue;
  }
  if (!moveOk) {
    failed.push(`SAN  ${c.id}  "${c.san}"  rejected`);
    fail++;
    continue;
  }
  if (!ch.isCheckmate()) {
    failed.push(`MATE ${c.id}  "${c.san}"  not mate`);
    fail++;
    continue;
  }
  pass++;
}

console.log(`PASS ${pass} / ${CANDIDATES.length}`);
if (failed.length) {
  console.log("--- failures ---");
  for (const f of failed) console.log(f);
}
