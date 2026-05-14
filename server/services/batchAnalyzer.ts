/**
 * Background batch analyzer.
 *
 * Drives the existing per-game pipeline ({@link analyzeGame} +
 * the five module generators) sequentially over a queue of game ids
 * for a single user. Used by the Analytics page so that clicking
 * "Analyze" silently upgrades every imported game from the heuristic
 * skill scores to engine-backed `moveAnalysis` and personalised
 * training problems sourced from the user's own games.
 *
 * State lives in-process (`Map<userId, BatchJob>`). A restart cancels
 * any in-flight job; that's an acceptable trade-off for a dev tool
 * since callers can simply hit Analyze again to resume.
 *
 * Concurrency: one game at a time per user. The shared Stockfish
 * process is single-threaded, so processing in parallel would just
 * serialise inside the UCI queue anyway.
 */

import { storage } from "../storage.js";
import { analyzeGame } from "./gameAnalyzer.js";
import { generateTacticsFromAnalysis } from "./tacticsGenerator.js";
import { generateBlunderPreventerProblems } from "./blunderPreventerGenerator.js";
import { generateOpeningProblems } from "./openingImproverGenerator.js";
import { generateAdvantageProblems } from "./advantageCapitalizationGenerator.js";
import { generateEndgameProblems } from "./endgameTrainerGenerator.js";
import { generateDefenderProblems } from "./defenderGenerator.js";
import { generateIntuitionProblems } from "./intuitionGenerator.js";

export type BatchStatus = "idle" | "running" | "done" | "cancelled";

export interface BatchJob {
  userId: number;
  /** Username this job is scoped to (matches the analytics filter). */
  username: string;
  /** Total number of games queued (analyzed + remaining). */
  total: number;
  analyzed: number;
  generated: number;
  failed: number;
  status: BatchStatus;
  startedAt: number;
  finishedAt: number | null;
  currentGameId: number | null;
}

interface InternalJob extends BatchJob {
  queue: number[]; // remaining game ids
  cancel: boolean;
}

const jobs = new Map<number, InternalJob>();

/**
 * Add games to a user's queue. Spawns the worker if the user doesn't
 * already have one running. Cheap to call repeatedly with the same ids
 * (already-queued or already-finished ids are filtered).
 */
export function enqueue(args: {
  userId: number;
  username: string;
  gameIds: number[];
}): BatchJob {
  const existing = jobs.get(args.userId);
  if (existing && existing.status === "running") {
    // Append novel ids and return the live snapshot. Keep the original
    // username (the worker uses it for status filtering only).
    const known = new Set([
      ...existing.queue,
      ...Array.from({ length: existing.analyzed }),
    ]);
    let appended = 0;
    for (const id of args.gameIds) {
      if (!known.has(id)) {
        existing.queue.push(id);
        existing.total += 1;
        appended += 1;
      }
    }
    return snapshot(existing);
  }

  const job: InternalJob = {
    userId: args.userId,
    username: args.username,
    total: args.gameIds.length,
    analyzed: 0,
    generated: 0,
    failed: 0,
    status: args.gameIds.length === 0 ? "done" : "running",
    startedAt: Date.now(),
    finishedAt: args.gameIds.length === 0 ? Date.now() : null,
    currentGameId: null,
    queue: [...args.gameIds],
    cancel: false,
  };
  jobs.set(args.userId, job);
  if (job.status === "running") {
    void runWorker(job).catch((err) => {
      console.error("[batchAnalyzer] worker crashed:", err);
      job.status = "done";
      job.finishedAt = Date.now();
      job.currentGameId = null;
    });
  }
  return snapshot(job);
}

export function getStatus(userId: number): BatchJob | null {
  const j = jobs.get(userId);
  return j ? snapshot(j) : null;
}

