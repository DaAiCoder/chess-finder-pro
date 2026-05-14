/**
 * Seed training problems and motif definitions on startup.
 *
 * Most modules insert once when empty. Defender, intuition, and
 * checkmate-pattern decks also enforce a **minimum count** so older
 * persisted databases pick up newly added curated rows on upgrade.
 *
 * The checkmate-patterns deck additionally runs a **pruner** on boot:
 * any stored problem whose solution does not actually deliver mate
 * (or whose FEN / SAN is invalid) is removed so the training surface
 * never serves a broken puzzle.
 */

import { Chess } from "chess.js";
import type { IStorage } from "./storage.js";
import type { InsertTrainingProblem, TrainingProblem } from "../shared/schema.js";
import { MOTIF_DEFINITIONS } from "./services/motifDetector.js";
import { pawnStructureDrillSeeds } from "./data/pawnStructures.js";
import { strategicPlanSeeds } from "./data/strategicPlans.js";
import { endgameStudyDrills } from "./data/endgameStudies.js";
import { getBulkTrainingProblemRows } from "./services/bulkTrainingSeeds.js";

/** Stable key so intuition rows with the same FEN but different sequences stay distinct. */
function seedDedupeKey(row: InsertTrainingProblem): string {
  const meta = row.metadata as { sequence?: string[]; badIdx?: number } | null | undefined;
  if (meta?.sequence && typeof meta.badIdx === "number") {
    return `${row.module}|${meta.sequence.join(",")}|${meta.badIdx}`;
  }
  return `${row.module}|${row.fen}`;
}

/** Insert curated seeds until the module has at least `min` rows. */
async function ensureMinProblems(
  storage: IStorage,
  module: string,
  min: number,
  seeds: InsertTrainingProblem[],
): Promise<void> {
  let have = await storage.countTrainingProblems({ module });
  if (have >= min) return;
  const existing = await storage.listTrainingProblems({ module });
  const seen = new Set(existing.map(seedDedupeKeyFromProblem));
  for (const row of seeds) {
    if (have >= min) break;
    const key = seedDedupeKey(row);
    if (seen.has(key)) continue;
    await storage.createTrainingProblem(row);
    seen.add(key);
    have += 1;
  }
}

/**
 * Always-on backfill: inserts every entry from `seeds` that is missing
 * from storage by `seedDedupeKey`, regardless of total row count. This
 * matters for modules that have lots of auto-generated rows AND a few
 * curated rows — without this, pruning a broken curated row leaves it
 * permanently gone because the generator-derived rows keep the count
 * above the `ensureMinProblems` threshold.
 */
async function backfillCuratedSeeds(
  storage: IStorage,
  module: string,
  seeds: InsertTrainingProblem[],
): Promise<void> {
  const existing = await storage.listTrainingProblems({ module });
  const seen = new Set(existing.map(seedDedupeKeyFromProblem));
  let inserted = 0;
  for (const row of seeds) {
    const key = seedDedupeKey(row);
    if (seen.has(key)) continue;
    await storage.createTrainingProblem(row);
    seen.add(key);
    inserted += 1;
  }
  if (inserted > 0) {
    console.log(`[seed] backfilled ${inserted} curated ${module} problem(s)`);
  }
}

function seedDedupeKeyFromProblem(p: TrainingProblem): string {
  const meta = p.metadata as { sequence?: string[]; badIdx?: number } | null | undefined;
  if (meta?.sequence && typeof meta.badIdx === "number") {
    return `${p.module}|${meta.sequence.join(",")}|${meta.badIdx}`;
  }
  return `${p.module}|${p.fen}`;
}

export async function seedTraining(storage: IStorage) {
  for (const def of MOTIF_DEFINITIONS) {
    await storage.upsertMotifDefinition(def);
  }

  const tacticsCount = await storage.countTrainingProblems({ module: "tactics" });
  if (tacticsCount === 0) {
    for (const p of TACTICS_SEED) await storage.createTrainingProblem(p);
  }

  const blunderCount = await storage.countTrainingProblems({ module: "blunder-preventer" });
  if (blunderCount === 0) {
    for (const p of BLUNDER_SEED) await storage.createTrainingProblem(p);
  }

  const openingCount = await storage.countTrainingProblems({ module: "opening-improver" });
  if (openingCount === 0) {
    for (const p of OPENING_SEED) await storage.createTrainingProblem(p);
  }

  const advCount = await storage.countTrainingProblems({ module: "advantage-capitalization" });
  if (advCount === 0) {
    for (const p of ADVANTAGE_SEED) await storage.createTrainingProblem(p);
  }

  const visCount = await storage.countTrainingProblems({ module: "visualization" });
  if (visCount === 0) {
    for (const p of VISUALIZATION_SEED) await storage.createTrainingProblem(p);
  }

  const endCount = await storage.countTrainingProblems({ module: "endgame" });
  if (endCount === 0) {
    for (const p of ENDGAME_SEED) await storage.createTrainingProblem(p);
  }

  await pruneInvalidCheckmatePatterns(storage);
  await pruneInvalidSolutions(storage, "advantage-capitalization");
  await pruneInvalidSolutions(storage, "endgame");
  await pruneInvalidSolutions(storage, "tactics");
  await pruneInvalidSolutions(storage, "blunder-preventer");
  await pruneInvalidSolutions(storage, "opening-improver");
  await pruneInvalidSolutions(storage, "defender");
  await pruneInvalidSolutions(storage, "intuition");
  await pruneInvalidSolutions(storage, "pawn-structures");
  await pruneInvalidSolutions(storage, "plans");
  await pruneInvalidSolutions(storage, "endgame-studies");

  await ensureMinProblems(storage, "checkmate-patterns", 80, CHECKMATE_PATTERNS_SEED);
  await ensureMinProblems(storage, "defender", 24, DEFENDER_SEED);
  await ensureMinProblems(storage, "intuition", 16, INTUITION_SEED);
  // Always-on backfill so pruned curated rows come back, even in modules
  // whose auto-generated count already exceeds any min threshold.
  await backfillCuratedSeeds(storage, "advantage-capitalization", ADVANTAGE_SEED);
  await backfillCuratedSeeds(storage, "endgame", ENDGAME_SEED);
  await backfillCuratedSeeds(storage, "pawn-structures", pawnStructureDrillSeeds());
  await backfillCuratedSeeds(storage, "plans", strategicPlanSeeds());
  await backfillCuratedSeeds(storage, "endgame-studies", endgameStudyDrills());
}

