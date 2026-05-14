/**
 * Library ingest — parse and store PGNs into the giant game database.
 *
 * Handles single PGNs and multi-game PGN files (Chessbase exports, Lichess
 * broadcast feeds, club tournament dumps, etc.). Each game is:
 *
 *  1. Split out of the multi-game blob.
 *  2. Header-parsed to extract player names, ratings, ECO, result, date.
 *  3. Classified into a tier based on average rating.
 *  4. Walked through the first 24 plies to build an EPD index so the
 *     position explorer can find this game by FEN.
 *  5. Deduplicated by SHA-1 hash of the normalized PGN.
 *  6. Persisted via `storage.createLibraryGame`.
 *
 * Designed for batch jobs: returns a summary `{inserted, duplicate, errors}`
 * so the admin UI can show a progress bar over thousands of games.
 */

import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { storage } from "../storage.js";
import { indexPgn } from "./gameLibrary.js";
import type {
  InsertLibraryGame,
  LibraryGame,
  LibraryTier,
} from "../../shared/schema.js";

export interface IngestSummary {
  inserted: number;
  duplicate: number;
  errors: number;
  total: number;
  insertedIds: number[];
  errorMessages: string[];
}

export interface IngestOptions {
  source: LibraryGame["source"];
  /** Override the auto-classified tier (e.g. force "broadcast"). */
  forceTier?: LibraryTier;
  /** How many plies to index per game (default 24). */
  maxIndexedPlies?: number;
  /** Cap total games processed (safety against runaway uploads). */
  maxGames?: number;
}

/**
 * Split a PGN blob into individual game strings. Games are separated by
 * the start of a new `[Event "…"]` header.
 */
export function splitPgnBlob(blob: string): string[] {
  const trimmed = blob.trim();
  if (!trimmed) return [];
  // Use a lookahead so the split keeps the [Event …] tag at the start.
  const games = trimmed
    .split(/(?=^\[Event\s)/m)
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && /\[\w+\s+"[^"]*"\]/.test(g));
  return games;
}

/** SHA-1 of the normalized PGN — used as the dedup key. */
function hashPgn(pgn: string): string {
  // Normalize whitespace so re-imports with different line endings dedupe.
  const norm = pgn.replace(/\s+/g, " ").trim();
  return createHash("sha1").update(norm).digest("hex");
}

/** Classify a game into a tier from the average rating. */
function classifyTier(avgRating: number | null): LibraryTier {
  if (avgRating == null) return "amateur";
  if (avgRating >= 2400) return "masters";
  if (avgRating >= 2200) return "titled";
  if (avgRating >= 2000) return "expert";
  if (avgRating >= 1600) return "intermediate";
  return "amateur";
}

interface ParsedHeaders {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  result?: string;
  eco?: string;
  opening?: string;
  event?: string;
  site?: string;
  date?: string;
  utcDate?: string;
  timeControl?: string;
}
function parseHeaders(pgn: string): ParsedHeaders {
  const out: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(pgn))) out[m[1]] = m[2];
  return {
    white: out.White,
    black: out.Black,
    whiteElo: out.WhiteElo,
    blackElo: out.BlackElo,
    result: out.Result,
    eco: out.ECO,
    opening: out.Opening,
    event: out.Event,
    site: out.Site,
    date: out.Date,
    utcDate: out.UTCDate,
    timeControl: out.TimeControl,
  };
}

