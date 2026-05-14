/**
 * Validate every BLIND_TACTICS entry:
 *   - startFen parses
 *   - each playedMoves SAN is legal in sequence
 *   - solution SAN is legal from the resulting position
 *
 * Run: npx tsx scripts/validate-blind-tactics.ts
 */
import { Chess } from "chess.js";
import { BLIND_TACTICS } from "../server/data/blindTactics.js";

let pass = 0;
const fails: string[] = [];
for (const t of BLIND_TACTICS) {
  try {
    const ch = new Chess(t.startFen);
    for (const san of t.playedMoves) {
      const mv = ch.move(san);
      if (!mv) throw new Error(`bad SAN "${san}"`);
    }
    const solution = ch.move(t.solution);
    if (!solution) throw new Error(`bad solution "${t.solution}"`);
    pass++;
  } catch (err: any) {
    fails.push(`${t.id} (${t.theme}) — ${err.message}`);
  }
}
console.log(`PASS ${pass} / ${BLIND_TACTICS.length}`);
if (fails.length) {
  console.log("\n--- failures ---");
  for (const f of fails) console.log("  " + f);
}
