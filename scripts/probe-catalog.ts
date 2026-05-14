/** Probe legal moves for each broken catalog entry. */
import { Chess } from "chess.js";
import { PAWN_STRUCTURES } from "../server/data/pawnStructures.js";
import { STRATEGIC_PLANS } from "../server/data/strategicPlans.js";
import { ENDGAME_STUDIES } from "../server/data/endgameStudies.js";

const reportFen = (label: string, fen: string) => {
  try {
    const c = new Chess(fen);
    const sans = c.moves();
    console.log(`\n${label}\n  fen: ${fen}\n  ${sans.length} legal: ${sans.slice(0, 40).join(", ")}${sans.length > 40 ? ", …" : ""}`);
  } catch (e) {
    console.log(`\n${label} ERR ${(e as Error).message}\n  fen: ${fen}`);
  }
};

for (const s of PAWN_STRUCTURES) {
  s.drills.forEach((d, i) => {
    const c = new Chess(d.fen);
    const mv = c.moves().includes(d.solution);
    if (!mv) reportFen(`pawn:${s.id}:drill#${i} wanted ${d.solution}`, d.fen);
  });
}
for (const p of STRATEGIC_PLANS) {
  const c = new Chess(p.fen);
  const ch = p.choices[p.correctIndex]!;
  if (!c.moves().includes(ch.firstMove)) reportFen(`plan:${p.id} correct wanted ${ch.firstMove}`, p.fen);
  p.choices.forEach((ch2, i) => {
    if (i === p.correctIndex) return;
    const c2 = new Chess(p.fen);
    if (!c2.moves().includes(ch2.firstMove)) reportFen(`plan:${p.id} distractor#${i} wanted ${ch2.firstMove}`, p.fen);
  });
  // Then check canonicalLine
  const c3 = new Chess(p.fen);
  for (let i = 0; i < p.canonicalLine.length; i++) {
    const want = p.canonicalLine[i]!;
    if (!c3.moves().includes(want)) {
      reportFen(`plan:${p.id} line#${i} wanted ${want}`, c3.fen());
      break;
    }
    c3.move(want);
  }
}
for (const s of ENDGAME_STUDIES) {
  const c = new Chess(s.fen);
  if (!c.moves().includes(s.solution)) reportFen(`study:${s.id} wanted ${s.solution}`, s.fen);
  else {
    const c2 = new Chess(s.fen);
    for (let i = 0; i < s.mainline.length; i++) {
      const want = s.mainline[i]!;
      if (!c2.moves().includes(want)) {
        reportFen(`study:${s.id} mainline#${i} wanted ${want}`, c2.fen());
        break;
      }
      c2.move(want);
    }
  }
}
