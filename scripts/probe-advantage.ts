/** Probe the broken convert-advantage opposition puzzle. */
import { Chess } from "chess.js";

function probe(label: string, fen: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`FEN: ${fen}`);
  const ch = new Chess(fen);
  console.log(`Side to move: ${ch.turn()}`);
  const moves = ch.moves({ verbose: true });
  console.log(`Legal moves: ${moves.map((m) => m.san).join(", ")}`);
  console.log(`Kd5 legal? ${moves.some((m) => m.san === "Kd5")}`);
}

probe("Original (broken)", "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1");
probe("Variant: black king on e7", "8/4k3/8/8/4K3/8/4P3/8 w - - 0 1");
