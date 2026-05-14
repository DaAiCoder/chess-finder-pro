/**
 * Background auto-seed: keeps the trainers from feeling empty on a fresh
 * install by silently running a small batch of champion games through the
 * existing analysis + problem-generator pipeline shortly after server
 * start.
 *
 * Triggers ONLY when:
 *   - Persistent storage has fewer than ~MIN_GENERATED problems tagged as
 *     "champion-game" / "user-game" (i.e. not seed placeholders).
 *   - At least one champion PGN library is on disk
 *     (`server/data/championPgn/<id>.pgn`).
 *
 * Picks a curated mix of tactical/attacking champions so the generated
 * problems land disproportionately in defender / intuition / tactics /
 * advantage modules, which are the ones that look thinnest right after
 * seed-training.
 *
 * Runs inside `setImmediate` and is intentionally NOT awaited by
 * `server/index.ts` — startup must remain instant. Progress is logged
 * incrementally and crashes are swallowed (don't take the server down).
 */

import { Chess } from "chess.js";
import type { IStorage } from "../storage.js";
import { hasChampionLibrary, loadChampion } from "./championGames.js";
import { analyzeAndGenerate } from "./batchAnalyzer.js";
import type { InsertGame } from "../../shared/schema.js";

/**
 * Below this many GENERATED training problems (i.e. excluding hand-curated
 * seeds), kick off a background auto-seed pass.
 */
const MIN_GENERATED = 60;

/**
 * Maximum number of champion games to analyze per startup. Each game
 * costs ~30–90s with real Stockfish at depth 8, so the upper bound caps
 * worst-case CPU usage at ~10 minutes.
 */
const GAMES_PER_RUN = 8;

/**
 * Ordered list of champions to draw from. Picked for variety of phases /
 * tactical density so the generators output across every module:
 *   - tal/kasparov   → tactics, intuition (lots of sacrifices)
 *   - fischer/carlsen → endgame, advantage-capitalization
 *   - botvinnik/karpov → defender (positional grinds)
 */
const CHAMPION_PRIORITY = [
  "tal",
  "fischer",
  "kasparov",
  "carlsen",
  "botvinnik",
  "karpov",
  "capablanca",
  "anand",
];

export async function maybeAutoSeedFromChampions(
  storage: IStorage,
): Promise<void> {
  // Skip cheaply if the user already has plenty of generated content.
  const generated = await countGeneratedProblems(storage);
  if (generated >= MIN_GENERATED) {
    console.log(
      `[auto-seed] ${generated} generated problems already present, skipping.`,
    );
    return;
  }

  const championIds: string[] = [];
  for (const id of CHAMPION_PRIORITY) {
    if (await hasChampionLibrary(id)) championIds.push(id);
    if (championIds.length >= 4) break;
  }
  if (championIds.length === 0) {
    console.log(
      "[auto-seed] no champion PGN libraries on disk; run `npm run fetch:pgn-mentor` to enable auto-seed.",
    );
    return;
  }

  console.log(
    `[auto-seed] only ${generated} generated problems found; pulling ` +
      `${GAMES_PER_RUN} champion games from [${championIds.join(", ")}]…`,
  );

  // Pre-existing champion games (e.g. from a prior run) — skip duplicates
  // by PGN content hash so restarts don't re-insert the same positions.
  const existing = await storage.listGames();
  const existingPgns = new Set(
    existing.filter((g) => g.source === "champion").map((g) => hashPgn(g.pgn)),
  );

  const startedAt = Date.now();
  let inserted = 0;
  let analyzed = 0;
  let totalGenerated = 0;
  let failed = 0;

  // Round-robin across champions so we don't bias the generated content
  // toward a single playing style.
  const picks: Array<{ pgn: string; headers: Awaited<ReturnType<typeof loadChampion>>["games"][number]["headers"] }> = [];
  let cursor = 0;
  const libs = await Promise.all(championIds.map((id) => loadChampion(id)));
  while (picks.length < GAMES_PER_RUN) {
    const lib = libs[cursor % libs.length];
    cursor += 1;
    // Pick decisive games (skip draws — fewer interesting blunders) from
    // the early/middle of each library; later games tend to be modern
    // GM-vs-GM draws which don't generate as much variety.
    const idx = Math.min(picks.length * 13 + 7, lib.games.length - 1);
    const cg = lib.games[idx];
    if (!cg) break;
    if (cg.headers.result === "*" || cg.headers.result === "1/2-1/2") continue;
    picks.push({ pgn: cg.pgn, headers: cg.headers });
    if (cursor >= libs.length * 8) break; // safety against tight libraries
  }

  for (const { pgn, headers } of picks) {
    if (existingPgns.has(hashPgn(pgn))) continue;

    const insert: InsertGame = {
      userId: null,
      pgn,
      whitePlayer: headers.white,
      blackPlayer: headers.black,
      whiteRating: headers.whiteElo ?? null,
      blackRating: headers.blackElo ?? null,
      result: headers.result === "*" ? null : headers.result,
      source: "champion",
      timeControl: null,
      eco: headers.eco || null,
      opening: derivePgnOpening(pgn),
      playedAt: parsePgnDate(headers.date),
    };

    let game;
    try {
      game = await storage.createGame(insert);
      inserted += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[auto-seed] insert failed: ${(err as Error).message}`,
      );
      continue;
    }

    try {
      const r = await analyzeAndGenerate(game.id);
      analyzed += 1;
      totalGenerated += r.generated;
      console.log(
        `[auto-seed] (${analyzed}/${picks.length}) ${headers.white} vs ${headers.black} → +${r.generated} problems`,
      );
    } catch (err) {
      failed += 1;
      console.warn(
        `[auto-seed] analyze failed: ${(err as Error).message}`,
      );
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[auto-seed] done in ${elapsed}s — inserted ${inserted}, analyzed ${analyzed}, generated ${totalGenerated} problems, failed ${failed}.`,
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Count training problems whose source ISN'T `"seed"` — i.e. those produced
 * by the analysis pipeline (champion-game / user-game / lichess-puzzle).
 */
async function countGeneratedProblems(storage: IStorage): Promise<number> {
  const all = await storage.listTrainingProblems();
  return all.filter((p) => (p.source ?? "seed") !== "seed").length;
}

/**
 * Cheap content hash — used only for de-dup of the small auto-seed batch
 * across server restarts. Not cryptographic; collisions don't matter here
 * because the worst case is skipping a duplicate game.
 */
function hashPgn(pgn: string): number {
  let h = 0;
  for (let i = 0; i < pgn.length; i++) {
    h = ((h << 5) - h + pgn.charCodeAt(i)) | 0;
  }
  return h;
}

function derivePgnOpening(pgn: string): string | null {
  const m = pgn.match(/\[Opening\s+"([^"]+)"\]/);
  if (m) return m[1];
  try {
    const c = new Chess();
    c.loadPgn(pgn);
    return c.history().slice(0, 4).join(" ") || null;
  } catch {
    return null;
  }
}

function parsePgnDate(d: string): Date | null {
  if (!d || d === "????.??.??") return null;
  const safe = d.replace(/\.\?\?/g, ".01");
  const t = Date.parse(safe.replace(/\./g, "-"));
  return Number.isFinite(t) ? new Date(t) : null;
}
