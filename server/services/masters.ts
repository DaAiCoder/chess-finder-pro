/**
 * Thin wrapper over the Lichess masters explorer
 * (https://explorer.lichess.ovh/masters).
 *
 * - Aggressive in-memory caching keyed by FEN — masters data is static, so
 *   we cache forever within a process.
 * - **Persistent** cache written to disk so setup walks survive rate-
 *   limits across restarts (fixes the Hedgehog vs 1.c4 case noted in
 *   the trainer growth plan).
 * - 2.5 s per-request timeout; silently returns null on failure so callers
 *   can fall back to the engine.
 * - One shared cache for both the line searcher and the setup searcher.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";

export interface MasterMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface MasterStats {
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
  moves: MasterMove[];
}

const ALLOW_NETWORK = process.env.NODE_ENV !== "test";
// Short timeout: with thousands of local master games available as a
// fallback, we'd rather snap to the local data than make the user wait.
const TIMEOUT_MS = Number(process.env.MASTERS_TIMEOUT_MS ?? 1_200);
const cache = new Map<string, MasterStats | null>();

const PERSIST_FILE = path.resolve(
  process.env.MASTERS_CACHE_FILE ??
    path.join(process.cwd(), "data", "masters-cache.json"),
);
const PERSIST_ENABLED = process.env.MASTERS_CACHE_PERSIST !== "false";

let writeTimer: NodeJS.Timeout | null = null;
let writeInFlight: Promise<void> | null = null;
let loaded = false;

async function loadFromDisk(): Promise<void> {
  if (loaded || !PERSIST_ENABLED) return;
  loaded = true;
  if (!existsSync(PERSIST_FILE)) return;
  try {
    const raw = await fs.readFile(PERSIST_FILE, "utf8");
    const snap = JSON.parse(raw) as Record<string, MasterStats | null>;
    for (const [fen, val] of Object.entries(snap)) cache.set(fen, val);
  } catch {
    /* corrupt file → start fresh */
  }
}

function scheduleFlush(): void {
  if (!PERSIST_ENABLED) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeInFlight = (writeInFlight ?? Promise.resolve())
      .then(flushToDisk)
      .catch((err) =>
        console.warn(`[masters-cache] flush failed: ${(err as Error).message}`),
      );
  }, 5_000);
}

async function flushToDisk(): Promise<void> {
  const out: Record<string, MasterStats | null> = {};
  for (const [k, v] of cache) out[k] = v;
  await fs.mkdir(path.dirname(PERSIST_FILE), { recursive: true });
  const tmp = `${PERSIST_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(out));
  await fs.rename(tmp, PERSIST_FILE);
}

/** Fetch masters stats for a FEN, returning null on miss/error. */
export async function fetchMasters(fen: string): Promise<MasterStats | null> {
  await loadFromDisk();
  if (!ALLOW_NETWORK) return null;
  if (cache.has(fen)) return cache.get(fen) ?? null;
  try {
    const url = new URL("https://explorer.lichess.ovh/masters");
    url.searchParams.set("fen", fen);
    url.searchParams.set("moves", "8");
    url.searchParams.set("topGames", "0");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const headers: Record<string, string> = {
      "User-Agent": "ChessFinderPro/0.1 (+https://chessfinderpro.local)",
      Accept: "application/json",
    };
    // Lichess's explorer may require a token in some deployments (and to
    // bypass aggressive rate-limiting). Reuse LICHESS_TOKEN if present.
    if (process.env.LICHESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.LICHESS_TOKEN}`;
    }
    const res = await fetch(url.toString(), { signal: ctrl.signal, headers });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(
        `[masters] fetch failed: ${res.status} ${res.statusText} for fen=${fen.slice(0, 30)}…`,
      );
      if (res.status === 429 || res.status >= 500) {
        // Transient — don't cache so the next call retries.
        return null;
      }
      cache.set(fen, null);
      return null;
    }
    const data = (await res.json()) as MasterStats;
    cache.set(fen, data);
    scheduleFlush();
    return data;
  } catch {
    // Don't cache transient timeouts so the next call retries.
    return null;
  }
}

/** Read-only access to the cache, used when building results. */
export function getCachedMasters(fen: string): MasterStats | undefined {
  return cache.get(fen) ?? undefined;
}