function parseElo(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  // PGN uses "YYYY.MM.DD"; we convert "????" parts to 01.
  const norm = v.replace(/\./g, "-").replace(/-\?\?/g, "-01");
  const d = new Date(norm);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeResult(r: string | undefined): LibraryGame["result"] {
  if (!r) return "*";
  if (r === "1-0" || r === "0-1" || r === "1/2-1/2" || r === "*") return r;
  return "*";
}

/**
 * Ingest a single PGN string. Returns the created/existing LibraryGame
 * along with whether it was a duplicate.
 */
export async function ingestPgn(
  pgn: string,
  opts: IngestOptions,
): Promise<{ game: LibraryGame; duplicate: boolean }> {
  const hash = hashPgn(pgn);
  const existing = await storage.getLibraryGameByHash(hash);
  if (existing) return { game: existing, duplicate: true };

  const headers = parseHeaders(pgn);
  const whiteRating = parseElo(headers.whiteElo);
  const blackRating = parseElo(headers.blackElo);
  const avgRating =
    whiteRating != null && blackRating != null
      ? Math.round((whiteRating + blackRating) / 2)
      : whiteRating ?? blackRating ?? null;
  const tier = opts.forceTier ?? classifyTier(avgRating);

  // Count plies and build the parallel EPD + SAN index in a single pass.
  let plyCount = 0;
  try {
    const c = new Chess();
    c.loadPgn(pgn, { strict: false });
    plyCount = c.history().length;
  } catch (err) {
    console.warn(`[library-ingest] loadPgn failed: ${(err as Error).message}`);
  }
  const { epds, firstSans, firstUcis } = indexPgn(pgn, opts.maxIndexedPlies ?? 24);

  const insert: InsertLibraryGame = {
    pgnHash: hash,
    source: opts.source,
    tier,
    whitePlayer: headers.white ?? null,
    blackPlayer: headers.black ?? null,
    whiteRating,
    blackRating,
    avgRating,
    result: normalizeResult(headers.result),
    eco: headers.eco ?? null,
    opening: headers.opening ?? null,
    event: headers.event ?? null,
    site: headers.site ?? null,
    playedAt: parseDate(headers.utcDate ?? headers.date),
    timeControl: headers.timeControl ?? null,
    plyCount,
    pgn,
    epds,
    firstSans,
    firstUcis,
  };
  const game = await storage.createLibraryGame(insert);
  return { game, duplicate: false };
}

/**
 * Ingest a multi-game PGN blob. Each game is processed independently;
 * malformed games are counted as errors but don't abort the batch.
 */
export async function ingestPgnBlob(
  blob: string,
  opts: IngestOptions,
): Promise<IngestSummary> {
  const games = splitPgnBlob(blob);
  const cap = opts.maxGames ?? games.length;
  const summary: IngestSummary = {
    inserted: 0,
    duplicate: 0,
    errors: 0,
    total: 0,
    insertedIds: [],
    errorMessages: [],
  };
  for (let i = 0; i < Math.min(games.length, cap); i++) {
    summary.total++;
    try {
      const { game, duplicate } = await ingestPgn(games[i], opts);
      if (duplicate) summary.duplicate++;
      else {
        summary.inserted++;
        summary.insertedIds.push(game.id);
      }
    } catch (err) {
      summary.errors++;
      if (summary.errorMessages.length < 10) {
        summary.errorMessages.push((err as Error).message);
      }
    }
  }
  return summary;
}

/**
 * Pull a Lichess user's recent games into the library. Convenience
 * wrapper around the existing /api/import/lichess flow that targets the
 * library table instead of the per-user games table.
 */
export async function ingestLichessUser(
  username: string,
  max: number,
  opts?: { perfType?: string; tier?: LibraryTier },
): Promise<IngestSummary> {
  const params = new URLSearchParams({
    max: String(Math.min(Math.max(1, max), 1000)),
    pgnInJson: "true",
    clocks: "false",
    evals: "false",
    opening: "true",
  });
  if (opts?.perfType) params.set("perfType", opts.perfType);
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/x-ndjson" };
  if (process.env.LICHESS_TOKEN) headers.Authorization = `Bearer ${process.env.LICHESS_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? `lichess: user '${username}' not found` : `lichess HTTP ${res.status}`,
    );
  }
  const text = await res.text();
  const blob = text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const obj = JSON.parse(line) as { pgn?: string };
        return obj.pgn ?? "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
  return ingestPgnBlob(blob, { source: "lichess", forceTier: opts?.tier });
}

/**
 * Pull a Chess.com user's recent months into the library.
 */
export async function ingestChessComUser(
  username: string,
  monthsBack: number,
  opts?: { timeClass?: string; tier?: LibraryTier; max?: number },
): Promise<IngestSummary> {
  const ua: Record<string, string> = {
    "User-Agent": "ChessFinderPro/0.1 (library-ingest)",
    Accept: "application/json",
  };
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
    { headers: ua },
  );
  if (!archivesRes.ok) {
    throw new Error(
      archivesRes.status === 404
        ? `chess.com: user '${username}' not found`
        : `chess.com HTTP ${archivesRes.status}`,
    );
  }
  const { archives = [] } = (await archivesRes.json()) as { archives?: string[] };
  const sorted = archives.slice().sort();
  const latest = sorted.slice(-Math.max(1, Math.min(monthsBack, 24)));
  const summary: IngestSummary = {
    inserted: 0,
    duplicate: 0,
    errors: 0,
    total: 0,
    insertedIds: [],
    errorMessages: [],
  };
  const cap = opts?.max ?? Infinity;
  for (const monthUrl of latest) {
    if (summary.total >= cap) break;
    try {
      const r = await fetch(monthUrl, { headers: ua });
      if (!r.ok) continue;
      const json = (await r.json()) as {
        games?: { pgn: string; time_class?: string; rules?: string }[];
      };
      const monthly = (json.games ?? [])
        .filter((g) => g.rules === "chess" || g.rules == null)
        .filter((g) => !opts?.timeClass || g.time_class === opts.timeClass);
      const blob = monthly.map((g) => g.pgn).filter(Boolean).join("\n\n");
      const monthlySummary = await ingestPgnBlob(blob, {
        source: "chess.com",
        forceTier: opts?.tier,
        maxGames: cap - summary.total,
      });
      summary.inserted += monthlySummary.inserted;
      summary.duplicate += monthlySummary.duplicate;
      summary.errors += monthlySummary.errors;
      summary.total += monthlySummary.total;
      summary.insertedIds.push(...monthlySummary.insertedIds);
    } catch (err) {
      summary.errors++;
      if (summary.errorMessages.length < 10) {
        summary.errorMessages.push((err as Error).message);
      }
    }
  }
  return summary;
}
