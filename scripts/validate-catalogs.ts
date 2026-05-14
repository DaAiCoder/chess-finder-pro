/**
 * Validate the three new curated catalogs (pawn structures, strategic
 * plans, endgame studies). Reports the first illegal SAN per row so the
 * data can be patched directly.
 */
import { Chess } from "chess.js";
import { PAWN_STRUCTURES } from "../server/data/pawnStructures.js";
import { STRATEGIC_PLANS } from "../server/data/strategicPlans.js";
import { ENDGAME_STUDIES } from "../server/data/endgameStudies.js";

let issues = 0;
const fail = (where: string, why: string) => {
  issues++;
  console.log(`FAIL ${where}: ${why}`);
};

console.log("== pawn structures ==");
for (const s of PAWN_STRUCTURES) {
  try {
    new Chess(s.fen);
  } catch (e) {
    fail(`pawn:${s.id}:overview-fen`, (e as Error).message);
  }
  s.drills.forEach((d, i) => {
    try {
      const c = new Chess(d.fen);
      const mv = c.move(d.solution);
      if (!mv) fail(`pawn:${s.id}:drill#${i}`, `illegal SAN "${d.solution}"`);
    } catch (e) {
      fail(`pawn:${s.id}:drill#${i}`, (e as Error).message);
    }
  });
}

console.log("== strategic plans ==");
for (const p of STRATEGIC_PLANS) {
  try {
    const c = new Chess(p.fen);
    const ch = p.choices[p.correctIndex];
    if (!ch) {
      fail(`plan:${p.id}`, `bad correctIndex ${p.correctIndex}`);
    } else {
      const first = c.move(ch.firstMove);
      if (!first) fail(`plan:${p.id}`, `correct firstMove "${ch.firstMove}" illegal`);
      else {
        for (let i = 1; i < p.canonicalLine.length; i++) {
          const m = c.move(p.canonicalLine[i]!);
          if (!m) {
            fail(`plan:${p.id}:line#${i}`, `"${p.canonicalLine[i]}" illegal`);
            break;
          }
        }
      }
    }
    // Validate non-correct firstMoves are at least legal so the MCQ UI doesn't crash.
    const fresh = new Chess(p.fen);
    p.choices.forEach((ch2, idx) => {
      if (idx === p.correctIndex) return;
      const test = new Chess(p.fen);
      const mv = test.move(ch2.firstMove);
      if (!mv) fail(`plan:${p.id}:distractor#${idx}`, `"${ch2.firstMove}" illegal`);
      // re-use `fresh` only as type guard
      void fresh;
    });
  } catch (e) {
    fail(`plan:${p.id}`, (e as Error).message);
  }
}

console.log("== endgame studies ==");
for (const s of ENDGAME_STUDIES) {
  try {
    const c = new Chess(s.fen);
    const mv = c.move(s.solution);
    if (!mv) fail(`study:${s.id}`, `solution "${s.solution}" illegal`);
    else {
      for (let i = 1; i < s.mainline.length; i++) {
        const m = c.move(s.mainline[i]!);
        if (!m) {
          fail(`study:${s.id}:line#${i}`, `"${s.mainline[i]}" illegal`);
          break;
        }
      }
    }
  } catch (e) {
    fail(`study:${s.id}`, (e as Error).message);
  }
}

if (issues === 0) {
  console.log("\nAll catalog rows validate cleanly.");
} else {
  console.log(`\n${issues} issue(s) found.`);
  process.exitCode = 1;
}
