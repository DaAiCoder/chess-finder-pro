/**
 * Loads bundled PGN Mentor collections per champion (see
 * `server/data/championPgn/README.md`) and exposes a paginated, searchable
 * view over them. Files are read and split lazily per champion id, then
 * cached in module-scope memory so subsequent requests are O(1) lookups.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ChampionGameHeaders {
  white: string;
  black: string;
  date: string;
  result: string;
  event: string;
  eco: string;
  whiteElo: number | null;
  blackElo: number | null;
}

export interface ChampionGameSummary {
  index: number; // stable index within the player's PGN file
  headers: ChampionGameHeaders;
}

export interface ChampionGame extends ChampionGameSummary {
  pgn: string;
}

interface CachedChampion {
  total: number;
  games: ChampionGame[];
  loadedAt: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PGN_DIR = path.resolve(__dirname, "..", "data", "championPgn");

const cache = new Map<string, CachedChampion>();

/** True when `<id>.pgn` exists on disk. Cheap stat-only check. */
export async function hasChampionLibrary(id: string): Promise<boolean> {
  try {
    const s = await stat(pgnPathFor(id));
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Reads, splits, and caches the champion's PGN file. Returns the in-memory
 * cache entry. Throws if the file is missing — callers should check
 * `hasChampionLibrary` first.
 *
 * Exported so out-of-process scripts (e.g. bulk-analyze) can iterate the
 * full library without going through the paginated HTTP API.
 */
export async function loadChampion(id: string): Promise<CachedChampion> {
  const cached = cache.get(id);
  if (cached) return cached;

  const raw = await readFile(pgnPathFor(id), "utf8");
  const chunks = splitPgnDocument(raw);
  const games: ChampionGame[] = chunks.map((pgn, index) => ({
    index,
    headers: extractHeaders(pgn),
    pgn,
  }));
  const entry: CachedChampion = { total: games.length, games, loadedAt: Date.now() };
  cache.set(id, entry);
  return entry;
}

export interface ListChampionGamesResult {
  total: number;
  matched: number;
  page: number;
  limit: number;
  games: ChampionGameSummary[];
}

export async function listChampionGames(
  id: string,
  opts: { q?: string; page?: number; limit?: number } = {},
): Promise<ListChampionGamesResult> {
  const entry = await loadChampion(id);
  const limit = clamp(opts.limit ?? 25, 1, 100);
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().toLowerCase() ?? "";

  const filtered = q
    ? entry.games.filter((g) => matchesQuery(g.headers, q))
    : entry.games;

  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit).map(stripPgn);

  return {
    total: entry.total,
    matched: filtered.length,
    page,
    limit,
    games: slice,
  };
}

export async function getChampionGame(
  id: string,
  index: number,
): Promise<ChampionGame | null> {
  const entry = await loadChampion(id);
  return entry.games[index] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function pgnPathFor(id: string): string {
  // Defensive: champion ids are url-safe slugs. Rejecting anything else
  // prevents `..` traversal even though Express params already exclude `/`.
  if (!/^[a-z0-9_-]+$/i.test(id)) {
    throw new Error(`invalid champion id: ${id}`);
  }
  return path.join(PGN_DIR, `${id}.pgn`);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function stripPgn(g: ChampionGame): ChampionGameSummary {
  return { index: g.index, headers: g.headers };
}

function matchesQuery(h: ChampionGameHeaders, q: string): boolean {
  return (
    h.white.toLowerCase().includes(q) ||
    h.black.toLowerCase().includes(q) ||
    h.event.toLowerCase().includes(q) ||
    h.eco.toLowerCase().includes(q) ||
    h.date.toLowerCase().includes(q)
  );
}

/** Split a multi-game PGN document on `[Event ...]` boundaries. */
function splitPgnDocument(pgn: string): string[] {
  return pgn
    .split(/\r?\n(?=\[Event\s)/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function extractHeaders(pgn: string): ChampionGameHeaders {
  const map: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn))) map[m[1]] = m[2];
  return {
    white: map.White ?? "?",
    black: map.Black ?? "?",
    date: map.Date ?? "",
    result: map.Result ?? "*",
    event: map.Event ?? "",
    eco: map.ECO ?? "",
    whiteElo: parseElo(map.WhiteElo),
    blackElo: parseElo(map.BlackElo),
  };
}

function parseElo(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