export function cancel(userId: number): BatchJob | null {
  const j = jobs.get(userId);
  if (!j) return null;
  if (j.status === "running") {
    j.cancel = true;
    j.queue.length = 0;
  }
  return snapshot(j);
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

async function runWorker(job: InternalJob): Promise<void> {
  while (job.queue.length > 0 && !job.cancel) {
    const gameId = job.queue.shift()!;
    job.currentGameId = gameId;
    try {
      await processGame(job, gameId);
      job.analyzed += 1;
    } catch (err) {
      job.failed += 1;
      console.warn(`[batchAnalyzer] game ${gameId} failed:`, (err as Error).message);
    }
    job.currentGameId = null;
  }
  job.status = job.cancel ? "cancelled" : "done";
  job.finishedAt = Date.now();
  job.currentGameId = null;
}

async function processGame(job: InternalJob, gameId: number): Promise<void> {
  const result = await analyzeAndGenerate(gameId);
  job.generated += result.generated;
}

/**
 * Run Stockfish analysis (if missing) on a single game and dispatch every
 * problem generator. Returns the count of `training_problems` rows
 * created. Idempotent on the analysis row, but generators currently emit
 * duplicates if called twice on the same game — wipe / dedupe upstream
 * if that matters.
 *
 * Exported so out-of-process scripts (champion bulk-analyze, single-game
 * "analyze now" tools) can drive the same pipeline without inventing a
 * fake job.
 */
export async function analyzeAndGenerate(
  gameId: number,
): Promise<{ generated: number; failed: number }> {
  const game = await storage.getGame(gameId);
  if (!game) return { generated: 0, failed: 0 };

  let analysis = await storage.getAnalysisForGame(gameId);
  if (!analysis) {
    const computed = await analyzeGame(game.pgn);
    analysis = await storage.upsertGameAnalysis({ gameId, ...computed });
  }

  const args = { pgn: game.pgn, analysis, gameId };
  const buckets = [
    () => generateTacticsFromAnalysis({ ...args, module: "tactics" }),
    () => generateBlunderPreventerProblems(args),
    () => generateOpeningProblems(args),
    () => generateAdvantageProblems(args),
    () => generateEndgameProblems(args),
    () => generateDefenderProblems(args),
    () => generateIntuitionProblems(args),
  ];

  // Tag every persisted problem with a provenance string the UI can show
  // ("From your game" vs "Champion game") and also stash the original
  // game's player-vs-player headline in metadata so the trainer can name
  // it without an extra DB hit.
  const sourceTag = sourceTagFor(game.source);
  const provenance = {
    whitePlayer: game.whitePlayer ?? null,
    blackPlayer: game.blackPlayer ?? null,
    playedAt: game.playedAt?.toISOString() ?? null,
    eventOrPlatform: game.source ?? null,
  };

  let generated = 0;
  let failed = 0;
  for (const make of buckets) {
    try {
      const candidates = make();
      for (const c of candidates) {
        const meta = (c.metadata as Record<string, unknown> | undefined) ?? {};
        await storage.createTrainingProblem({
          ...c,
          source: sourceTag,
          metadata: { ...meta, ...provenance },
        });
        generated += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `[batchAnalyzer] generator failed for game ${gameId}:`,
        (err as Error).message,
      );
    }
  }
  return { generated, failed };
}

/**
 * Map a `games.source` column value to the `training_problems.source` tag
 * we want to expose to the UI. The labels are deliberately short so they
 * fit in a Badge without truncation.
 */
function sourceTagFor(gameSource: string | null | undefined): string {
  switch (gameSource) {
    case "champion":
      return "champion-game";
    case "lichess":
    case "chess.com":
    case "pgn":
      return "user-game";
    default:
      return "user-game"; // safe fallback for any imported game
  }
}

function snapshot(j: InternalJob): BatchJob {
  return {
    userId: j.userId,
    username: j.username,
    total: j.total,
    analyzed: j.analyzed,
    generated: j.generated,
    failed: j.failed,
    status: j.status,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    currentGameId: j.currentGameId,
  };
}
