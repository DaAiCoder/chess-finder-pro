/**
 * Vendor the Lichess `chess-openings` TSV dataset.
 *
 * Downloads `a.tsv` through `e.tsv` from
 *   https://github.com/lichess-org/chess-openings
 * and writes them under `server/data/openings/` so the runtime
 * `openingsDictionary` can layer them on top of the curated seed.
 *
 * Run via: `npx tsx scripts/fetch-openings.ts`
 *
 * Safe to re-run — the loader merges by id and the seed always wins on
 * conflicts.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const BASE =
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const FILES = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
const OUT_DIR = path.join(process.cwd(), "server", "data", "openings");

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  let downloaded = 0;
  for (const f of FILES) {
    const url = `${BASE}/${f}`;
    process.stdout.write(`  ${f} … `);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`HTTP ${res.status} (skipped)`);
        continue;
      }
      const text = await res.text();
      const dest = path.join(OUT_DIR, f);
      await fs.writeFile(dest, text, "utf8");
      const rows = text.split("\n").filter((l) => l && !l.startsWith("eco")).length;
      console.log(`ok (${rows} rows)`);
      downloaded++;
    } catch (err) {
      console.log(`failed: ${(err as Error).message}`);
    }
  }
  if (downloaded === 0) {
    console.error("\nNo files downloaded. The Pattern Finder will still work");
    console.error("with its curated seed (~120 popular openings).");
    process.exitCode = 1;
  } else {
    console.log(`\nVendored ${downloaded}/${FILES.length} files into ${OUT_DIR}`);
  }
}

main();
