/** Sanity-check the imagined position for the Scholar's Mate blind tactic. */
import { Chess } from "chess.js";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const moves = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"];

const ch = new Chess(fen);
for (const san of moves) ch.move(san);

console.log("Imagined FEN:", ch.fen());
console.log("Side to move:", ch.turn());
console.log("\nMoves from h5:");
for (const mv of ch.moves({ verbose: true })) {
  if (mv.from === "h5") console.log("  ", mv.san, "->", mv.to);
}
console.log("\nAll legal moves:", ch.moves().slice(0, 30).join(", "));
