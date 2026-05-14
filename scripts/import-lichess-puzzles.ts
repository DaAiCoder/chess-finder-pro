/**
 * Import puzzles from the Lichess puzzle database into `training_problems`.
 *
 * Lichess publishes the entire puzzle catalogue (~4M positions, CC0) as a
 * single CSV at <https://database.lichess.org/lichess_db_puzzle.csv.zst>.
 * The file is zstd-compressed; decompress it once locally (e.g. with
 * 7-Zip) and pass the resulting .csv path to this script.
 *
 * CSV columns:
 *   PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays,
 *   Themes, GameUrl, OpeningTags
 *
 * Per Lichess: the FEN is the position BEFORE the opponent's setup move,
 * and `Moves` is a space-separated UCI list where the first move is the
 * opponent's move (which lands you in the puzzle position). Subsequent
 * moves are the solution sequence. We pre-apply that first move so the
 * stored FEN is the puzzle position itself, matching how PuzzlePlayer
 * expects to be set up.
 *
 * Usage (from the repo root):
 *
 *   npm run import:puzzles -- ./lichess_db_puzzle.csv
 *   npm run import:puzzles -- ./puzzles.csv --max 10000
 *   npm run import:puzzles -- ./puzzles.csv --min-rating 1400 --max-rating 1800
 *   npm run import:puzzles -- ./puzzles.csv --themes mateIn2,backRankMate --max 500
 *
 * The script reads the CSV line-by-line so memory stays flat regardless
 * of file size. Inserted rows get `module: "tactics"` and
 * `source: "lichess-puzzle"`.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { storage } from "../server/storage.js";
import type { InsertTrainingProblem } from "../shared/schema.js";

interface CliArgs {
  csvPath: string;
  max: number;
  minRating: number;
  maxRating: number;
  themes: Set<string> | null;
  /** Insert only every Nth row that passes the filter — quick way to get a diverse sample. */
  sample: number;
  /** When >0, caps puzzles per (difficulty-band, primary-theme) bucket. */
  perBucket: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith("-")) {
    console.error(
      "Usage: npm run import:puzzles -- <csvPath> [--max N] [--min-rating N] [--max-rating N] [--themes a,b,c] [--sample N]",
    );
    process.exit(2);
  }
  const csvPath = args[0];
  let max = Infinity;
  let minRating = 0;
  let maxRating = 4000;
  let themes: Set<string> | null = null;
  let sample = 1;
  let perBucket = 0;
  for (let i = 1; i < args.length; i++) {
    const next = () => args[++i];
    switch (args[i]) {
      case "--max":
        max = Math.max(1, Number(next()));
        break;
      case "--min-rating":
        minRating = Math.max(0, Number(next()));
        break;
      case "--max-rating":
        maxRating = Math.max(0, Number(next()));
        break;
      case "--themes":
        themes = new Set(
          next()
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        );
        break;
      case "--sample":
        sample = Math.max(1, Number(next()));
        break;
      case "--per-bucket":
        // Balanced ingest: cap inserts per (difficulty, primary theme)
        // bucket. Pairs well with `--max` for a deck with a known
        // distribution of motifs.
        perBucket = Math.max(1, Number(next()));
        break;
    }
  }
  return { csvPath, max, minRating, maxRating, themes, sample, perBucket };
}

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    await stat(args.csvPath);
  } catch {
    console.error(`CSV not found: ${args.csvPath}`);
    console.error(
      "Download from https://database.lichess.org/lichess_db_puzzle.csv.zst and decompress.",
    );
    process.exit(1);
  }

  await storage.init();

  console.log(`Reading puzzles from ${args.csvPath}`);
  if (args.themes) console.log(`Filter themes: ${[...args.themes].join(", ")}`);
  console.log(`Rating range: ${args.minRating}–${args.maxRating}`);
  console.log(`Cap: ${args.max === Infinity ? "no limit" : args.max} · sample 1/${args.sample}`);
  if (args.perBucket > 0) {
    console.log(`Balanced: cap ${args.perBucket} per (difficulty, theme) bucket`);
  }
  console.log("");

  const stream = createReadStream(args.csvPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let header = true;
  let scanned = 0;
  let kept = 0;
  let inserted = 0;
  let skipped = 0;
  let sampleCounter = 0;
  const bucketCounts = new Map<string, number>();
  const startedAt = Date.now();

  for await (const raw of lines) {
    if (header) {
      header = false;
      continue;
    }
    if (!raw) continue;
    scanned++;

    const cols = parseCsvLine(raw);
    if (cols.length < 8) {
      skipped++;
      continue;
    }
    const [puzzleId, fenRaw, movesRaw, ratingStr, , , , themesRaw] = cols;

    const rating = Number(ratingStr);
    if (!Number.isFinite(rating) || rating < args.minRating || rating > args.maxRating) {
      skipped++;
      continue;
    }

    const themeList = themesRaw
      ? themesRaw.split(/\s+/).filter(Boolean)
      : [];
    if (args.themes && !themeList.some((t) => args.themes!.has(t))) {
      skipped++;
      continue;
    }

    sampleCounter++;
    if (sampleCounter % args.sample !== 0) {
      skipped++;
      continue;
    }

    // Convert UCI sequence + raw FEN into our shape: pre-apply opponent's
    // setup move, then store remaining moves as SAN.
    const built = buildProblem(fenRaw, movesRaw, themeList, rating, puzzleId);
    if (!built) {
      skipped++;
      continue;
    }

    if (args.perBucket > 0) {
      const bucket = `${built.difficulty}|${(built.themes?.[0] ?? "_") as string}`;
      const have = bucketCounts.get(bucket) ?? 0;
      if (have >= args.perBucket) {
        skipped++;
        continue;
      }
      bucketCounts.set(bucket, have + 1);
    }

    try {
      await storage.createTrainingProblem(built);
      inserted++;
      kept++;
    } catch (err) {
      skipped++;
      console.warn(
        `\n  ${puzzleId}: insert failed: ${(err as Error).message}`,
      );
    }

    if (kept % 250 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      const rate = (inserted / Math.max(1, Number(elapsed))).toFixed(0);
      process.stdout.write(
        `\r  scanned ${scanned.toLocaleString()} · inserted ${inserted.toLocaleString()} · ${rate}/s · ${elapsed}s`,
      );
    }

    if (inserted >= args.max) break;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log("\n");
  console.log(`Done in ${elapsed}s`);
  console.log(`  scanned    : ${scanned.toLocaleString()}`);
  console.log(`  inserted   : ${inserted.toLocaleString()}`);
  console.log(`  skipped    : ${skipped.toLocaleString()}`);
}

/**
 * Build a single InsertTrainingProblem from one CSV row.
 *
 * Returns null if the position is invalid or chess.js can't parse the
 * moves — those rows are silently skipped.
 */
function buildProblem(
  fen: string,
  movesRaw: string,
  themes: string[],
  rating: number,
  puzzleId: string,
): InsertTrainingProblem | null {
  const ucis = movesRaw.split(/\s+/).filter(Boolean);
  if (ucis.length < 2) return null; // need at least setup + one solution

  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }

  // Lichess convention: first move is the opponent's setup move that
  // creates the puzzle position. Apply it so the stored FEN is what the
  // user actually sees on the board.
  const setupMove = applyUci(board, ucis[0]);
  if (!setupMove) return null;
  const puzzleFen = board.fen();

  // Remaining moves are the solution. Convert UCI → SAN by re-applying
  // each move on a fresh board so PuzzlePlayer's SAN matcher works.
  const solution: string[] = [];
  const probe = new Chess(puzzleFen);
  for (let i = 1; i < ucis.length; i++) {
    const m = applyUci(probe, ucis[i]);
    if (!m) return null;
    solution.push(m.san);
  }

  return {
    module: "tactics",
    fen: puzzleFen,
    solution,
    difficulty: ratingToDifficulty(rating),
    themes,
    tacticType: themes[0] ?? "tactics",
    explanation: `Lichess puzzle ${puzzleId} — rating ${rating}.`,
    source: "lichess-puzzle",
    metadata: {
      puzzleId,
      rating,
      themes,
      provider: "lichess",
    },
  };
}

function applyUci(c: Chess, uci: string): { san: string } | null {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4) : undefined;
  try {
    const m = c.move({ from, to, promotion });
    return m ? { san: m.san } : null;
  } catch {
    return null;
  }
}

function ratingToDifficulty(rating: number): number {
  if (rating < 1200) return 1;
  if (rating < 1500) return 2;
  if (rating < 1800) return 3;
  if (rating < 2100) return 4;
  return 5;
}

/**
 * Tiny CSV parser tuned for the Lichess puzzle file. Handles
 * double-quoted fields and embedded commas; doesn't support escaped
 * quotes (Lichess never emits them in this dataset).
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
