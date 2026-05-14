/**
 * Auto-seed the Game Library from bundled PGN Mentor champion files.
 *
 * The Library page would otherwise be empty until the user manually
 * imports a PGN or a Lichess user, which makes the position explorer
 * useless out of the box — especially when the Lichess public explorer
 * is rate-limiting or unreachable.
 *
 * On a fresh install we:
 *   1. Check `countLibraryGames()` — if it's already ≥ MIN_LIBRARY_GAMES,
 *      skip silently (idempotent across restarts).
 *   2. Walk the curated champion list, loading their bundled PGN files
 *      from `server/data/championPgn/<id>.pgn`.
 *   3. Ingest up to PER_CHAMPION_CAP games from each, classified as
 *      `masters` tier with source `pgn`. Dedup is automatic via the
 *      pgnHash unique key.
 *   4. Cap the total at TOTAL_CAP so first-boot stays reasonable on
 *      slow disks / low-memory systems.
 *
 * Runs in the background (via setImmediate) so server startup stays
 * snappy. Failures are logged but never crash.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { hasChampionLibrary, loadChampion } from "./championGames.js";
import { ingestPgn, ingestPgnBlob } from "./libraryIngest.js";
import { indexPgn } from "./gameLibrary.js";
import type { IStorage } from "../storage.js";

/** Skip seeding when the library already has at least this many games. */
const MIN_LIBRARY_GAMES = 200;

/**
 * Max games per champion to ingest in a single pass. Picked so the
 * full sweep stays under ~10 s on a typical laptop SSD and the
 * resulting storage.json stays under ~10 MB. Users can manually import
 * more from each champion via the Library UI.
 */
const PER_CHAMPION_CAP = Number(
  process.env.LIBRARY_SEED_PER_CHAMPION ?? 80,
);

/** Hard ceiling so we don't blow up RAM. */
const TOTAL_CAP = Number(process.env.LIBRARY_SEED_TOTAL ?? 1_500);

/** Champions whose libraries we know are bundled (per `manifest.json`). */
const CHAMPION_PRIORITY = [
  "carlsen",
  "kasparov",
  "fischer",
  "karpov",
  "anand",
  "kramnik",
  "tal",
  "capablanca",
  "alekhine",
  "lasker",
  "botvinnik",
  "petrosian",
  "smyslov",
  "spassky",
  "morphy",
  "steinitz",
  "nimzowitsch",
  "ding",
  "gukesh",
  "nakamura",
  "caruana",
];

export async function maybeAutoSeedLibrary(storage: IStorage): Promise<void> {
  // Always backfill `firstSans` for older library rows so the explorer
  // can use its fast lookup path. Cheap: we only re-parse PGNs for
  // games missing the index.
  await backfillFirstSans(storage);

  const existing = await storage.countLibraryGames();
  if (existing >= MIN_LIBRARY_GAMES) {
    console.log(
      `[library-seed] ${existing} games already in library, skipping.`,
    );
    return;
  }

  console.log(
    `[library-seed] library has ${existing} games (< ${MIN_LIBRARY_GAMES}); seeding from bundled champion PGNs…`,
  );

  let inserted = 0;
  let duplicates = 0;
  let errors = 0;
  let processed = 0;
  let totalProcessed = 0;

  for (const championId of CHAMPION_PRIORITY) {
    if (totalProcessed >= TOTAL_CAP) break;
    if (!(await hasChampionLibrary(championId))) continue;
    try {
      const lib = await loadChampion(championId);
      const cap = Math.min(PER_CHAMPION_CAP, lib.games.length, TOTAL_CAP - totalProcessed);
      let champInserted = 0;
      for (let i = 0; i < cap; i++) {
        totalProcessed++;
        processed++;
        try {
          const r = await ingestPgn(lib.games[i].pgn, {
            source: "pgn",
            // Tier auto-classifies from headers — most champion games have
            // 2400+ ratings so they'll land in "masters" automatically.
            // Older games (Morphy, Steinitz, Lasker) often lack Elo
            // headers; force them into masters since they're by definition
            // top-of-era play.
            forceTier: "masters",
            maxIndexedPlies: 24,
          });
          if (r.duplicate) duplicates++;
          else {
            inserted++;
            champInserted++;
          }
        } catch (err) {
          errors++;
          if (errors < 10) {
            console.warn(
              `[library-seed] ingest error in ${championId}#${i}: ${(err as Error).message}`,
            );
          }
        }
        // Yield to the event loop periodically so we don't block the
        // server during seeding of many thousands of games.
        if (processed % 100 === 0) {
          await new Promise((r) => setImmediate(r));
        }
      }
      if (champInserted > 0) {
        console.log(
          `[library-seed] ${championId}: +${champInserted} games (${cap} processed)`,
        );
      }
    } catch (err) {
      console.warn(
        `[library-seed] failed to load ${championId}: ${(err as Error).message}`,
      );
    }
  }

  // Computer-vs-computer bundle: optional. Drop any PGN files into
  // `server/data/cvcPgn/` and they get ingested under tier:"engine"
  // (source:"pgn"), which makes them show up in the Computer Classics
  // Watch channel. See [server/data/cvcPgn/README.md].
  await ingestCvcBundle();

  const total = await storage.countLibraryGames();
  console.log(
    `[library-seed] done — inserted ${inserted}, duplicates ${duplicates}, errors ${errors}. ` +
      `Library now has ${total} games.`,
  );
}

