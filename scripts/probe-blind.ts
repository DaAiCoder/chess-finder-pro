/** Quick probe — print legal moves at each ply. */
import { Chess } from "chess.js";

function trace(label: string, fen: string, plies: string[]) {
  console.log(`\n=== ${label} ===`);
  const ch = new Chess(fen);
  console.log(`start  side=${ch.turn()}`);
  for (const san of plies) {
    const legal = ch.moves();
    const mv = ch.move(san);
    if (!mv) {
      console.log(`FAIL at "${san}". side=${ch.turn()} fen=${ch.fen()}`);
      console.log("  legal: " + legal.join(", "));
      return;
    }
    console.log(`  ${san} -> side=${ch.turn()} fen=${ch.fen()}`);
  }
}

trace(
  "knight-fork-exchange",
  "r4rk1/pp3ppp/2p5/8/1bN5/2N5/PPP2PPP/2KR3R w - - 0 1",
  ["Nd5"]
);
trace(
  "queen-recapture",
  "r3k2r/ppp2ppp/2n5/3qp3/4P3/2N5/PPP2PPP/R2QKB1R w KQkq - 0 1",
  ["Nxd5"]
);
trace(
  "symmetric-castle",
  "r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 1",
  ["Bc4"]
);