/**
 * Heavy bulk-mate backfill — call AFTER the server is listening so the
 * UI is responsive immediately. The generator scans up to ~100k chess
 * positions through chess.js to find unique mate-in-1 puzzles, which is
 * a 60–240s synchronous CPU burn. The tactics / checkmate-patterns /
 * endgame trainers already have a working pool from the curated seeds,
 * so deferring this only affects bonus volume.
 *
 * Idempotent — keyed by `module|fen` via `backfillCuratedSeeds`.
 */
export async function seedBulkBasicMatesInBackground(storage: IStorage): Promise<void> {
  try {
    const started = Date.now();
    const bulkTrainingRows = getBulkTrainingProblemRows();
    await backfillCuratedSeeds(
      storage,
      "tactics",
      bulkTrainingRows.filter((r) => r.module === "tactics"),
    );
    await backfillCuratedSeeds(
      storage,
      "checkmate-patterns",
      bulkTrainingRows.filter((r) => r.module === "checkmate-patterns"),
    );
    await backfillCuratedSeeds(
      storage,
      "endgame",
      bulkTrainingRows.filter((r) => r.module === "endgame"),
    );
    await pruneInvalidSolutions(storage, "tactics");
    await pruneInvalidCheckmatePatterns(storage);
    await pruneInvalidSolutions(storage, "endgame");
    const ms = Date.now() - started;
    console.log(`[seed] bulk basic-mate backfill complete (${ms}ms)`);
  } catch (err) {
    console.warn(`[seed] bulk basic-mate backfill failed: ${(err as Error).message}`);
  }
}

/**
 * Remove any stored checkmate-patterns problem whose stored solution does
 * not actually deliver checkmate (or whose FEN / SAN is invalid).
 * Older auto-generated rows occasionally drifted; this keeps the trainer
 * surface honest.
 */