/* ---------------------------------------------------------------------- */
/* Computer-vs-Computer bundle                                            */
/* ---------------------------------------------------------------------- */

async function ingestCvcBundle(): Promise<void> {
  const dir = path.resolve(process.cwd(), "server", "data", "cvcPgn");
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const pgnFiles = entries.filter((f) => f.toLowerCase().endsWith(".pgn"));
  if (pgnFiles.length === 0) return;
  let inserted = 0;
  let duplicate = 0;
  let errors = 0;
  for (const file of pgnFiles) {
    const full = path.join(dir, file);
    try {
      const blob = await fs.readFile(full, "utf8");
      const summary = await ingestPgnBlob(blob, {
        source: "pgn",
        forceTier: "engine",
      });
      inserted += summary.inserted;
      duplicate += summary.duplicate;
      errors += summary.errors;
    } catch (err) {
      errors++;
      console.warn(
        `[library-seed] cvc ${file} failed: ${(err as Error).message}`,
      );
    }
  }
  if (inserted > 0 || duplicate > 0 || errors > 0) {
    console.log(
      `[library-seed] cvc bundle: +${inserted} games (${duplicate} duplicate, ${errors} errors)`,
    );
  }
}

/**
 * Backfill `firstSans` for any library games stored before that field
 * existed. Idempotent: skips games that already have a non-empty index.
 *
 * We can't update in place through the IStorage interface (no setter)
 * without breaking the abstraction, so we re-create the row with the
 * same hash. The hash dedupe path turns this into a no-op AFTER the
 * first run completes — exactly the behaviour we want.
 */
async function backfillFirstSans(storage: IStorage): Promise<void> {
  let backfilled = 0;
  let offset = 0;
  let yieldCounter = 0;
  const PAGE = 200;
  for (;;) {
    const page = await storage.listLibraryGames({ limit: PAGE, offset });
    if (page.length === 0) break;
    for (const g of page) {
      const hasSans = g.firstSans && g.firstSans.length > 0;
      const hasUcis = g.firstUcis && g.firstUcis.length > 0;
      if (hasSans && hasUcis) continue;
      const { firstSans, firstUcis } = indexPgn(g.pgn, 24);
      if (firstSans.length === 0) continue;
      // Mutate the row in place — the InMemoryStorage map holds the
      // same object reference, so this immediately propagates. The
      // next debounced flush will persist the new fields.
      (g as { firstSans?: string[]; firstUcis?: string[] }).firstSans = firstSans;
      (g as { firstSans?: string[]; firstUcis?: string[] }).firstUcis = firstUcis;
      backfilled++;
      // Yield to the event loop frequently — chess.js PGN parsing is
      // CPU-bound and we don't want to block incoming HTTP requests
      // during a cold start with thousands of legacy rows.
      if (++yieldCounter % 25 === 0) {
        await new Promise((r) => setImmediate(r));
      }
    }
    offset += page.length;
    if (page.length < PAGE) break;
  }
  if (backfilled > 0) {
    console.log(
      `[library-seed] backfilled firstSans/firstUcis on ${backfilled} games.`,
    );
  }
}
