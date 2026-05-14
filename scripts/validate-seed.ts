/**
 * End-to-end validation of every checkmate-patterns seed entry.
 *
 * Loads CHECKMATE_PATTERNS_SEED from seed-training.ts via tsx, checks
 * legal pre-state (side not to move not in check), legal SAN, and
 * resulting checkmate.
 *
 * Run: npx tsx scripts/validate-seed.ts
 */
import { Chess } from "chess.js";

// Inline parse: read the seed module and execute it under tsx.
// We can't directly import from server/* without ESM hoops, so we
// read seed-training.ts as text and extract the array literal.
import { readFileSync } from "fs";

const src = readFileSync("server/seed-training.ts", "utf8");
const start = src.indexOf("const CHECKMATE_PATTERNS_SEED");
const end = src.indexOf("\n];", start) + 3;
const block = src.slice(start, end);
const arrStart = block.indexOf("[");
const arr = block.slice(arrStart);

interface Entry {
  fen: string;
  solution: string[];
  tacticType: string;
}

// Crude parser — pulls fen and solution from each `{ ... }` chunk.
const entries: Entry[] = [];
const objRe = /\{[\s\S]*?\}/g;
const objMatches = arr.match(objRe) ?? [];
for (const obj of objMatches) {
  const fenMatch = obj.match(/fen:\s*"([^"]+)"/);
  const solMatch = obj.match(/solution:\s*\[([\s\S]*?)\]/);
  const tacMatch = obj.match(/tacticType:\s*"([^"]+)"/);
  if (!fenMatch || !solMatch || !tacMatch) continue;
  const sans = [...solMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  entries.push({ fen: fenMatch[1], solution: sans, tacticType: tacMatch[1] });
}

console.log(`Parsed ${entries.length} seed entries.`);
let pass = 0;
const fails: string[] = [];
for (const e of entries) {
  try {
    const ch = new Chess(e.fen);
    const oppColor = ch.turn() === "w" ? "b" : "w";
    let kingSq: string | null = null;
    const board = ch.board();
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === "k" && p.color === oppColor)
          kingSq = String.fromCharCode(97 + f) + (8 - r);
      }
    if (kingSq && ch.isAttacked(kingSq as any, ch.turn())) {
      fails.push(`PRESTATE  ${e.tacticType}  ${e.fen}`);
      continue;
    }
    ch.move(e.solution[0]);
    if (!ch.isCheckmate()) {
      fails.push(`NOT_MATE  ${e.tacticType}  ${e.fen}  ${e.solution[0]}`);
      continue;
    }
    pass++;
  } catch (err: any) {
    fails.push(`ERROR     ${e.tacticType}  ${e.fen}  ${err.message}`);
  }
}
console.log(`PASS ${pass} / ${entries.length}`);
if (fails.length) {
  console.log("\n--- failures ---");
  for (const f of fails) console.log("  " + f);
}
