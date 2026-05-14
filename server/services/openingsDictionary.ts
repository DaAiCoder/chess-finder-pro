/**
 * Openings dictionary.
 *
 * Provides a single in-memory catalog of named openings, indexed for fast
 * fuzzy lookup by the Pattern Finder NL parser.
 *
 * Sources, in priority order:
 *   1. `OPENING_SEEDS` (curated, ships in-tree — ~120 entries).
 *   2. `server/data/openings/*.tsv` (Lichess `chess-openings` dataset,
 *      optional — drop in via `npm run fetch:openings` to get full ECO
 *      coverage ~3500 entries).
 *
 * Indexing strategy:
 *   - Each entry's name and aliases are lowercased and stored in a
 *     `Map<string, OpeningEntry>` for O(1) exact match.
 *   - We also keep a sorted array of {token, entry} pairs for substring
 *     scans so "blackmar diemer" finds "Blackmar-Diemer Gambit Accepted"
 *     even though that's not the entry's primary name.
 *   - A separate `Map<fen, entry>` lets the line searcher tag arbitrary
 *     positions with their opening name.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import type { OpeningEntry } from "../../shared/schema.js";
import { OPENING_SEEDS } from "../data/openings/seed.js";

const TSV_DIR = path.join(process.cwd(), "server", "data", "openings");
const TSV_FILES = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];

let _entries: OpeningEntry[] | null = null;
let _byId: Map<string, OpeningEntry> | null = null;
let _byName: Map<string, OpeningEntry> | null = null;
let _byFen: Map<string, OpeningEntry> | null = null;
let _tokens: Array<{ token: string; entry: OpeningEntry }> | null = null;

/** Lazily build the index on first access. */
async function ensureLoaded(): Promise<void> {
  if (_entries) return;

  const map = new Map<string, OpeningEntry>();

  // Seed first — short, hand-checked names take priority.
  for (const seed of OPENING_SEEDS) {
    const fen = fenAfter(seed.prefixSan);
    if (!fen) continue;
    map.set(seed.id, {
      id: seed.id,
      name: seed.name,
      eco: seed.eco,
      aliases: seed.aliases,
      prefixSan: seed.prefixSan,
      fen,
    });
  }

  // Optional: layer the Lichess TSV dataset on top.
  for (const f of TSV_FILES) {
    const file = path.join(TSV_DIR, f);
    if (!existsSync(file)) continue;
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const cols = trimmed.split("\t");
        if (cols.length < 3) continue;
        const [eco, name, pgn] = cols;
        if (!name || !pgn) continue;
        const moves = pgnToSan(pgn);
        if (moves.length === 0) continue;
        const fen = fenAfter(moves);
        if (!fen) continue;
        const id = slugify(name);
        if (map.has(id)) continue;
        map.set(id, { id, name, eco, aliases: [], prefixSan: moves, fen });
      }
    } catch (err) {
      console.warn(
        `[openings] couldn't read ${f}: ${(err as Error).message}`,
      );
    }
  }

  _entries = Array.from(map.values());
  _byId = map;
  _byName = new Map();
  _byFen = new Map();
  _tokens = [];
  for (const e of _entries) {
    _byName.set(e.name.toLowerCase(), e);
    _byFen.set(e.fen, e);
    _tokens.push({ token: e.name.toLowerCase(), entry: e });
    for (const a of e.aliases) {
      _byName.set(a.toLowerCase(), e);
      _tokens.push({ token: a.toLowerCase(), entry: e });
    }
  }
  // Longest tokens first so we prefer the most specific match.
  _tokens.sort((a, b) => b.token.length - a.token.length);
}

export async function listOpenings(): Promise<OpeningEntry[]> {
  await ensureLoaded();
  return _entries ?? [];
}

export async function getOpening(id: string): Promise<OpeningEntry | undefined> {
  await ensureLoaded();
  return _byId?.get(id);
}

export async function findOpeningByFen(fen: string): Promise<OpeningEntry | undefined> {
  await ensureLoaded();
  return _byFen?.get(fen);
}

/**
 * Resolve a free-form hint ("blackmar diemer", "Sicilian Najdorf") into the
 * best-matching opening. Strategy:
 *   1. Exact match on name or alias (lowercased).
 *   2. Longest substring match across all known tokens.
 * Returns `undefined` when nothing plausible matches.
 */
export async function resolveOpeningName(
  hint: string,
): Promise<OpeningEntry | undefined> {
  await ensureLoaded();
  if (!hint || !_byName || !_tokens) return undefined;
  const normalized = normalize(hint);

  // Exact lookup first.
  if (_byName.has(normalized)) return _byName.get(normalized);

  // Try the hint as a substring of a token (handles "morra" → smith-morra,
  // "najdorf" → sicilian-najdorf, etc.).
  let best: { entry: OpeningEntry; score: number } | null = null;
  for (const { token, entry } of _tokens) {
    if (token.includes(normalized) || normalized.includes(token)) {
      const score = Math.min(token.length, normalized.length);
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best?.entry;
}

/** Lowercase, strip accents, collapse non-alphanum to single spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return normalize(s).replace(/\s+/g, "-");
}

function fenAfter(moves: string[]): string {
  const c = new Chess();
  try {
    for (const m of moves) c.move(m);
  } catch {
    return "";
  }
  return c.fen();
}

/** Strip move numbers / annotations from a PGN-style string → SAN array. */
function pgnToSan(pgn: string): string[] {
  return pgn
    .replace(/\d+\./g, " ")
    .replace(/[?!]+/g, "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
