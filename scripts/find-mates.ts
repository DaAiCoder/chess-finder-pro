/**
 * Find every mate-in-1 from a given FEN.
 * Usage: npx tsx scripts/find-mates.ts "<fen>"
 */
import { Chess } from "chess.js";

const fen = process.argv[2];
if (!fen) {
  console.error('Usage: npx tsx scripts/find-mates.ts "<fen>"');
  process.exit(1);
}

const ch = new Chess(fen);
const mates: string[] = [];
for (const mv of ch.moves({ verbose: true })) {
  const probe = new Chess(fen);
  probe.move(mv);
  if (probe.isCheckmate()) mates.push(mv.san);
}

console.log("Side to move:", ch.turn());
console.log("Legal moves:", ch.moves().length);
console.log("Mating moves:", mates.length);
for (const m of mates) console.log("  ", m);