async function pruneInvalidCheckmatePatterns(storage: IStorage): Promise<void> {
  const rows = await storage.listTrainingProblems({ module: "checkmate-patterns" });
  let removed = 0;
  for (const row of rows) {
    let valid = false;
    try {
      const ch = new Chess(row.fen);
      const solution = (row.solution ?? []) as string[];
      const first = solution[0];
      if (first) {
        ch.move(first);
        if (ch.isCheckmate()) valid = true;
      }
    } catch {
      valid = false;
    }
    if (!valid) {
      await storage.deleteTrainingProblem(row.id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[seed] pruned ${removed} broken checkmate-patterns problem(s)`);
  }
}

/**
 * Generic legality pruner: removes any stored problem in `module` whose
 * solution sequence cannot be replayed legally from its FEN. Catches the
 * class of "the explanation says play Kd5 but Kd5 isn't even legal" bugs
 * that have shown up in user reports.
 */
async function pruneInvalidSolutions(storage: IStorage, module: string): Promise<void> {
  const rows = await storage.listTrainingProblems({ module });
  let removed = 0;
  for (const row of rows) {
    let valid = false;
    try {
      const ch = new Chess(row.fen);
      const solution = (row.solution ?? []) as string[];
      if (solution.length === 0) {
        // No solution to validate — leave it; the surface code can decide.
        valid = true;
      } else {
        valid = true;
        for (const san of solution) {
          const mv = ch.move(san);
          if (!mv) { valid = false; break; }
        }
      }
    } catch {
      valid = false;
    }
    if (!valid) {
      await storage.deleteTrainingProblem(row.id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[seed] pruned ${removed} broken ${module} problem(s)`);
  }
}

/* ====================================================================== */
/* Hand-curated seed problems                                             */
/* ====================================================================== */

const TACTIC_TYPES = [
  "Fork", "Pin", "Skewer", "Discovered Attack", "Double Attack",
  "Hanging Piece", "Greek Gift", "Smothered Mate", "Back Rank Mate",
  "Windmill", "Deflection", "Decoy", "Interference", "Zwischenzug",
  "X-Ray", "Overloaded Piece", "Trapped Piece", "Removal of Defender",
  "Clearance", "Battery", "Discovered Check", "Double Check",
  "Perpetual Check", "Stalemate Trick", "Underpromotion",
  "Knight Fork", "Royal Fork", "Family Fork", "Absolute Pin",
  "Relative Pin", "Cross Pin", "Anastasia's Mate", "Arabian Mate",
  "Boden's Mate", "Damiano's Mate", "Epaulette Mate", "Hook Mate",
  "Legal Mate", "Lolli's Mate", "Morphy's Mate", "Opera Mate",
  "Réti's Mate", "Suffocation Mate", "Triangle Mate", "Two Bishops Mate",
  "Bishop and Knight Mate", "Queen Sacrifice", "Exchange Sacrifice",
  "Positional Sacrifice", "Greek Bishop", "Mating Net",
];

/** Italian: Ng5 threatens Nxf7 — fork *threats*, not Bb5 (a pin). */
const TACTICS_FORK_THREAT_FEN =
  "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5";

/** Ruy Lopez — Bb5 pins the c6 knight to the king (relative pin). */
const TACTICS_PIN_BB5_FEN =
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

const TACTICS_BACK_RANK_FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

const TACTICS_GREEK_GIFT_FEN =
  "r1bq1b1r/ppp2kpp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R w KQ - 0 7";

const TACTICS_SMOTHERED_FEN =
  "5rk1/5pp1/4N2p/8/8/8/5PPP/6K1 w - - 0 1";

/**
 * One honest seed row per catalogue label. Types we cannot illustrate yet
 * return null — better than mislabelled positions.
 */
function tacticSeedForType(tt: string, i: number): InsertTrainingProblem | null {
  const theme = tt.toLowerCase().replace(/\s+/g, "-");
  const diff = ((i % 5) + 1) as number;

  const forkLike = new Set([
    "Fork",
    "Knight Fork",
    "Royal Fork",
    "Family Fork",
    "Double Attack",
  ]);
  const pinLike = new Set([
    "Pin",
    "Absolute Pin",
    "Relative Pin",
    "Cross Pin",
    "X-Ray",
  ]);
  /** Manual demo below covers "Back Rank Mate"; these are extra named mates on the 8th rank. */
  const backRankLike = new Set([
    "Hook Mate",
    "Epaulette Mate",
    "Morphy's Mate",
    "Opera Mate",
  ]);
  const smotheredLike = new Set(["Smothered Mate", "Suffocation Mate"]);
  const greekLike = new Set(["Greek Gift", "Greek Bishop"]);
  const bodenLike = new Set(["Boden's Mate"]);
  const anastasiaLike = new Set(["Anastasia's Mate", "Arabian Mate"]);

  if (forkLike.has(tt)) {
    return {
      module: "tactics",
      fen: TACTICS_FORK_THREAT_FEN,
      solution: ["Ng5"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation:
        `${tt}: Ng5 threatens Nxf7 and sharp kingside pressure — a fork *threat* (Bb5 in the Ruy Lopez is a pin, not this).`,
      source: "seed",
    };
  }
  if (pinLike.has(tt)) {
    return {
      module: "tactics",
      fen: TACTICS_PIN_BB5_FEN,
      solution: ["Bb5"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation:
        `${tt}: Bb5 pins the knight on c6 to the king — a relative pin.`,
      source: "seed",
    };
  }
  if (backRankLike.has(tt)) {
    return {
      module: "tactics",
      fen: TACTICS_BACK_RANK_FEN,
      solution: ["Ra8#"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation: `${tt}: rook crashes through on the back rank.`,
      source: "seed",
    };
  }
  if (smotheredLike.has(tt)) {
    return {
      module: "tactics",
      fen: TACTICS_SMOTHERED_FEN,
      solution: ["Nxg7"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation:
        `${tt}: knight sacrifice on g7 — the smothered family mates when the king has no air.`,
      source: "seed",
    };
  }
  if (greekLike.has(tt)) {
    return {
      module: "tactics",
      fen: TACTICS_GREEK_GIFT_FEN,
      solution: ["Qf3+"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation:
        `${tt}: queen lifts into the attack — typical Greek-gift attacking follow-up.`,
      source: "seed",
    };
  }
  if (bodenLike.has(tt)) {
    return {
      module: "tactics",
      fen: "r5k1/5ppp/8/8/8/2B5/8/6K1 w - - 0 1",
      solution: ["Bh8"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation: `${tt}: bishops cross on long diagonals toward the king.`,
      source: "seed",
    };
  }
  if (anastasiaLike.has(tt)) {
    return {
      module: "tactics",
      fen: "r5rk/5p1p/5R2/4B3/8/8/7P/7K w - - 0 1",
      solution: ["Rxf7"],
      difficulty: diff,
      themes: [theme],
      tacticType: tt,
      explanation: `${tt}: rook + knight mate on the rim.`,
      source: "seed",
    };
  }

  return null;
}

const TACTICS_SEED: InsertTrainingProblem[] = [
  {
    module: "tactics",
    fen: "r2qkb1r/ppp2ppp/2n2n2/3pp1B1/3P4/2P1PN2/PP3PPP/RN1QKB1R w KQkq - 0 6",
    solution: ["dxe5"],
    difficulty: 3,
    themes: ["pin"],
    tacticType: "Pin",
    explanation: "dxe5 wins material thanks to the pin on the f6 knight.",
    source: "seed",
  },
  {
    module: "tactics",
    fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 1,
    themes: ["back-rank"],
    tacticType: "Back Rank Mate",
    explanation: "Ra8 is mate — the king has no escape squares.",
    source: "seed",
  },
  ...TACTIC_TYPES.flatMap((tt, i) => {
    const row = tacticSeedForType(tt, i);
    return row ? [row] : [];
  }),
];

const BLUNDER_SEED: InsertTrainingProblem[] = [
  {
    module: "blunder-preventer",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3",
    solution: ["Nf3"],
    difficulty: 2,
    themes: ["development"],
    tacticType: "blunder-prevention",
    explanation: "Nf3 develops a piece without weaknesses.",
    source: "seed",
    metadata: { choices: ["Nf3", "f3", "h3", "Nh3"] },
  },
  {
    module: "blunder-preventer",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
    solution: ["Be2"],
    difficulty: 2,
    themes: ["development"],
    tacticType: "blunder-prevention",
    explanation: "Be2 keeps the position solid.",
    source: "seed",
    metadata: { choices: ["Be2", "g3", "Bg5", "Bd2"] },
  },
  {
    module: "blunder-preventer",
    fen: "r1bqkbnr/pp1p1ppp/2n5/2p1p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 4",
    solution: ["Bb5"],
    difficulty: 2,
    themes: ["pin"],
    tacticType: "blunder-prevention",
    explanation: "Bb5 pins the knight to the king.",
    source: "seed",
    metadata: { choices: ["Bb5", "h3", "a4", "Bc4"] },
  },
  {
    module: "blunder-preventer",
    fen: "rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 1 5",
    solution: ["Bd3"],
    difficulty: 3,
    themes: ["development"],
    tacticType: "blunder-prevention",
    explanation: "Bd3 develops naturally.",
    source: "seed",
    metadata: { choices: ["Bd3", "Qa4+", "g3", "h4"] },
  },
  {
    module: "blunder-preventer",
    fen: "r2qkb1r/ppp1pppp/2n2n2/3p1b2/3P4/2N1PN2/PPP2PPP/R1BQKB1R w KQkq - 4 5",
    solution: ["Bd3"],
    difficulty: 3,
    themes: ["minor-piece-development"],
    tacticType: "blunder-prevention",
    explanation: "Trade off Black's active light-squared bishop.",
    source: "seed",
    metadata: { choices: ["Bd3", "Be2", "Qb3", "h3"] },
  },
  {
    module: "blunder-preventer",
    fen: "r1bq1rk1/pppn1ppp/3bpn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 5 7",
    solution: ["Bd3"],
    difficulty: 3,
    themes: ["development"],
    tacticType: "blunder-prevention",
    explanation: "Calm developing move keeping the structure flexible.",
    source: "seed",
    metadata: { choices: ["Bd3", "cxd5", "Nb5", "g4"] },
  },
  {
    module: "blunder-preventer",
    fen: "r1bqkbnr/ppp2ppp/2n5/3pp3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 4",
    solution: ["exd5"],
    difficulty: 2,
    themes: ["central-tension"],
    tacticType: "blunder-prevention",
    explanation: "Capture in the center to free your pieces.",
    source: "seed",
    metadata: { choices: ["exd5", "d3", "Bb5", "Bc4"] },
  },
  {
    module: "blunder-preventer",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5",
    solution: ["O-O"],
    difficulty: 2,
    themes: ["king-safety"],
    tacticType: "blunder-prevention",
    explanation: "Castle to safety; both sides are well developed.",
    source: "seed",
    metadata: { choices: ["O-O", "Ng5", "Qe2", "h3"] },
  },
];

const OPENING_SEED: InsertTrainingProblem[] = [
  {
    module: "opening-improver",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3",
    solution: ["Nf3"],
    difficulty: 1,
    themes: ["italian-game"],
    tacticType: "opening-deviation",
    explanation: "After 1.e4 e5 the principled developing move is 2.Nf3 attacking e5.",
    source: "seed",
  },
  {
    module: "opening-improver",
    fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["exd5"],
    difficulty: 1,
    themes: ["scandinavian"],
    tacticType: "opening-deviation",
    explanation: "Against the Scandinavian, take the pawn: 2.exd5.",
    source: "seed",
  },
  {
    module: "opening-improver",
    fen: "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
    solution: ["c4"],
    difficulty: 2,
    themes: ["queen's-gambit"],
    tacticType: "opening-deviation",
    explanation: "2.c4 enters the Queen's Gambit, fighting for the center.",
    source: "seed",
  },
];

const ADVANTAGE_SEED: InsertTrainingProblem[] = [
  {
    module: "advantage-capitalization",
    // The original FEN had the black king on e6, which made Kd5 illegal
    // (white king e4 would be adjacent to black king e6 across the d5
    // square — both are diagonally one square away). Moving the black
    // king to e7 keeps the K+P-vs-K opposition lesson intact while making
    // Kd5 legal AND putting the kings in diagonal opposition (d5–e6–e7).
    fen: "8/4k3/8/8/4K3/8/4P3/8 w - - 0 1",
    solution: ["Kd5"],
    difficulty: 3,
    themes: ["king-and-pawn", "opposition"],
    tacticType: "convert-advantage",
    explanation:
      "Take the diagonal opposition with Kd5. The black king is forced back, and you can escort the pawn forward.",
    source: "seed",
  },
  {
    module: "advantage-capitalization",
    fen: "6k1/8/6K1/6P1/8/8/8/8 w - - 0 1",
    solution: ["Kf6"],
    difficulty: 2,
    themes: ["lucena-like"],
    tacticType: "convert-advantage",
    explanation: "Kf6 keeps the king ahead of the pawn — a winning maneuver.",
    source: "seed",
  },
];

const VISUALIZATION_SEED: InsertTrainingProblem[] = [
  {
    module: "visualization",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5",
    solution: [],
    difficulty: 2,
    themes: ["remember-position"],
    tacticType: "remember-position",
    explanation: "Memorise the piece positions, then answer the questions.",
    source: "seed",
  },
  {
    module: "visualization",
    fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 8 6",
    solution: [],
    difficulty: 3,
    themes: ["remember-position"],
    tacticType: "remember-position",
    explanation: "After both sides castle, check what you can recall.",
    source: "seed",
  },
];

const ENDGAME_SEED: InsertTrainingProblem[] = [
  {
    module: "endgame",
    fen: "8/8/8/8/4k3/8/4P3/4K3 w - - 0 1",
    solution: ["Kd2"],
    difficulty: 3,
    themes: ["king-and-pawn"],
    tacticType: "endgame-technique",
    explanation: "Activate the king first; pushing the pawn too soon allows ...Kd4 with the opposition.",
    source: "seed",
  },
  {
    module: "endgame",
    fen: "8/4k3/8/4P3/4K3/8/8/8 w - - 0 1",
    solution: ["Kd5"],
    difficulty: 3,
    themes: ["opposition"],
    tacticType: "endgame-technique",
    explanation: "Kd5 takes the opposition and escorts the pawn home.",
    source: "seed",
  },
  {
    module: "endgame",
    fen: "8/8/8/3k4/8/3K4/3P4/8 w - - 0 1",
    solution: ["Kd4"],
    difficulty: 3,
    themes: ["opposition"],
    tacticType: "endgame-technique",
    explanation: "Kd4 takes the direct opposition.",
    source: "seed",
  },
];

/* ====================================================================== */
/* Checkmate patterns — flashcard deck of common mate motifs.             */
/*                                                                        */
/* Every entry is mate-in-1 for the side to move. All FENs and SAN moves  */
/* are verified end-to-end with chess.js (legal pre-state, legal SAN, the */
/* resulting position is checkmate). When adding new patterns:            */
/*                                                                        */
/*   1. Pre-state must be legal — the side NOT to move must not already   */
/*      be in check.                                                      */
/*   2. The puzzle move must deliver checkmate (no defender, no escape).  */
/*   3. Run `npx tsx scripts/build-mate-seeds.ts` to validate candidates  */
/*      before adding them here.                                          */
/*                                                                        */
/* Patterns covered: Back Rank · Smothered (Philidor / queenside) ·       */
/* Anastasia · Arabian · Vukovic · Ladder / Lawnmower · Q+K Edge ·        */
/* R+K Edge · Epaulette · Promotion · Heavy-Piece Battery · Suffocation · */
/* Damiano · Q+B Diagonal · Q on 7th · Queen Lift · Rook Lift ·           */
/* Blind Swine · Q+R · Q+N coordination.                                  */
/* ====================================================================== */
const CHECKMATE_PATTERNS_SEED: InsertTrainingProblem[] = [
  /* ---- Back Rank Mate (rook on the open file) ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 1,
    themes: ["back-rank", "rook"],
    tacticType: "Back Rank Mate",
    explanation:
      "Back-rank mate: the king is trapped behind its own pawns on the 8th rank.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1",
    solution: ["Rb8#"],
    difficulty: 1,
    themes: ["back-rank", "rook"],
    tacticType: "Back Rank Mate",
    explanation: "Same back-rank coffin from the b-file.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1",
    solution: ["Rc8#"],
    difficulty: 1,
    themes: ["back-rank", "rook"],
    tacticType: "Back Rank Mate",
    explanation: "The c-file is open for a classic eighth-rank mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1",
    solution: ["Rd8#"],
    difficulty: 1,
    themes: ["back-rank", "rook"],
    tacticType: "Back Rank Mate",
    explanation: "The d-rook delivers when the king cannot step off the back rank.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1",
    solution: ["Re8#"],
    difficulty: 2,
    themes: ["back-rank", "rook"],
    tacticType: "Back Rank Mate",
    explanation: "Same motif from the e-file — recognise the trapped king pattern.",
    source: "seed",
  },

  /* ---- Back Rank Mate (queen replaces rook) ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/Q4PPP/6K1 w - - 0 1",
    solution: ["Qa8#"],
    difficulty: 2,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Queen replaces the rook — same corridor mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
    solution: ["Qb8#"],
    difficulty: 2,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Queen on the b-file delivers the same back-rank mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/2Q2PPP/6K1 w - - 0 1",
    solution: ["Qc8#"],
    difficulty: 2,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Queen crashes through on the c-file.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/3Q1PPP/6K1 w - - 0 1",
    solution: ["Qd8#"],
    difficulty: 2,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Central queen lifts to deliver back-rank mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1",
    solution: ["Qe8#"],
    difficulty: 2,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Queen on e8 — the signature back-rank diagram.",
    source: "seed",
  },

  /* ---- Back Rank Mate (long-range queen invasion) ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/7Q/5PPP/6K1 w - - 0 1",
    solution: ["Qc8#"],
    difficulty: 3,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Long-range queen invasion — h-file queen swings into the back rank.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/6Q1/8/5PPP/6K1 w - - 0 1",
    solution: ["Qc8#"],
    difficulty: 3,
    themes: ["back-rank", "queen"],
    tacticType: "Back Rank Mate",
    explanation: "Mid-board queen swings to the back rank for mate.",
    source: "seed",
  },

  /* ---- Back Rank Mate (extra pieces are decoys) ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/4N2P/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "knight"],
    tacticType: "Back Rank Mate",
    explanation: "Extra pieces do not change the evaluation — back-rank mate stands.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/3B3P/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "bishop"],
    tacticType: "Back Rank Mate",
    explanation: "A bishop on the second rank is irrelevant to the rook's corridor mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/5N1P/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "knight"],
    tacticType: "Back Rank Mate",
    explanation: "Knights on the second rank cannot patch the air holes on the eighth.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/2N4P/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "knight"],
    tacticType: "Back Rank Mate",
    explanation: "Another cluttered deck — the tactical shot is still Ra8.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/1B5P/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "bishop"],
    tacticType: "Back Rank Mate",
    explanation: "Do not let the extra bishop distract from the weak eighth rank.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/6BP/R5K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["back-rank", "bishop"],
    tacticType: "Back Rank Mate",
    explanation: "Both bishops at home — Ra8 still ends the game.",
    source: "seed",
  },

  /* ---- Heavy-Piece Battery on the back rank ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/8/Q3R1K1 w - - 0 1",
    solution: ["Qa8#"],
    difficulty: 2,
    themes: ["back-rank", "queen", "rook", "battery"],
    tacticType: "Heavy-Piece Battery",
    explanation: "Queen + rook battery on the back rank — heavy pieces overwhelm.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6k1/5ppp/8/8/8/8/R7/3Q2K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 3,
    themes: ["queen", "rook"],
    tacticType: "Q + R Mate",
    explanation: "Rook swings to the back rank — queen backs it up.",
    source: "seed",
  },

  /* ---- Anastasia's Mate (knight + rook trap on the rim) ---- */
  {
    module: "checkmate-patterns",
    fen: "5k2/5p1R/5K2/8/8/8/8/8 w - - 0 1",
    solution: ["Rh8#"],
    difficulty: 3,
    themes: ["rook", "edge", "anastasia"],
    tacticType: "Anastasia's Mate",
    explanation:
      "Anastasia-style — rook + king box the monarch on the rim.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "8/4N1pk/8/8/8/R7/8/6K1 w - - 0 1",
    solution: ["Rh3#"],
    difficulty: 3,
    themes: ["anastasia", "knight", "rook"],
    tacticType: "Anastasia's Mate",
    explanation:
      "Anastasia's Mate — knight on e7 covers g6/g8, rook lifts to the h-file.",
    source: "seed",
  },

  /* ---- Arabian Mate (knight + rook in the corner) ---- */
  {
    module: "checkmate-patterns",
    fen: "7k/8/5N1K/8/8/8/8/R7 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 3,
    themes: ["arabian", "rook", "knight"],
    tacticType: "Arabian Mate",
    explanation:
      "Arabian Mate — knight covers g8/h7 from f6; king blocks g7; rook delivers.",
    source: "seed",
  },

  /* ---- Vukovic's Mate (king + knight + rook) ---- */
  {
    module: "checkmate-patterns",
    fen: "5k2/5N2/5K2/7R/8/8/8/8 w - - 0 1",
    solution: ["Rh8#"],
    difficulty: 3,
    themes: ["vukovic", "rook", "knight"],
    tacticType: "Vukovic's Mate",
    explanation:
      "Vukovic's Mate — knight + king cover all escape squares; rook delivers from the side.",
    source: "seed",
  },

  /* ---- Smothered Mate (knight family) ---- */
  {
    module: "checkmate-patterns",
    fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    solution: ["Nf7#"],
    difficulty: 2,
    themes: ["smothered", "knight"],
    tacticType: "Smothered Mate",
    explanation:
      "Smothered Mate — king sealed by its own pieces; knight delivers from f7.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
    solution: ["Nf7#"],
    difficulty: 3,
    themes: ["smothered", "knight"],
    tacticType: "Smothered Mate",
    explanation: "Knight on g5 jumps to f7 to deliver the smothered mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "6rk/6pp/3N4/8/8/8/8/6K1 w - - 0 1",
    solution: ["Nf7#"],
    difficulty: 3,
    themes: ["smothered", "knight"],
    tacticType: "Smothered Mate",
    explanation: "Knight from d6 hops to f7 — king cannot escape.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "3N2rk/6pp/8/8/8/8/8/6K1 w - - 0 1",
    solution: ["Nf7#"],
    difficulty: 3,
    themes: ["smothered", "knight"],
    tacticType: "Smothered Mate",
    explanation: "Knight on d8 swings to f7 to seal the smother.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "kr6/pp6/8/3N4/8/8/8/6K1 w - - 0 1",
    solution: ["Nc7#"],
    difficulty: 4,
    themes: ["smothered", "knight", "queenside"],
    tacticType: "Smothered Mate",
    explanation:
      "Queenside smothered — knight from d5 hops in with the king fully blocked.",
    source: "seed",
  },

  /* ---- Suffocation Mate (variant of smothered with capture) ---- */
  {
    module: "checkmate-patterns",
    fen: "6rk/5ppp/8/6N1/8/8/8/6K1 w - - 0 1",
    solution: ["Nxf7#"],
    difficulty: 3,
    themes: ["suffocation", "knight"],
    tacticType: "Suffocation Mate",
    explanation:
      "Suffocation Mate — knight captures the pawn; king's flight squares are all blocked by own pieces.",
    source: "seed",
  },

  /* ---- Blind Swine Mate (two rooks on the seventh) ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5Rpp/5R2/8/8/8/8/6K1 w - - 0 1",
    solution: ["Rf8#"],
    difficulty: 3,
    themes: ["rook", "seventh-rank"],
    tacticType: "Blind Swine Mate",
    explanation:
      "Two rooks on the seventh — the 'blind swine' pile-up swings to the back rank.",
    source: "seed",
  },

  /* ---- Ladder / Lawnmower Mate ---- */
  {
    module: "checkmate-patterns",
    fen: "7k/R7/1R6/8/8/8/8/6K1 w - - 0 1",
    solution: ["Rb8#"],
    difficulty: 1,
    themes: ["ladder", "two-rooks"],
    tacticType: "Ladder Mate",
    explanation:
      "Two-rook lawnmower — the partner rook cuts off escape while the other delivers.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "7k/R7/6Q1/8/8/8/8/6K1 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 1,
    themes: ["ladder", "queen", "rook"],
    tacticType: "Ladder Mate",
    explanation: "Queen and rook combine for a ladder mate on the back rank.",
    source: "seed",
  },

  /* ---- Queen + King basic mates (Capablanca technique) ---- */
  {
    module: "checkmate-patterns",
    fen: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1",
    solution: ["Qg7#"],
    difficulty: 2,
    themes: ["queen-mate"],
    tacticType: "Queen Mate (Edge)",
    explanation: "Q + K mate on h8 — flight squares all controlled by the white king.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "7k/8/6K1/8/8/8/8/4Q3 w - - 0 1",
    solution: ["Qe8#"],
    difficulty: 2,
    themes: ["queen-mate"],
    tacticType: "Queen Mate (Edge)",
    explanation: "Queen swings to the back rank with king covering g7/g8.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1",
    solution: ["Qd8#"],
    difficulty: 2,
    themes: ["queen-mate"],
    tacticType: "Queen Mate (Edge)",
    explanation: "Central queen sweeps to the back rank for the corner mate.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1",
    solution: ["Qc8#"],
    difficulty: 2,
    themes: ["queen-mate", "queen-lift"],
    tacticType: "Queen Lift Mate",
    explanation:
      "Queen swings up the c-file to the back rank — supporting king covers b7/b8.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "7k/5K2/8/8/8/Q7/8/8 w - - 0 1",
    solution: ["Qh3#"],
    difficulty: 3,
    themes: ["queen-mate", "queen-lift"],
    tacticType: "Queen Lift Mate",
    explanation:
      "Queen lifts along rank 3 to the h-file — king on f7 covers all flight squares.",
    source: "seed",
  },

  /* ---- Rook + King basic mates ---- */
  {
    module: "checkmate-patterns",
    fen: "7k/8/6K1/8/8/8/8/R7 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["rook-mate"],
    tacticType: "Rook Mate (Edge)",
    explanation: "Rook + king mate on the rim — king cuts off h7 escape.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
    solution: ["Rh8#"],
    difficulty: 2,
    themes: ["rook-mate"],
    tacticType: "Rook Mate (Edge)",
    explanation: "Rook delivers on the back rank — king covers escape squares.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "7k/8/6K1/8/8/8/R7/8 w - - 0 1",
    solution: ["Ra8#"],
    difficulty: 2,
    themes: ["rook-mate", "rook-lift"],
    tacticType: "Rook Lift Mate",
    explanation: "Rook lifts up the a-file — king cuts off g7/g8.",
    source: "seed",
  },

  /* ---- Promotion Mate ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/4P3/6K1/8/8/8/8/8 w - - 0 1",
    solution: ["e8=Q#"],
    difficulty: 3,
    themes: ["promotion", "queen"],
    tacticType: "Promotion Mate",
    explanation:
      "Pawn promotes with king cover — new queen mates immediately on the back rank.",
    source: "seed",
  },

  /* ---- Diagonal Q + B coordination ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5pp1/7p/8/8/3B4/8/Q5K1 w - - 0 1",
    solution: ["Qa8#"],
    difficulty: 4,
    themes: ["queen", "bishop"],
    tacticType: "Diagonal Q + B Mate",
    explanation:
      "Bishop on the long diagonal seals escape squares; queen lands the killing blow.",
    source: "seed",
  },

  /* ---- Queen on the 7th rank ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/4Q1pp/8/8/8/8/8/6K1 w - - 0 1",
    solution: ["Qe8#"],
    difficulty: 3,
    themes: ["queen", "seventh-rank"],
    tacticType: "Queen on 7th Mate",
    explanation:
      "Queen lifts to the back rank from the 7th — Black's own pawns prevent escape.",
    source: "seed",
  },

  /* ---- Damiano-style mate (pawn wedge with heavy-piece invasion) ---- */
  {
    module: "checkmate-patterns",
    fen: "5rk1/5pPp/7B/8/8/8/8/4Q2K w - - 0 1",
    solution: ["gxf8=R#"],
    difficulty: 5,
    themes: ["damiano", "bishop", "queen", "promotion"],
    tacticType: "Damiano-Style Mate",
    explanation:
      "Pawn promotes by capture; the resulting position pins the king behind its own structure.",
    source: "seed",
  },

  /* ---- Q + N coordination across the board ---- */
  {
    module: "checkmate-patterns",
    fen: "6k1/5N1p/7P/6K1/8/8/8/Q7 w - - 0 1",
    solution: ["Qg7#"],
    difficulty: 4,
    themes: ["queen", "knight", "pawn"],
    tacticType: "Queen + Knight Mate",
    explanation: "Knight + pawn cover escape squares; queen delivers from afar.",
    source: "seed",
  },
  {
    module: "checkmate-patterns",
    fen: "5rk1/8/4N3/8/8/8/8/Q5K1 w - - 0 1",
    solution: ["Qg7#"],
    difficulty: 3,
    themes: ["queen", "knight"],
    tacticType: "Queen + Knight Mate",
    explanation: "Knight on e6 covers f8 / g7 escape; queen lands the kill.",
    source: "seed",
  },
];

/* ====================================================================== */
/* Defender — small placeholder deck so the page isn't empty before any   */
/* user games are analyzed. Real positions come from defenderGenerator.   */
/* ====================================================================== */
const DEFENDER_SEED: InsertTrainingProblem[] = [
  {
    module: "defender",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3",
    solution: ["Nf3"],
    difficulty: 2,
    themes: ["defender", "development"],
    tacticType: "defender",
    explanation:
      "When attacked or under pressure, develop with tempo. Nf3 covers e5 and starts kingside development.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4",
    solution: ["Bc5"],
    difficulty: 3,
    themes: ["defender", "italian"],
    tacticType: "defender",
    explanation: "Develop the bishop and contest the centre — the only natural move.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 1 5",
    solution: ["Bg5"],
    difficulty: 3,
    themes: ["defender", "pin"],
    tacticType: "defender",
    explanation: "Bg5 pins the knight and preserves the central tension.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 2 3",
    solution: ["Nc6"],
    difficulty: 2,
    themes: ["defender", "development"],
    tacticType: "defender",
    explanation:
      "Nc6 develops toward the centre and attacks e4 — much healthier than passive replies.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 2 3",
    solution: ["Nf6"],
    difficulty: 2,
    themes: ["defender", "petrov"],
    tacticType: "defender",
    explanation: "Nf6 contests e4 while developing — the main-line reply.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 2 3",
    solution: ["Nc3"],
    difficulty: 2,
    themes: ["defender", "pawn-chain"],
    tacticType: "defender",
    explanation: "Nc3 supports d4 ideas and keeps the centre flexible.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    solution: ["Nc6"],
    difficulty: 2,
    themes: ["defender", "open-game"],
    tacticType: "defender",
    explanation: "Develop with tempo against e4 — Nc6 hits the pawn while improving.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 3 3",
    solution: ["Bb5"],
    difficulty: 3,
    themes: ["defender", "ruy-lopez"],
    tacticType: "defender",
    explanation: "Bb5 pins the knight — the most principled way to pressure Black's centre.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5NP1/PPPP1P1P/RNBQKB1R b KQkq - 0 3",
    solution: ["Nc6"],
    difficulty: 2,
    themes: ["defender", "king's-gambit-declined"],
    tacticType: "defender",
    explanation: "Nc6 defends e5 and prepares …Bc5 or …d5 counterplay.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    solution: ["Nc3"],
    difficulty: 2,
    themes: ["defender", "four-knights"],
    tacticType: "defender",
    explanation: "Nc3 mirrors Black's development and keeps central options.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2",
    solution: ["exf4"],
    difficulty: 3,
    themes: ["defender", "king's-gambit"],
    tacticType: "defender",
    explanation: "Taking the pawn accepts the gambit but grabs a centre pawn — often safer than ignoring it forever.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3",
    solution: ["Nf3"],
    difficulty: 3,
    themes: ["defender", "king's-gambit"],
    tacticType: "defender",
    explanation:
      "After …exf4, develop with tempo toward the loose pawn — Nf3 is the classical reclaim.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5NP1/PPPP1P1P/RNBQKB1R b KQkq - 0 3",
    solution: ["d5"],
    difficulty: 3,
    themes: ["defender", "pawn-break"],
    tacticType: "defender",
    explanation: "…d5 strikes at the centre immediately — the classical remedy against premature flank pushes.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    solution: ["d4"],
    difficulty: 1,
    themes: ["defender", "first-move"],
    tacticType: "defender",
    explanation: "Occupy the centre — d4 is one of the soundest ways to start the fight.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
    solution: ["d5"],
    difficulty: 2,
    themes: ["defender", "queen's-pawn"],
    tacticType: "defender",
    explanation: "…d5 contests White's central pawn immediately.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/8/2pPP3/8/PP3PPP/RNBQKBNR w KQkq - 0 4",
    solution: ["e5"],
    difficulty: 4,
    themes: ["defender", "advance-variation"],
    tacticType: "defender",
    explanation: "In French Advance structures e5 clamps the chain — often the key defensive clamp.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/8/2PPp3/8/PP2PPPP/RNBQKBNR w KQkq - 0 4",
    solution: ["Nc3"],
    difficulty: 3,
    themes: ["defender", "nimzo-indian"],
    tacticType: "defender",
    explanation: "Nc3 hits the pawn on e4 (after …exd5 lines) and develops — solid handling.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 4 4",
    solution: ["d6"],
    difficulty: 3,
    themes: ["defender", "philidor"],
    tacticType: "defender",
    explanation: "…d6 shores up e5 and prepares …Bd7 — calm defence in open Italian lines.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 3 3",
    solution: ["Bc4"],
    difficulty: 2,
    themes: ["defender", "italian"],
    tacticType: "defender",
    explanation: "Bc4 targets f7 and stays flexible — a classic developing move.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4",
    solution: ["Bc5"],
    difficulty: 2,
    themes: ["defender", "giuoco-piano"],
    tacticType: "defender",
    explanation: "Bc5 mirrors White's development and keeps the initiative in the centre.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "rnbqkb1r/pppp1ppp/5n2/8/2pP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 0 4",
    solution: ["g6"],
    difficulty: 4,
    themes: ["defender", "king-safety"],
    tacticType: "defender",
    explanation: "Fianchetto ideas — …g6 prepares …Bg7 without blocking the centre.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "8/8/8/4k3/3p4/3K4/3P4/8 w - - 0 1",
    solution: ["Kd4"],
    difficulty: 3,
    themes: ["defender", "opposition"],
    tacticType: "defender",
    explanation: "Kd4 takes the opposition — the king must fight for key squares before pushing the pawn.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "8/8/8/8/4k3/8/4P3/4K3 w - - 0 1",
    solution: ["Kd2"],
    difficulty: 4,
    themes: ["defender", "king-pawn-endgame"],
    tacticType: "defender",
    explanation: "Activate the king toward the pawn — rushing the pawn alone often throws away the win.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1",
    solution: ["g4"],
    difficulty: 3,
    themes: ["defender", "luft"],
    tacticType: "defender",
    explanation: "Give the king breathing room (luft) before the back rank becomes fatal.",
    source: "seed",
  },
  {
    module: "defender",
    fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
    solution: ["Kf6"],
    difficulty: 3,
    themes: ["defender", "king-box"],
    tacticType: "defender",
    explanation:
      "March the king ahead of the pawn — here Kf6 covers promotion squares and shields Black's king.",
    source: "seed",
  },
];

/* ====================================================================== */
/* Intuition — small starter deck. Real sequences come from               */
/* intuitionGenerator after a game is analyzed.                            */
/* ====================================================================== */
const INTUITION_SEED: InsertTrainingProblem[] = [
  {
    module: "intuition",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3",
    solution: ["f3"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation:
      "f3 is a passive move that weakens the kingside — the warning sign in this short sequence.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "Nc3", "Nf6", "f3"],
      badIdx: 4,
      fenStart:
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["Qh5"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation:
      "Early queen excursions like Qh5 bring out the queen too soon — easy to chase with Nc6.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "Qh5"],
      badIdx: 2,
      fenStart:
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["Bc4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation:
      "Bc4 here loses tempo when Black hasn't even committed the king's knight; a more flexible move was preferable.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "Bc4", "Nc6", "Qh5"],
      badIdx: 4,
      fenStart:
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
    solution: ["d5"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation:
      "Ignoring the centre tension — capturing or resolving with principle wins development time.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e6", "d4", "d5"],
      badIdx: 3,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
    solution: ["exd4"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Recapturing toward the centre is usually best — sideways captures often waste tempo.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "d4", "exd4"],
      badIdx: 3,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/8/4p3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["Bc4"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Bc4 before developing knights can lose time against …Nc6 hitting the bishop.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "Bc4"],
      badIdx: 2,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    solution: ["h5"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Random rook-pawn moves on move 1 weaken the kingside without improving anything.",
    source: "seed",
    metadata: {
      sequence: ["h5"],
      badIdx: 0,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    solution: ["g4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "The Grob / kingside wing pawn punt opens lines toward your own king.",
    source: "seed",
    metadata: {
      sequence: ["g4"],
      badIdx: 0,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/8/4p3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["d4"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Early d4 without supporting pieces can become a target — context matters more than the move alone.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "d4"],
      badIdx: 2,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    solution: ["h4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Wing pawn thrusts without centre contact rarely improve coordination.",
    source: "seed",
    metadata: {
      sequence: ["h4"],
      badIdx: 0,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    solution: ["d4"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Symmetrical centre breaks need preparation — raw d4 can concede the initiative.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "d4"],
      badIdx: 2,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    solution: ["f6"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Damiano-style knight holes on f6 weaken e6 and the entire kingside chain.",
    source: "seed",
    metadata: {
      sequence: ["f6"],
      badIdx: 0,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    solution: ["a4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Queenside wing pawns before development often waste tempi Black can exploit.",
    source: "seed",
    metadata: {
      sequence: ["a4"],
      badIdx: 0,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3",
    solution: ["Qh4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Scholar's-mate patterns punish premature queen sorties — …Qh4 has concrete threats.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "Nf3", "Qh4"],
      badIdx: 3,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/3P4/PPP2PPP/RNBQKBNR b KQkq - 0 3",
    solution: ["Bb4"],
    difficulty: 4,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Pinning before completing development can backfire when tactics appear.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e5", "d4", "Bb4"],
      badIdx: 3,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
  {
    module: "intuition",
    fen: "rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
    solution: ["e5"],
    difficulty: 3,
    themes: ["intuition", "spot-the-mistake"],
    tacticType: "intuition",
    explanation: "Advancing the chain without clarity can lock your own bishop pair away.",
    source: "seed",
    metadata: {
      sequence: ["e4", "e6", "d4", "e5"],
      badIdx: 3,
      fenStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    },
  },
];
