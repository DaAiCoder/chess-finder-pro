/**
 * Bulk-analyze a champion's PGN library through the existing batch
 * analyzer pipeline (Stockfish + every problem generator). Each game
 * produced this way lands in the `games` table with `userId: null` and
 * `source: "champion"`, and every generated problem is tagged
 * `source: "champion-game"` so the UI can label them in PuzzlePlayer.
 *
 * Usage (from the repo root):
 *
 *   npm run analyze:champion -- botvinnik              # all of Botvinnik's games
 *   npm run analyze:champion -- tal --max 100          # first 100 Tal games
 *   npm run analyze:champion -- fischer --max 50 --offset 200
 *
 * Notes
 * -----
 * - Re-running the script will re-insert the same games (no dedupe).
 *   For now wipe the games table or restrict with --max / --offset.
 * - Stockfish at depth 8 takes ~1–2s per move, so a 50-move game is
 *   ~1–2 minutes. A full Botvinnik library (~700 games) can run for
 *   several hours — leave it overnight or cap with --max.
 */

import { Chess } from "chess.js";
import { storage } from "../server/storage.js";
import {
  hasChampionLibrary,
  loadChampion,
} from "../server/services/championGames.js";
import { analyzeAndGenerate } from "../server/services/batchAnalyzer.js";
import type { InsertGame } from "../shared/schema.js";

interface CliArgs {
  championId: string;
  max: number;
  offset: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith("-")) {
    console.error(
      "Usage: npm run analyze:champion -- <championId> [--max N] [--offset N]",
    );
    process.exit(2);
  }
  const championId = args[0];
  let max = Infinity;
  let offset = 0;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--max" && args[i + 1]) {
      max = Math.max(1, Number(args[++i]));
    } else if (args[i] === "--offset" && args[i + 1]) {
      offset = Math.max(0, Number(args[++i]));
    }
  }
  return { championId, max, offset };
}

async function main(): Promise<void> {
  const { championId, max, offset } = parseArgs();

  if (!(await hasChampionLibrary(championId))) {
    console.error(
      `No PGN library found for "${championId}". Run \`npm run fetch:pgn-mentor -- ${championId}\` first.`,
    );
    process.exit(1);
  }

  await storage.init();

  console.log(`Loading champion library for "${championId}"…`);
  const lib = await loadChampion(championId);
  const slice = lib.games.slice(offset, offset + (max === Infinity ? lib.total : max));
  console.log(
    `Library has ${lib.total.toLocaleString()} games. ` +
      `Processing ${slice.length.toLocaleString()} (offset ${offset}).`,
  );
  console.log(`Tag: source="champion", problem source="champion-game".\n`);

  const startedAt = Date.now();
  let inserted = 0;
  let analyzed = 0;
  let generated = 0;
  let failed = 0;

  for (let i = 0; i < slice.length; i++) {
    const cg = slice[i];
    const headers = cg.headers;
    const insert: InsertGame = {
      // Champion games belong to no user — they're a global library.
      userId: null,
      pgn: cg.pgn,
      whitePlayer: headers.white,
      blackPlayer: headers.black,
      whiteRating: headers.whiteElo ?? null,
      blackRating: headers.blackElo ?? null,
      result: headers.result === "*" ? null : headers.result,
      source: "champion",
      timeControl: null,
      eco: headers.eco || null,
      opening: derivePgnOpening(cg.pgn),
      playedAt: parsePgnDate(headers.date),
    };

    let game;
    try {
      game = await storage.createGame(insert);
      inserted++;
    } catch (err) {
      failed++;
      console.warn(
        `  [${i + 1}/${slice.length}] insert failed: ${(err as Error).message}`,
      );
      continue;
    }

    try {
      const r = await analyzeAndGenerate(game.id);
      generated += r.generated;
      analyzed += 1;
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      const rate = analyzed > 0 ? (analyzed / Number(elapsed || 1)).toFixed(2) : "0";
      process.stdout.write(
        `\r  [${(i + 1).toString().padStart(4)}/${slice.length}] ` +
          `${pad(headers.white, 16)} vs ${pad(headers.black, 16)} ` +
          `→ +${r.generated} problems · total ${generated} · ` +
          `${rate} games/s · ${elapsed}s`,
      );
    } catch (err) {
      failed++;
      console.warn(
        `\n  [${i + 1}/${slice.length}] analyze failed: ${(err as Error).message}`,
      );
    }
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log("\n");
  console.log(`Done in ${totalSec}s`);
  console.log(`  inserted   : ${inserted}`);
  console.log(`  analyzed   : ${analyzed}`);
  console.log(`  generated  : ${generated} training problems`);
  console.log(`  failed     : ${failed}`);
}

function derivePgnOpening(pgn: string): string | null {
  const m = pgn.match(/\[Opening\s+"([^"]+)"\]/);
  if (m) return m[1];
  // Fall back to the first 4 SAN moves so the games list isn't blank.
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
  // PGN format: "1972.07.11" — sometimes month/day are "??".
  const safe = d.replace(/\.\?\?/g, ".01");
  const t = Date.parse(safe.replace(/\./g, "-"));
  return Number.isFinite(t) ? new Date(t) : null;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s.padEnd(n);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
