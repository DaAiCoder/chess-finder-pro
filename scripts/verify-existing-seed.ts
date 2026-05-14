/**
 * Validate the legality + mate of every existing checkmate-pattern seed
 * entry, and emit a clean TS list of those that pass full validation
 * (legal pre-state, SAN legal, move delivers mate).
 *
 * Run: npx tsx scripts/verify-existing-seed.ts
 */
import { Chess } from "chess.js";

const EXISTING = [
  { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", san: "Ra8#", diff: 1, tac: "Back Rank Mate", themes: ["back-rank"], expl: "Back-rank mate: the king is trapped behind its own pawns on the 8th rank." },
  { fen: "6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1", san: "Rb8#", diff: 1, tac: "Back Rank Mate", themes: ["back-rank"], expl: "The rook lands on the b-file into the same back-rank coffin." },
  { fen: "6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1", san: "Rc8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank"], expl: "The c-file is open for a classic eighth-rank mate." },
  { fen: "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1", san: "Rd8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank"], expl: "The d-rook delivers when the king cannot step off the back rank." },
  { fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", san: "Re8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank"], expl: "Same motif from the e-file — recognise the trapped king pattern." },
  { fen: "6k1/5ppp/8/8/8/8/Q4PPP/6K1 w - - 0 1", san: "Qa8#", diff: 2, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "The queen replaces the rook but the idea is identical." },
  { fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1", san: "Qb8#", diff: 2, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "Queen to the b-file — still mate on the light squares of the 8th rank." },
  { fen: "6k1/5ppp/8/8/8/8/2Q2PPP/6K1 w - - 0 1", san: "Qc8#", diff: 2, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "The queen crashes through on the c-file." },
  { fen: "6k1/5ppp/8/8/8/8/3Q1PPP/6K1 w - - 0 1", san: "Qd8#", diff: 2, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "Central queen cuts off the whole rank in one move." },
  { fen: "6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1", san: "Qe8#", diff: 2, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "Queen on e8 — the signature diagram for this tactical class." },
  { fen: "5k2/5p1R/5K2/8/8/8/8/8 w - - 0 1", san: "Rh8#", diff: 3, tac: "Anastasia's Mate", themes: ["rook", "edge"], expl: "Anastasia's mate: rook and the king box the monarch on the rim." },
  { fen: "6k1/5Rpp/5R2/8/8/8/8/6K1 w - - 0 1", san: "Rf8#", diff: 3, tac: "Blind Swine Mate", themes: ["rook", "seventh-rank"], expl: "Two rooks on the seventh — the blind-swine pile-up." },
  { fen: "6k1/5ppp/8/8/8/8/4N2P/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "knight"], expl: "Extra pieces do not change the evaluation — back-rank mate." },
  { fen: "6k1/5ppp/8/8/8/8/3B3P/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "bishop"], expl: "A bishop on the second rank is irrelevant to the rook's corridor mate." },
  { fen: "6k1/5ppp/8/8/8/8/5N1P/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "knight"], expl: "Knights on the second rank cannot patch the air holes on the eighth." },
  { fen: "6k1/5ppp/8/8/8/8/2N4P/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "knight"], expl: "Another cluttered deck — the tactical shot is still Ra8." },
  { fen: "6k1/5ppp/8/8/8/8/1B5P/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "bishop"], expl: "Do not let the extra bishop distract from the weak eighth rank." },
  { fen: "6k1/5ppp/8/8/8/8/6BP/R5K1 w - - 0 1", san: "Ra8#", diff: 2, tac: "Back Rank Mate", themes: ["back-rank", "bishop"], expl: "Same pattern with both bishops at home — Ra8 still ends the game." },
  { fen: "6k1/5ppp/8/8/8/7Q/5PPP/6K1 w - - 0 1", san: "Qc8#", diff: 3, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "The queen steps in from afar — recognise the weak eighth rank from any angle." },
  { fen: "6k1/5ppp/8/8/6Q1/8/5PPP/6K1 w - - 0 1", san: "Qc8#", diff: 3, tac: "Back Rank Mate", themes: ["queen", "back-rank"], expl: "Medium-range queen geometry — the destination square is mate." },
];

let pass = 0;
const passed: typeof EXISTING = [];
for (const e of EXISTING) {
  try {
    const ch = new Chess(e.fen);
    const oppColor = ch.turn() === "w" ? "b" : "w";
    let kingSq: string | null = null;
    const board = ch.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === oppColor) kingSq = String.fromCharCode(97 + f) + (8 - r);
    }
    if (kingSq && ch.isAttacked(kingSq as any, ch.turn())) continue;
    ch.move(e.san);
    if (!ch.isCheckmate()) continue;
    pass++;
    passed.push(e);
  } catch {}
}
console.log(`PASS ${pass} / ${EXISTING.length}`);
