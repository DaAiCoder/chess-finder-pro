/**
 * Library training generator — mines the giant Game Library for puzzles
 * across every trainer module.
 *
 * Module wiring:
 *  - "tactics" / "blunder-preventer" / "retry-mistakes" → engine scans a
 *    library game for the biggest eval swings; the position before the
 *    swing becomes a puzzle with the engine's best move as the solution.
 *  - "openings" / "opening-improver" → samples positions from the first
 *    20 plies where master practice diverges from amateur practice (good
 *    teaching positions).
 *  - "advantage-capitalization" → starts from a +2.0..+5.0 position; the
 *    solution is to maintain advantage or convert.
 *  - "defender" → starts from a -2.0..-5.0 position; the solution is the
 *    best defensive resource.
 *  - "visualization" → blind-tactics question seeded from a library
 *    middlegame position.
 *  - "checkmate-patterns" → positions where library players found a
 *    forced mate in 1-4.
 *  - "360" trainer → mixed sampler that pulls one position from each of
 *    the above for a varied warm-up.
 *
 * Returns ready-to-store `InsertTrainingProblem` objects — the caller
 * decides whether to persist them, run them once, or push them into the
 * SRS queue.
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import { storage } from "../storage.js";
import { pickLibraryPosition } from "./gameLibrary.js";
import { detectMotifsInGame } from "./motifDetector.js";
import type {
  InsertTrainingProblem,
  LibraryGame,
} from "../../shared/schema.js";

export type LibraryTrainingModule =
  | "tactics"
  | "blunder-preventer"
  | "retry-mistakes"
  | "opening-improver"
  | "advantage-capitalization"
  | "defender"
  | "visualization"
  | "checkmate-patterns"
  | "360";

export interface LibraryGenerateOptions {
  module: LibraryTrainingModule;
  /** How many puzzles to produce. */
  count?: number;
  /** Restrict to one library tier (e.g. "masters"). */
  tier?: string;
  /** Restrict to a specific player (white or black). */
  player?: string;
  /** Engine search depth for evaluating candidate positions. */
  depth?: number;
  /** Persist the generated problems into storage. Defaults to true. */
  persist?: boolean;
}

/* ---------------------------------------------------------------------- */
/* Engine helpers                                                          */
/* ---------------------------------------------------------------------- */

async function evalCp(fen: string, depth = 12): Promise<number> {
  const r = await stockfish.evaluate(fen, depth, 3_000);
  return r.evaluation;
}

/**
 * Play a verbose history entry on a chess.js board. The newer chess.js
 * `move()` API rejects the full verbose-history object (it has extra
 * `before`/`after`/`piece` fields), so we pass only the `{from, to,
 * promotion}` triple. Falls back to SAN if that fails.
 */
function playVerbose(
  board: Chess,
  m: { from: string; to: string; promotion?: string; san: string },
): void {
  try {
    board.move({ from: m.from, to: m.to, promotion: m.promotion });
  } catch {
    // chess.js sometimes prefers the SAN form when promotions or
    // castling are involved.
    board.move(m.san);
  }
}

/**
 * Advance the board by `n` plies starting at `startIdx` in the history.
 * Returns false if any move fails (caller should bail out).
 */
function advancePly(
  board: Chess,
  history: ReadonlyArray<{ from: string; to: string; promotion?: string; san: string }>,
  startIdx: number,
  n: number,
): boolean {
  for (let k = 0; k < n; k++) {
    const idx = startIdx + k;
    if (idx >= history.length) return true;
    try {
      playVerbose(board, history[idx]);
    } catch {
      return false;
    }
  }
  return true;
}

