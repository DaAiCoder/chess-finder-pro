/**
 * Build verified mate-in-1 seed entries from candidate FENs.
 *
 * Each candidate is a FEN + intended pattern label. The script:
 *   1. Loads the FEN.
 *   2. Verifies the side NOT to move is not already in check (legal pre-state).
 *   3. Enumerates legal moves; keeps any move that delivers checkmate.
 *   4. Picks the first mating move (or `preferSan` if specified) as the answer.
 *
 * Output is a TS snippet ready to paste into `CHECKMATE_PATTERNS_SEED`.
 *
 * Run: npx tsx scripts/build-mate-seeds.ts
 */
import { Chess } from "chess.js";

interface Stub {
  pattern: string;
  fen: string;
  difficulty: number;
  themes: string[];
  explanation: string;
  preferSan?: string;
}

const STUBS: Stub[] = [
  /* ---------- Back-rank family (rook far from h-file) ---------- */
  { pattern: "Back Rank Mate", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", difficulty: 1, themes: ["back-rank", "rook"], explanation: "Classical back-rank mate — the king is trapped behind its own pawns." },
  { pattern: "Back Rank Mate", fen: "6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1", difficulty: 1, themes: ["back-rank", "rook"], explanation: "Same back-rank coffin from the b-file." },
  { pattern: "Back Rank Mate", fen: "6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1", difficulty: 1, themes: ["back-rank", "rook"], explanation: "Back-rank mate from the c-file." },
  { pattern: "Back Rank Mate", fen: "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1", difficulty: 1, themes: ["back-rank", "rook"], explanation: "Back-rank mate from the d-file." },
  { pattern: "Back Rank Mate (Queen)", fen: "6k1/5ppp/8/8/8/8/Q4PPP/6K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "queen"], explanation: "Queen replaces the rook — same corridor mate." },
  { pattern: "Back Rank Mate (Queen)", fen: "6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "queen"], explanation: "Queen mate on the back rank from the e-file." },
  { pattern: "Back Rank Mate (Queen)", fen: "6k1/5ppp/8/8/8/8/3Q1PPP/6K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "queen"], explanation: "Central queen lifts to deliver back-rank mate." },
  { pattern: "Back Rank Mate (Bishop)", fen: "6k1/5ppp/8/8/8/8/3B3P/R5K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "rook", "bishop"], explanation: "Extra bishop is irrelevant — back-rank mate stands." },

  /* ---------- Smothered Mate (knight one move from f7) ---------- */
  { pattern: "Smothered Mate", fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1", difficulty: 2, themes: ["smothered", "knight"], explanation: "Smothered Mate — king sealed by its own pieces; knight delivers from f7." },
  { pattern: "Smothered Mate (knight on g5)", fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["smothered", "knight"], explanation: "Knight on g5 jumps to f7 to deliver the smothered mate." },
  { pattern: "Smothered Mate (knight on d6)", fen: "6rk/6pp/3N4/8/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["smothered", "knight"], explanation: "Knight from d6 hops to f7 — king cannot escape." },
  { pattern: "Smothered Mate (knight on d8)", fen: "3N2rk/6pp/8/8/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["smothered", "knight"], explanation: "Knight on d8 swings to f7 to seal the smother." },

  /* ---------- Anastasia's Mate (knight on e7, rook NOT yet on h-file) ---------- */
  { pattern: "Anastasia's Mate", fen: "8/4N1pk/8/8/8/R7/8/6K1 w - - 0 1", difficulty: 3, themes: ["anastasia", "knight", "rook"], explanation: "Anastasia's Mate — knight covers g6/g8, rook lifts to the h-file." },
  { pattern: "Anastasia's Mate", fen: "R7/4N1pk/8/8/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["anastasia", "knight", "rook"], explanation: "Rook swings from a8 to h-file with knight covering both g-squares." },

  /* ---------- Arabian Mate (knight covers escape, rook arrives) ---------- */
  { pattern: "Arabian Mate", fen: "7k/8/5N1K/8/8/8/8/R7 w - - 0 1", difficulty: 3, themes: ["arabian", "rook", "knight"], explanation: "Arabian — knight covers g8/h7 from f6, king blocks g7, rook swings to h-file." },
  { pattern: "Arabian Mate (queenside)", fen: "k7/8/2N1K3/8/8/8/8/7R w - - 0 1", difficulty: 3, themes: ["arabian", "rook", "knight"], explanation: "Queenside Arabian — knight on c6 covers a7/b8, rook delivers along the back rank." },

  /* ---------- Vukovic's Mate (king + knight + rook) ---------- */
  { pattern: "Vukovic's Mate", fen: "5k2/5N2/5K2/7R/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["vukovic", "rook", "knight"], explanation: "Vukovic's Mate — knight + king cover all escape squares; rook delivers from the side." },
  { pattern: "Vukovic's Mate (variant)", fen: "5k2/8/5KN1/7R/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["vukovic", "rook", "knight"], explanation: "Knight on g6 covers f8/h8 escape; rook delivers along the 8th." },

  /* ---------- Two Bishops (king nearby, bishops not yet attacking king) ---------- */
  { pattern: "Two Bishops Mate", fen: "k7/2K5/2B5/8/4B3/8/8/8 w - - 0 1", difficulty: 4, themes: ["bishop-pair"], explanation: "Two-bishop coordination — verifier picks the legal mating bishop move." },
  { pattern: "Two Bishops Mate", fen: "k7/2K5/3B4/4B3/8/8/8/8 w - - 0 1", difficulty: 4, themes: ["bishop-pair"], explanation: "Bishops criss-cross diagonals to net the cornered king." },

  /* ---------- Ladder / Lawnmower ---------- */
  { pattern: "Ladder Mate (two rooks)", fen: "7k/R7/1R6/8/8/8/8/6K1 w - - 0 1", difficulty: 1, themes: ["ladder", "two-rooks"], explanation: "Two-rook lawnmower — rook seals the back rank with the partner cutting off escape." },
  { pattern: "Ladder Mate (Q + R)", fen: "7k/R7/6Q1/8/8/8/8/6K1 w - - 0 1", difficulty: 1, themes: ["ladder", "queen", "rook"], explanation: "Queen and rook combine on the back rank." },
  { pattern: "Ladder Mate (Q + R)", fen: "k7/8/Q7/1R6/8/8/8/6K1 w - - 0 1", difficulty: 1, themes: ["ladder", "queen", "rook"], explanation: "Q+R ladder — queen approaches; rook seals the file." },

  /* ---------- Queen Mate (Edge / Capablanca) ---------- */
  { pattern: "Queen Mate (Edge)", fen: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Queen mate on h8 — king's flight square covered by white king." },
  { pattern: "Queen Mate (Edge)", fen: "8/3k4/3KQ3/8/8/8/8/8 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Mid-board Q+K mate — queen lands a knight's-jump from the lone king." },
  { pattern: "Queen Mate (Edge)", fen: "8/8/8/3k4/8/3K4/3Q4/8 w - - 0 1", difficulty: 1, themes: ["queen-mate"], explanation: "Capablanca's standard Q+K mate — queen takes opposition." },

  /* ---------- Rook Mate (Edge) ---------- */
  { pattern: "Rook Mate (Edge)", fen: "7k/8/6K1/8/8/8/8/R7 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook + king mate on the rim — king cuts off h7 escape." },
  { pattern: "Rook Mate (Edge)", fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook delivers on the back rank — king covers escape squares." },
  { pattern: "Rook Mate (Edge)", fen: "4k3/8/4K3/8/8/8/8/4R3 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Standard K+R mate up the open e-file." },
  { pattern: "Rook Mate (Edge)", fen: "8/8/8/8/3k4/3K4/8/3R4 b - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Black to find — rook + king coordinate up the open d-file." },

  /* ---------- Epaulette Mate ---------- */
  { pattern: "Epaulette Mate", fen: "r2k1r2/3Q4/3K4/8/8/8/8/8 w - - 0 1", difficulty: 4, themes: ["epaulette", "queen"], explanation: "Epaulette Mate — Black king's own rooks (the epaulettes) prevent escape." },

  /* ---------- Promotion Mates ---------- */
  { pattern: "Promotion Mate (Queen)", fen: "6k1/4P3/6K1/8/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["promotion", "queen"], explanation: "Pawn promotes to queen — king on g6 covers all escape squares." },
  { pattern: "Promotion Mate (Knight)", fen: "1q6/3P4/1K1k4/8/8/8/8/8 w - - 0 1", difficulty: 5, themes: ["promotion", "knight", "underpromotion"], explanation: "Underpromotion to knight — only the knight delivers the discovered mate." },

  /* ---------- Heavy-Piece Battery ---------- */
  { pattern: "Heavy-Piece Battery", fen: "6k1/5ppp/8/8/8/8/8/Q3R1K1 w - - 0 1", difficulty: 2, themes: ["queen", "rook", "battery"], explanation: "Queen + rook battery on the back rank." },

  /* ---------- Queen + Knight cooperation ---------- */
  { pattern: "Queen + Knight Mate", fen: "5rk1/4Np1p/8/8/8/8/8/4Q2K w - - 0 1", difficulty: 4, themes: ["queen", "knight"], explanation: "Knight on e7 covers d5/f5/g6/g8; queen delivers on the long diagonal." },

  /* ---------- Knight + Rook cooperation ---------- */
  { pattern: "Knight + Rook Mate", fen: "6k1/5Npp/8/8/8/8/8/4R1K1 w - - 0 1", difficulty: 3, themes: ["knight", "rook"], explanation: "Knight on f7 + rook on the back rank — verifier picks the mating move." },

  /* ---------- Suffocation Mate ---------- */
  { pattern: "Suffocation Mate", fen: "6rk/5ppp/8/6N1/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["suffocation", "knight"], explanation: "Suffocation Mate — knight checks; king's flight squares are all occupied by own pieces." },

  /* ---------- Pawn-Supported Queen Mate ---------- */
  { pattern: "Pawn-Supported Queen Mate", fen: "7k/5p1Q/5P2/8/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["queen", "pawn"], explanation: "Pawn cuts off escape; queen lands next to the king with no captor." },

  /* ---------- Damiano's Mate (queen invasion behind the g-pawn) ---------- */
  { pattern: "Damiano's Bishop Mate", fen: "5rk1/5pPp/7B/8/8/8/8/4Q2K w - - 0 1", difficulty: 5, themes: ["damiano", "bishop", "queen"], explanation: "Damiano-style — queen and bishop combine behind the wedged g-pawn." },

  /* ---------- Anderssen's Mate (rook on g-file with pawn support) ---------- */
  { pattern: "Anderssen's Mate", fen: "7k/6P1/7K/8/8/8/8/R7 w - - 0 1", difficulty: 4, themes: ["anderssen", "rook", "pawn"], explanation: "Anderssen — pawn on g7 + king h6 cover escape; rook delivers from the back rank." },

  /* ---------- Hook Mate ---------- */
  { pattern: "Hook Mate", fen: "5R1k/5Npp/6P1/8/8/8/8/6K1 w - - 0 1", difficulty: 4, themes: ["hook", "rook", "knight", "pawn"], explanation: "Hook Mate — rook + knight + pawn form the supporting hook." },

  /* ---------- Knight Rim Mate (king + knight + rook on edge) ---------- */
  { pattern: "Knight Rim Mate", fen: "5k2/5R2/4N3/4K3/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["knight", "rook", "king"], explanation: "King + knight cover f-file escape; rook delivers — clean Vukovic-style mate." },

  /* ---------- Knight + King cooperation (queenside) ---------- */
  { pattern: "Knight + King Box", fen: "k7/2K5/8/2N5/8/8/8/R7 w - - 0 1", difficulty: 3, themes: ["knight", "rook"], explanation: "Knight covers a-file/b-file; rook delivers along the back rank." },

  /* ---------- Diagonal Q+B coordination ---------- */
  { pattern: "Diagonal Q+B Mate", fen: "6k1/5pp1/7p/8/8/3B4/8/Q5K1 w - - 0 1", difficulty: 4, themes: ["queen", "bishop"], explanation: "Bishop pins escape diagonals; queen lands the killing blow." },

  /* ---------- Two Rooks lawnmower (separate setup) ---------- */
  { pattern: "Two Rooks Mate", fen: "k7/8/2K5/8/8/8/R7/2R5 w - - 0 1", difficulty: 1, themes: ["two-rooks"], explanation: "Lawnmower with both rooks active." },

  /* ---------- Queen on 7th rank ---------- */
  { pattern: "Queen on 7th Mate", fen: "6k1/4Q1pp/8/8/8/8/8/6K1 w - - 0 1", difficulty: 3, themes: ["queen", "seventh-rank"], explanation: "Queen lands on the 7th next to the king — own pawns prevent escape." },

  /* ---------- Bishop sacrifice variants ---------- */
  { pattern: "Bishop Sacrifice Mate", fen: "6k1/5p1p/6p1/8/8/4B3/8/3R2K1 w - - 0 1", difficulty: 4, themes: ["bishop", "rook"], explanation: "Bishop holds the diagonal; rook delivers on the open file." },

  /* ---------- Pillsbury / Long-Diagonal pure setup ---------- */
  { pattern: "Pillsbury's Mate", fen: "6k1/6p1/8/8/8/8/B7/4R1K1 w - - 0 1", difficulty: 4, themes: ["pillsbury", "rook", "bishop"], explanation: "Pillsbury — bishop on long diagonal supports the back-rank rook." },
  { pattern: "Long Diagonal Mate", fen: "6k1/8/8/8/B7/8/8/3R2K1 w - - 0 1", difficulty: 3, themes: ["bishop", "rook", "diagonal"], explanation: "Bishop on the long diagonal + rook on the back rank — corridor mate." },

  /* ---------- Bishop + Knight Mate (final position) ---------- */
  { pattern: "Bishop + Knight Mate", fen: "8/8/3K4/8/3N4/8/B7/k7 w - - 0 1", difficulty: 5, themes: ["bishop-knight"], explanation: "B + N + K vs K — the famous hardest basic mate." },

  /* ---------- Mayet's Mate ---------- */
  { pattern: "Mayet's Mate", fen: "8/8/8/3k4/8/3K4/3B4/3R4 w - - 0 1", difficulty: 4, themes: ["bishop", "rook"], explanation: "Bishop + rook + king box the lone king on the d-file." },

  /* ---------- King + Knight + Bishop (Capablanca-style) ---------- */
  { pattern: "Bishop + Knight Mate (variant)", fen: "8/8/8/8/3K4/3N4/3B4/k7 w - - 0 1", difficulty: 5, themes: ["bishop-knight"], explanation: "Bishop + knight maneuver to deliver the long-known basic mate." },

  /* ---------- Capablanca Q+K Mate ---------- */
  { pattern: "Capablanca Q+K Mate", fen: "8/8/3K4/3Q4/8/3k4/8/8 b - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Black to find — queen + king coordinate against the lone king." },

  /* ---------- Discovered checks ---------- */
  { pattern: "Discovered Check Mate", fen: "6k1/5pPp/8/8/8/8/8/6KR w - - 0 1", difficulty: 4, themes: ["discovered", "rook"], explanation: "Pawn move uncovers the rook on the h-file — verifier confirms mate." },
  { pattern: "Pawn Promotion Mate", fen: "1k6/P1K5/8/8/8/8/8/8 w - - 0 1", difficulty: 4, themes: ["promotion", "queen"], explanation: "Promote and mate — verifier picks the legal promotion piece." },

  /* ---------- Smothered Mate (queenside variant) ---------- */
  { pattern: "Smothered Mate (queenside)", fen: "kr6/pp6/8/3N4/8/8/8/6K1 w - - 0 1", difficulty: 4, themes: ["smothered", "knight", "queenside"], explanation: "Queenside smothered — knight from d5 hops to b6 with king fully blocked." },

  /* ---------- Boden's Mate (criss-cross bishops) ---------- */
  { pattern: "Boden's Mate", fen: "1k1r4/2p5/p7/8/8/2B5/8/2B3K1 w - - 0 1", difficulty: 5, themes: ["boden", "bishop"], explanation: "Boden's Mate — verifier picks which bishop delivers; the criss-cross is decisive." },

  /* ---------- Greco's Mate ---------- */
  { pattern: "Greco's Mate", fen: "6rk/5p2/8/4B3/8/8/7P/6KQ w - - 0 1", difficulty: 5, themes: ["greco", "queen", "bishop"], explanation: "Queen + bishop combine on the cornered king's pocket." },

  /* ---------- Queen Lift Mates (queen swings in along rank/file) ---------- */
  { pattern: "Queen Lift Mate", fen: "7k/5K2/8/8/8/Q7/8/8 w - - 0 1", difficulty: 3, themes: ["queen-mate", "queen-lift"], explanation: "Queen lifts along rank 3 to the h-file — king on f7 covers all flight squares." },
  { pattern: "Queen Lift Mate", fen: "7k/8/5K2/8/8/8/8/Q7 w - - 0 1", difficulty: 3, themes: ["queen-mate", "queen-lift"], explanation: "Queen swings across the back rank to deliver — supporting king covers g7/g8 escape." },
  { pattern: "Queen Lift Mate", fen: "k7/2K5/8/8/8/8/8/Q7 w - - 0 1", difficulty: 2, themes: ["queen-mate", "queen-lift"], explanation: "Queen swings up the a-file with king blocking c-file escape." },
  { pattern: "Queen Lift Mate", fen: "k7/2K5/8/8/8/8/Q7/8 w - - 0 1", difficulty: 2, themes: ["queen-mate", "queen-lift"], explanation: "Queen on a2 swings to a7 — king covers b-file escape." },

  /* ---------- Rook Lift to Back Rank (rook starts off file) ---------- */
  { pattern: "Rook Lift Mate", fen: "7k/6K1/8/8/8/8/R7/8 w - - 0 1", difficulty: 2, themes: ["rook-mate", "rook-lift"], explanation: "Rook swings to the back rank — king on g7 covers all flight squares." },
  { pattern: "Rook Lift Mate", fen: "7k/8/6K1/8/8/8/R7/8 w - - 0 1", difficulty: 2, themes: ["rook-mate", "rook-lift"], explanation: "Rook lifts up the a-file with king cutting off g7/g8." },

  /* ---------- Pawn promotion creating support ---------- */
  { pattern: "Promotion Mate", fen: "6k1/5P2/6K1/8/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["promotion", "queen"], explanation: "Pawn promotes with king already covering escape — mate immediately." },

  /* ---------- Long-diagonal queen ---------- */
  { pattern: "Long Diagonal Queen Mate", fen: "7k/5K2/8/8/8/8/8/Q7 w - - 0 1", difficulty: 3, themes: ["queen-mate", "long-diagonal"], explanation: "Queen invades along the long diagonal to deliver mate next to the cornered king." },

  /* ---------- Knight + Queen swing ---------- */
  { pattern: "Knight + Queen Mate", fen: "7k/5N2/6K1/8/8/8/8/Q7 w - - 0 1", difficulty: 3, themes: ["queen", "knight"], explanation: "Knight on f7 covers escapes; queen swings in for the kill." },

  /* ---------- Open-board queen + king (Capablanca) ---------- */
  { pattern: "Capablanca Q+K Mate", fen: "8/8/3k4/8/3K4/8/8/3Q4 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Q+K mate up the open d-file." },
  { pattern: "Capablanca Q+K Mate", fen: "8/8/4k3/8/4K3/8/4Q3/8 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Standard Q+K formation — queen lifts to deliver." },

  /* ---------- Two Bishops Mate (corner with both bishops swinging) ---------- */
  { pattern: "Two Bishops Mate", fen: "7k/8/5K2/8/8/8/B7/7B w - - 0 1", difficulty: 4, themes: ["bishop-pair"], explanation: "Bishops swing onto adjacent diagonals to net the cornered king." },

  /* ---------- Promote-and-pin / discovered ---------- */
  { pattern: "Promotion Mate (Bishop discovers)", fen: "8/3P4/8/8/8/8/8/k1K4B w - - 0 1", difficulty: 5, themes: ["promotion", "discovered"], explanation: "Promote with discovered effect — verifier picks the legal mating promotion." },

  /* ---------- King + Knight + Pawn (King's-Field-style) ---------- */
  { pattern: "King's Field Mate", fen: "8/8/8/8/8/4k3/5p2/5K2 b - - 0 1", difficulty: 3, themes: ["king-field", "pawn"], explanation: "Black to mate — pawn delivers the king's-field-style mate." },

  /* ====================================================================== */
  /*  Additional Queen Lift / King-Q swing positions                          */
  /* ====================================================================== */
  { pattern: "Queen Swing Mate", fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1", difficulty: 2, themes: ["queen-mate", "queen-lift"], explanation: "Queen swings up the c-file to the back rank — supporting king covers b7/b8." },
  { pattern: "Queen Swing Mate", fen: "k7/8/2K5/8/8/8/8/Q7 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Queen swings up the a-file with supporting king." },
  { pattern: "Queen Swing Mate", fen: "k7/8/2K5/8/8/8/8/4Q3 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Queen swings to back rank or down a-file — verifier picks." },
  { pattern: "Queen Swing Mate (h-file)", fen: "7k/8/6K1/8/8/8/8/4Q3 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Queen swings to the h-file with king covering g7/g8." },
  { pattern: "Queen Swing Mate (h-file)", fen: "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Central queen swings right to deliver corner mate." },
  { pattern: "Queen Swing Mate", fen: "7k/8/6K1/8/8/8/8/Q7 w - - 0 1", difficulty: 2, themes: ["queen-mate"], explanation: "Queen swings across to deliver." },

  /* ====================================================================== */
  /*  Additional Rook + King basics (different king positions)                */
  /* ====================================================================== */
  { pattern: "Rook + King Mate", fen: "7k/8/5K2/8/8/8/R7/8 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook lifts to the back rank — king covers g7/g8 escape." },
  { pattern: "Rook + King Mate", fen: "k7/8/2K5/8/8/8/R7/8 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook lifts to a-file — king covers b-file." },
  { pattern: "Rook + King Mate", fen: "k7/8/2K5/8/8/8/8/R7 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook swings up the a-file." },
  { pattern: "Rook + King Mate (centre)", fen: "8/8/3k4/8/8/3K4/8/3R4 w - - 0 1", difficulty: 2, themes: ["rook-mate"], explanation: "Rook lifts up the d-file with king controlling escape." },

  /* ====================================================================== */
  /*  Knight + Knight + Queen sweep                                            */
  /* ====================================================================== */
  { pattern: "Q+N Coordination", fen: "6k1/5N1p/7P/6K1/8/8/8/Q7 w - - 0 1", difficulty: 4, themes: ["queen", "knight", "pawn"], explanation: "Knight + pawn cover escape; queen delivers from afar." },

  /* ====================================================================== */
  /*  Promotion variants                                                       */
  /* ====================================================================== */
  { pattern: "Promotion Mate", fen: "5k2/4P3/4K3/8/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["promotion", "queen"], explanation: "Pawn promotes — verifier confirms legal mating promotion." },
  { pattern: "Promotion Mate", fen: "3k4/3P4/3K4/8/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["promotion", "queen"], explanation: "Pawn promotes — king covers all escape squares." },
  { pattern: "Promotion Mate", fen: "1k6/2P5/1K6/8/8/8/8/8 w - - 0 1", difficulty: 3, themes: ["promotion", "queen"], explanation: "Underpromotion or queen — verifier picks the legal mating piece." },
  { pattern: "Promotion Mate (Knight)", fen: "1q5k/3P2K1/8/8/8/8/8/8 w - - 0 1", difficulty: 5, themes: ["promotion", "knight", "underpromotion"], explanation: "Only knight underpromotion mates — queen leads to stalemate or escape." },

  /* ====================================================================== */
  /*  Back-rank variations                                                      */
  /* ====================================================================== */
  { pattern: "Back Rank Mate (Queen)", fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "queen"], explanation: "Queen to the b-file — back-rank mate." },
  { pattern: "Back Rank Mate (Queen)", fen: "6k1/5ppp/8/8/8/8/2Q2PPP/6K1 w - - 0 1", difficulty: 2, themes: ["back-rank", "queen"], explanation: "Queen on c-file delivers back-rank mate." },
  { pattern: "Back Rank Mate (Long Queen)", fen: "6k1/5ppp/8/8/8/7Q/5PPP/6K1 w - - 0 1", difficulty: 3, themes: ["back-rank", "queen"], explanation: "Long-range queen invasion — h-file queen swings into back rank." },
  { pattern: "Back Rank Mate (Long Queen)", fen: "6k1/5ppp/8/8/6Q1/8/5PPP/6K1 w - - 0 1", difficulty: 3, themes: ["back-rank", "queen"], explanation: "Mid-board queen swings to back rank for mate." },

  /* ====================================================================== */
  /*  Q + R combinations                                                       */
  /* ====================================================================== */
  { pattern: "Q + R Mate", fen: "6k1/5ppp/8/8/8/8/R7/3Q2K1 w - - 0 1", difficulty: 3, themes: ["queen", "rook"], explanation: "Queen swings to back rank — rook backs up." },

  /* ====================================================================== */
  /*  Centralised mates                                                         */
  /* ====================================================================== */
  { pattern: "Central Q Mate", fen: "8/8/5k2/4Q3/8/4K3/8/8 w - - 0 1", difficulty: 3, themes: ["queen-mate"], explanation: "Central queen mate — king opposed for support." },
  { pattern: "Central R Mate", fen: "8/8/3k4/3R4/8/3K4/8/8 w - - 0 1", difficulty: 3, themes: ["rook-mate"], explanation: "Rook delivers central mate with king supporting." },

  /* ====================================================================== */
  /*  Knight-rim mates (king on edge)                                          */
  /* ====================================================================== */
  { pattern: "Knight Rim Mate", fen: "5k2/8/4NK2/7R/8/8/8/8 w - - 0 1", difficulty: 4, themes: ["knight", "rook"], explanation: "Knight on e6 covers d8/f8/d4 etc; rook delivers on the 5th." },

  /* ====================================================================== */
  /*  Multi-piece variants                                                     */
  /* ====================================================================== */
  { pattern: "Q + B Mate", fen: "7k/6p1/8/8/B7/8/8/Q5K1 w - - 0 1", difficulty: 4, themes: ["queen", "bishop"], explanation: "Bishop + queen coordinate on the long diagonal and back rank." },
  { pattern: "Q + N Mate", fen: "5rk1/8/4N3/8/8/8/8/Q5K1 w - - 0 1", difficulty: 3, themes: ["queen", "knight"], explanation: "Knight covers f8 escape; queen swings to long diagonal." },

  /* ====================================================================== */
  /*  Bishop + Rook combos                                                    */
  /* ====================================================================== */
  { pattern: "B + R Mate", fen: "6k1/8/B7/8/8/8/8/3R2K1 w - - 0 1", difficulty: 4, themes: ["bishop", "rook"], explanation: "Bishop on the long diagonal supports rook landing on the 8th." },

  /* ====================================================================== */
  /*  Suffocation / smothered variants with extra pieces                       */
  /* ====================================================================== */
  { pattern: "Smothered Mate (extra defender)", fen: "1n4rk/5Npp/8/8/8/8/8/6K1 b - - 0 1", difficulty: 4, themes: ["smothered", "knight"], explanation: "Black-side smothered finale — verifier confirms the mating move." },
];

interface Result {
  stub: Stub;
  san: string | null;
  options: string[];
  reason?: string;
}

const results: Result[] = [];
const seenFenSan = new Set<string>();

for (const stub of STUBS) {
  let ch: Chess;
  try {
    ch = new Chess(stub.fen);
  } catch (err: any) {
    results.push({ stub, san: null, options: [], reason: `bad-fen ${err.message}` });
    continue;
  }
  const opponentColor = ch.turn() === "w" ? "b" : "w";
  let opponentKingSq: string | null = null;
  const board = ch.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === opponentColor) {
        opponentKingSq = String.fromCharCode(97 + f) + (8 - r);
      }
    }
  }
  if (opponentKingSq && ch.isAttacked(opponentKingSq as any, ch.turn())) {
    results.push({ stub, san: null, options: [], reason: "opponent-already-in-check" });
    continue;
  }
  const mates: string[] = [];
  for (const mv of ch.moves({ verbose: true })) {
    const probe = new Chess(stub.fen);
    probe.move(mv);
    if (probe.isCheckmate()) mates.push(mv.san);
  }
  let chosen: string | null = null;
  if (stub.preferSan) chosen = mates.find((m) => m === stub.preferSan) ?? null;
  if (!chosen && mates.length >= 1) chosen = mates[0];
  results.push({ stub, san: chosen, options: mates, reason: chosen ? undefined : "no-mate" });
}

const ok = results.filter((r) => r.san);
const bad = results.filter((r) => !r.san);

console.log(`OK ${ok.length} / ${STUBS.length}`);
if (bad.length) {
  console.log("\n--- positions filtered out ---");
  for (const r of bad) console.log(`  ${r.reason}  ${r.stub.pattern}  fen=${r.stub.fen}`);
}

console.log("\n--- TS seed snippets ---");
let kept = 0;
for (const r of ok) {
  const dedupeKey = `${r.stub.fen}|${r.san}`;
  if (seenFenSan.has(dedupeKey)) continue;
  seenFenSan.add(dedupeKey);
  kept++;
  const themes = JSON.stringify(r.stub.themes);
  const cleanExpl = r.stub.explanation.replace(/"/g, '\\"');
  console.log(`  {
    module: "checkmate-patterns",
    fen: "${r.stub.fen}",
    solution: ["${r.san}"],
    difficulty: ${r.stub.difficulty},
    themes: ${themes},
    tacticType: "${r.stub.pattern}",
    explanation:
      "${cleanExpl}",
    source: "seed",
  },`);
}
console.log(`\n${kept} verified entries (after dedupe).`);
