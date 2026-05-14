/**
 * Periodic per-user generator runner.
 *
 * Once a week (configurable via `GENERATOR_CRON_INTERVAL_MS`) we walk
 * every user's imported games that don't yet have a stored analysis,
 * analyze them with Stockfish, then run every `*Generator.ts` service
 * on them and insert the resulting `training_problems`. This is the
 * counterpart to the existing manual `POST /api/games/:id/generate/:module`
 * route, which only fires when a user clicks "generate" by hand.
 *
 * The cron is intentionally conservative: it processes at most
 * `GENERATOR_CRON_BATCH` games per user per tick so we don't pin a
 * single Stockfish process forever on a noisy import.
 */

import type { IStorage } from "../storage.js";
import { analyzeGame } from "./gameAnalyzer.js";
import { generateTacticsFromAnalysis } from "./tacticsGenerator.js";
import { generateBlunderPreventerProblems } from "./blunderPreventerGenerator.js";
import { generateOpeningProblems } from "./openingImproverGenerator.js";
import { generateAdvantageProblems } from "./advantageCapitalizationGenerator.js";
import { generateEndgameProblems } from "./endgameTrainerGenerator.js";
import type { InsertTrainingProblem } from "../../shared/schema.js";

const INTERVAL_MS = Number(
  process.env.GENERATOR_CRON_INTERVAL_MS ?? 1000 * 60 * 60 * 24 * 7, // weekly
);
const BATCH_PER_USER = Number(process.env.GENERATOR_CRON_BATCH ?? 5);
const TICK_DELAY_MS = Number(process.env.GENERATOR_CRON_TICK_DELAY_MS ?? 250);

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startGeneratorCron(storage: IStorage): void {
  if (process.env.GENERATOR_CRON === "off") {
    console.log("[generator-cron] disabled (GENERATOR_CRON=off)");
    return;
  }
  // Run once shortly after boot, then on a recurring interval.
  scheduleNext(storage, 1000 * 60); // 1 min after boot
}

function scheduleNext(storage: IStorage, ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void runOnce(storage)
      .catch((err) => {
        console.warn("[generator-cron] tick crashed:", (err as Error).message);
      })
      .finally(() => {
        scheduleNext(storage, INTERVAL_MS);
      });
  }, ms);
  if (typeof timer === "object" && "unref" in (timer as object)) {
    (timer as NodeJS.Timeout).unref();
  }
}

/**
 * Walk every user and process up to `BATCH_PER_USER` of their unanalyzed
 * games. Exposed for tests / one-shot manual runs.
 */
export async function runOnce(storage: IStorage): Promise<{
  usersProcessed: number;
  gamesProcessed: number;
  problemsCreated: number;
}> {
  if (inFlight) {
    return { usersProcessed: 0, gamesProcessed: 0, problemsCreated: 0 };
  }
  inFlight = true;
  let usersProcessed = 0;
  let gamesProcessed = 0;
  let problemsCreated = 0;
  try {
    const userIds = await collectUserIds(storage);
    for (const userId of userIds) {
      const games = await storage.listGames(userId);
      const candidates = await pickUnprocessed(storage, games, BATCH_PER_USER);
      if (candidates.length === 0) continue;
      usersProcessed++;
      for (const g of candidates) {
        try {
          let analysis = await storage.getAnalysisForGame(g.id);
          if (!analysis) {
            const computed = await analyzeGame(g.pgn);
            analysis = await storage.upsertGameAnalysis({ gameId: g.id, ...computed });
          }
          const inserts: InsertTrainingProblem[] = [
            ...generateTacticsFromAnalysis({
              pgn: g.pgn,
              analysis,
              gameId: g.id,
              module: "tactics",
            }),
            ...generateBlunderPreventerProblems({ pgn: g.pgn, analysis, gameId: g.id }),
            ...generateOpeningProblems({ pgn: g.pgn, analysis, gameId: g.id }),
            ...generateAdvantageProblems({ pgn: g.pgn, analysis, gameId: g.id }),
            ...generateEndgameProblems({ pgn: g.pgn, analysis, gameId: g.id }),
          ];
          for (const row of inserts) {
            await storage.createTrainingProblem(row);
            problemsCreated++;
          }
          gamesProcessed++;
          await sleep(TICK_DELAY_MS);
        } catch (err) {
          console.warn(
            `[generator-cron] game ${g.id} failed: ${(err as Error).message}`,
          );
        }
      }
    }
  } finally {
    inFlight = false;
  }
  if (gamesProcessed > 0) {
    console.log(
      `[generator-cron] processed ${gamesProcessed} game(s) across ${usersProcessed} user(s); created ${problemsCreated} problem(s)`,
    );
  }
  return { usersProcessed, gamesProcessed, problemsCreated };
}

async function collectUserIds(storage: IStorage): Promise<number[]> {
  const games = await storage.listGames();
  const set = new Set<number>();
  for (const g of games) {
    if (g.userId != null) set.add(g.userId);
  }
  return [...set];
}

async function pickUnprocessed(
  storage: IStorage,
  games: Awaited<ReturnType<IStorage["listGames"]>>,
  limit: number,
): Promise<typeof games> {
  const out: typeof games = [];
  for (const g of games) {
    if (out.length >= limit) break;
    const existing = await storage.getAnalysisForGame(g.id);
    if (existing) continue;
    out.push(g);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