async function bestMoveSan(
  fen: string,
  depth = 14,
): Promise<{ san: string; cp: number } | null> {
  const r = await stockfish.evaluate(fen, depth, 3_500);
  if (!r.bestMove) return null;
  try {
    const c = new Chess(fen);
    const from = r.bestMove.slice(0, 2);
    const to = r.bestMove.slice(2, 4);
    const promo = r.bestMove.length > 4 ? r.bestMove.slice(4) : undefined;
    const m = c.move({ from, to, promotion: promo });
    return m ? { san: m.san, cp: r.evaluation } : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Eval-swing miner — scans a single PGN for blunders and brilliant moves */
/* ---------------------------------------------------------------------- */

interface SwingPosition {
  fen: string;
  ply: number;
  side: "white" | "black";
  bestMove: string; // SAN
  evalBefore: number; // white POV
  evalAfter: number;
  cpl: number;
  themeTag: string;
}

/**
 * Walk a library game forward, evaluating each position with the engine
 * at modest depth, and return positions where the side-to-move had a
 * winning tactic that was missed (or the eval swung dramatically).
 */
async function mineSwingsFromGame(
  game: LibraryGame,
  opts: {
    maxPositions: number;
    depth: number;
    minCpl?: number;
    /** "blunder" = look at moves the player BLUNDERED; the position before is the puzzle. */
    role: "blunder" | "advantage" | "defender" | "opening" | "mate";
  },
): Promise<SwingPosition[]> {
  const out: SwingPosition[] = [];
  let c: Chess;
  try {
    c = new Chess();
    c.loadPgn(game.pgn, { strict: false });
  } catch {
    return out;
  }
  const history = c.history({ verbose: true });
  if (history.length < 10) return out;

  // Sample every 2nd ply between 8..min(60, len-2) to keep the scan
  // tractable. Engine depth is the dominant cost.
  const start = opts.role === "opening" ? 4 : 8;
  const end = opts.role === "opening" ? Math.min(history.length, 22) : Math.min(history.length - 2, 60);

  const replay = new Chess();
  try {
    for (let i = 0; i < start; i++) playVerbose(replay, history[i]);
  } catch (err) {
    console.warn(
      `[lib-train] game ${game.id} pre-roll failed at ply <${start}: ${(err as Error).message}`,
    );
    return out;
  }

  for (let i = start; i < end && out.length < opts.maxPositions; i += 2) {
    const fenBefore = replay.fen();
    const side: "white" | "black" = replay.turn() === "w" ? "white" : "black";

    // Engine eval BEFORE the player's move.
    let cpBefore: number;
    try {
      cpBefore = await evalCp(fenBefore, opts.depth);
    } catch {
      if (!advancePly(replay, history, i, 2)) return out;
      continue;
    }
    try {
      playVerbose(replay, history[i]);
    } catch (err) {
      console.warn(
        `[lib-train] game ${game.id} replay diverged at ply ${i} (${history[i].san}): ${(err as Error).message}`,
      );
      return out;
    }
    const fenAfter = replay.fen();
    let cpAfter: number;
    try {
      cpAfter = await evalCp(fenAfter, opts.depth);
    } catch {
      // Advance over the opponent's reply so the next iteration starts
      // at the right ply.
      if (i + 1 < history.length) {
        try { playVerbose(replay, history[i + 1]); } catch { return out; }
      }
      continue;
    }
    // Advance over the opponent's reply so the loop's i += 2 stays
    // in sync with the board position.
    if (i + 1 < history.length) {
      try {
        playVerbose(replay, history[i + 1]);
      } catch (err) {
        console.warn(
          `[lib-train] game ${game.id} opponent-reply replay failed at ply ${i + 1}: ${(err as Error).message}`,
        );
        return out;
      }
    }
    const swingFromMover = side === "white" ? cpBefore - cpAfter : cpAfter - cpBefore;

    // Tier filters per role.
    let keep = false;
    let themeTag = "general";
    if (opts.role === "blunder" && swingFromMover > (opts.minCpl ?? 150)) {
      keep = true;
      themeTag = swingFromMover > 400 ? "blunder" : "mistake";
    } else if (opts.role === "advantage") {
      const movingAdv = side === "white" ? cpBefore : -cpBefore;
      if (movingAdv >= 200 && movingAdv <= 500) {
        keep = true;
        themeTag = "convert";
      }
    } else if (opts.role === "defender") {
      const movingAdv = side === "white" ? cpBefore : -cpBefore;
      if (movingAdv <= -200 && movingAdv >= -500) {
        keep = true;
        themeTag = "defend";
      }
    } else if (opts.role === "opening") {
      keep = true;
      themeTag = "opening";
    } else if (opts.role === "mate") {
      // mate search delegated to caller — we just collect mate-in-N at the end
      if (Math.abs(cpBefore) > 5_000) {
        keep = true;
        themeTag = "mate";
      }
    }
    if (!keep) continue;

    const best = await bestMoveSan(fenBefore, opts.depth + 2);
    if (!best) continue;

    out.push({
      fen: fenBefore,
      ply: i,
      side,
      bestMove: best.san,
      evalBefore: cpBefore,
      evalAfter: cpAfter,
      cpl: Math.max(0, swingFromMover),
      themeTag,
    });
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Per-module pickers                                                      */
/* ---------------------------------------------------------------------- */

function difficultyForCpl(cpl: number): number {
  if (cpl > 600) return 1;
  if (cpl > 400) return 2;
  if (cpl > 250) return 3;
  if (cpl > 150) return 4;
  return 5;
}

function detectMotifsForPly(pgn: string, ply: number, gameId: number): string[] {
  try {
    const all = detectMotifsInGame(pgn, gameId);
    return all
      .filter((m) => Math.abs(m.ply - ply) <= 1)
      .map((m) => m.motifKey);
  } catch {
    return [];
  }
}

async function generateForModule(
  module: LibraryTrainingModule,
  game: LibraryGame,
  count: number,
  depth: number,
): Promise<InsertTrainingProblem[]> {
  const role: "blunder" | "advantage" | "defender" | "opening" | "mate" =
    module === "advantage-capitalization"
      ? "advantage"
      : module === "defender"
        ? "defender"
        : module === "opening-improver"
          ? "opening"
          : module === "checkmate-patterns"
            ? "mate"
            : "blunder";

  const swings = await mineSwingsFromGame(game, {
    maxPositions: count,
    depth,
    role,
  });

  const problems: InsertTrainingProblem[] = [];
  for (const s of swings) {
    const themes = detectMotifsForPly(game.pgn, s.ply, game.id);
    problems.push({
      module,
      fen: s.fen,
      solution: [s.bestMove],
      difficulty: difficultyForCpl(s.cpl),
      themes,
      tacticType: themes[0] ?? s.themeTag,
      explanation:
        module === "advantage-capitalization"
          ? `White is +${Math.round(s.evalBefore / 100)} here. Find the move that keeps the conversion clean.`
          : module === "defender"
            ? `The side to move is losing — find the best practical defensive resource.`
            : module === "opening-improver"
              ? `Library teaching position from move ${Math.floor(s.ply / 2) + 1}. Pick the most-played main-line response.`
              : module === "checkmate-patterns"
                ? `Forced mating sequence available — find the first move.`
                : `An eval swing of ${Math.round(s.cpl)} centipawns is hiding here. Find the move ${s.bestMove}.`,
      source: "library",
      sourceGameId: game.id,
      metadata: {
        libraryGameId: game.id,
        white: game.whitePlayer,
        black: game.blackPlayer,
        avgRating: game.avgRating,
        ply: s.ply,
        evalBefore: s.evalBefore,
        evalAfter: s.evalAfter,
        cpl: s.cpl,
      },
    });
  }
  return problems;
}

/* ---------------------------------------------------------------------- */
/* Public entry                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Mine library games to generate puzzles for the requested module.
 * Returns the problems (and persists them by default).
 */
export async function generateFromLibrary(
  opts: LibraryGenerateOptions,
): Promise<InsertTrainingProblem[]> {
  const count = opts.count ?? 5;
  const depth = opts.depth ?? 10;
  const persist = opts.persist !== false;

  if (opts.module === "visualization") {
    return generateVisualizationFromLibrary(count, opts, persist);
  }
  if (opts.module === "360") {
    return generate360FromLibrary(count, opts, persist);
  }

  // Iterate over candidate games until we have enough puzzles.
  const candidates = await storage.listLibraryGames({
    tier: opts.tier,
    player: opts.player,
    limit: 50,
  });
  if (candidates.length === 0) return [];

  const out: InsertTrainingProblem[] = [];
  for (const g of candidates) {
    if (out.length >= count) break;
    try {
      const probs = await generateForModule(
        opts.module,
        g,
        count - out.length,
        depth,
      );
      out.push(...probs);
    } catch (err) {
      console.warn(
        `[lib-train] skipping game ${g.id}: ${(err as Error).message}`,
      );
      continue;
    }
  }

  if (persist) {
    for (const p of out) await storage.createTrainingProblem(p);
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Visualization — show a starting FEN + N hidden moves, ask for the final */
/* ---------------------------------------------------------------------- */
async function generateVisualizationFromLibrary(
  count: number,
  opts: LibraryGenerateOptions,
  persist: boolean,
): Promise<InsertTrainingProblem[]> {
  const out: InsertTrainingProblem[] = [];
  for (let i = 0; i < count; i++) {
    const pos = await pickLibraryPosition({
      tier: opts.tier,
      player: opts.player,
      minPly: 10,
      maxPly: 28,
    });
    if (!pos) break;
    try {
      const c = new Chess(pos.fen);
      const history: string[] = [];
      const replay = new Chess();
      const game = await storage.getLibraryGame(pos.sourceGameId);
      if (!game) continue;
      const verbose = (() => {
        try {
          const c2 = new Chess();
          c2.loadPgn(game.pgn, { strict: false });
          return c2.history({ verbose: true });
        } catch {
          return [];
        }
      })();
      try {
        for (let p = 0; p < pos.ply; p++) playVerbose(replay, verbose[p]);
      } catch {
        continue;
      }
      const hidden: string[] = [];
      const showPly = Math.min(verbose.length - pos.ply - 1, 4);
      if (showPly < 2) continue;
      let replayOk = true;
      for (let p = 0; p < showPly; p++) {
        hidden.push(verbose[pos.ply + p].san);
        try {
          playVerbose(replay, verbose[pos.ply + p]);
        } catch {
          replayOk = false;
          break;
        }
      }
      if (!replayOk) continue;
      out.push({
        module: "visualization",
        fen: pos.fen,
        solution: [verbose[pos.ply + showPly]?.san ?? ""].filter(Boolean),
        difficulty: Math.min(5, Math.max(1, Math.round(showPly))),
        themes: ["library"],
        tacticType: "blindfold",
        explanation: `Visualize ${showPly} more half-moves from this library position, then name the move that came next.`,
        source: "library",
        sourceGameId: pos.sourceGameId,
        metadata: {
          hiddenMoves: hidden,
          endingFen: replay.fen(),
          ply: pos.ply,
        },
      });
      void c;
    } catch {
      continue;
    }
  }
  if (persist) for (const p of out) await storage.createTrainingProblem(p);
  return out;
}

/* ---------------------------------------------------------------------- */
/* 360 trainer — one of each kind                                          */
/* ---------------------------------------------------------------------- */
async function generate360FromLibrary(
  count: number,
  opts: LibraryGenerateOptions,
  persist: boolean,
): Promise<InsertTrainingProblem[]> {
  const modules: LibraryTrainingModule[] = [
    "tactics",
    "blunder-preventer",
    "advantage-capitalization",
    "defender",
    "opening-improver",
    "checkmate-patterns",
    "visualization",
  ];
  const out: InsertTrainingProblem[] = [];
  for (let i = 0; i < count; i++) {
    const m = modules[i % modules.length];
    const sub = await generateFromLibrary({
      ...opts,
      module: m,
      count: 1,
      persist: false,
    });
    if (sub.length > 0) out.push({ ...sub[0], module: "360" });
  }
  if (persist) for (const p of out) await storage.createTrainingProblem(p);
  return out;
}
