import { Chess } from "chess.js";
import { CALCULATION_STUDIO } from "../server/data/calculationStudio.js";

let issues = 0;
for (const p of CALCULATION_STUDIO) {
  try {
    const c = new Chess(p.fen);
    if ((c.turn() === "w" ? "white" : "black") !== p.sideToMove) {
      console.log(`FAIL ${p.id}: sideToMove mismatch (FEN says ${c.turn()})`);
      issues++;
    }
    p.solution.forEach((san, i) => {
      const mv = c.move(san);
      if (!mv) {
        console.log(`FAIL ${p.id} #${i}: illegal "${san}" (legal: ${c.moves().slice(0, 20).join(", ")})`);
        issues++;
        throw new Error("stop");
      }
    });
  } catch (e) {
    if ((e as Error).message !== "stop") {
      console.log(`FAIL ${p.id}: ${(e as Error).message}`);
      issues++;
    }
  }
}
console.log(issues === 0 ? "OK" : `${issues} issues`);
process.exitCode = issues === 0 ? 0 : 1;
