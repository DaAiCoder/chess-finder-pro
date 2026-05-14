/**
 * Game Library — unified position explorer.
 *
 * Fuses three data sources behind a single API:
 *
 *  1. **Lichess Masters** — 2200+ FIDE rated games, via
 *     `explorer.lichess.ovh/masters` (already wrapped in `masters.ts`).
 *  2. **Lichess Open Database** — rating-banded amateur/club/expert games,
 *     via `explorer.lichess.ovh/lichess?ratings=2500,2200,2000,1800,1600,…`.
 *  3. **Local Library** — games imported into our own `library_games`
 *     table (Chess.com archives, Chessbase dumps, user PGNs, broadcast
 *     PGNs). Indexed by EPD so position lookups are O(1).
 *
 * The explorer normalises all three into the same shape so the UI can
 * show "Masters / Lichess 2500+ / Lichess 2000-2499 / … / My Library" as
 * sibling tabs.
 *
 * Results are cached per `(epd, tier)` in `library_position_stats` with
 * a 7-day TTL (configurable via `LIBRARY_STATS_TTL_DAYS`). Caching is
 * essential because Lichess API rate-limits and the position explorer is
 * the hottest endpoint in this feature.
 */

import { Chess } from "chess.js";
import { fetchMasters, type MasterStats } from "./masters.js";
import { storage } from "../storage.js";
import type {
  LibraryGame,
  LibraryPositionStats,
  InsertLibraryPositionStats,
} from "../../shared/schema.js";

/* ---------------------------------------------------------------------- */
/* Tier definitions                                                        */
/* ---------------------------------------------------------------------- */

export const EXPLORER_TIERS = [
  "masters",
  "lichess-2500",
  "lichess-2000",
  "lichess-1600",
  "lichess-1200",
  "local",
] as const;
export type ExplorerTier = (typeof EXPLORER_TIERS)[number];

const TIER_LABELS: Record<ExplorerTier, string> = {
  masters: "Masters",
  "lichess-2500": "Lichess 2500+",
  "lichess-2000": "Lichess 2000-2499",
  "lichess-1600": "Lichess 1600-1999",
  "lichess-1200": "Lichess <1600",
  local: "My Library",
};

const TIER_RATINGS: Record<ExplorerTier, string> = {
  masters: "", // masters endpoint does not need rating filter
  /** Lichess rating buckets: each value is a pool the explorer aggregates. */
  "lichess-2500": "2500",
  "lichess-2000": "2000,2200,2500",
  "lichess-1600": "1600,1800,2000",
  "lichess-1200": "1000,1200,1400,1600",
  local: "",
};

/**
 * Maps each explorer tier to the set of *library storage* tiers that
 * cover the same rating band. Used to surface local imports when
 * Lichess is unreachable for that tier.
 *
 * Library tiers (from `libraryIngest.classifyTier`):
 *   masters       ≥ 2400
 *   titled        2200–2399
 *   expert        2000–2199
 *   intermediate  1600–1999
 *   amateur       < 1600
 */
const TIER_LOCAL_FALLBACKS: Record<ExplorerTier, readonly string[]> = {
  masters: ["masters", "titled"],
  "lichess-2500": ["masters", "titled"],
  "lichess-2000": ["expert", "titled"],
  "lichess-1600": ["intermediate"],
  "lichess-1200": ["amateur"],
  local: [], // local uses aggregateLocalGames without a tier filter
};

const CACHE_TTL_MS =
  Number(process.env.LIBRARY_STATS_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000;

const ALLOW_NETWORK = process.env.NODE_ENV !== "test";
const LICHESS_TIMEOUT_MS = 3_000;

/* ---------------------------------------------------------------------- */
/* EPD helpers — strip the half-/full-move clocks so positions collapse   */
/* ---------------------------------------------------------------------- */

/** Strip the trailing clocks from a FEN so equivalent positions hash equal. */
export function fenToEpd(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Compute the first `maxPlies` EPDs reached when playing through a PGN. */
export function epdsFromPgn(pgn: string, maxPlies = 24): string[] {
  return indexPgn(pgn, maxPlies).epds;
}

/**
 * Walk a PGN once, returning both the EPD positions visited AND the SAN
 * sequence of moves played. The two arrays are parallel: `firstSans[i]`
 * is the move that was played from the position whose EPD is `epds[i]`.
 *
 * Pre-computing the SAN sequence is what makes the position explorer
 * fast at query time — without it we'd have to re-parse and replay
 * every candidate PGN to figure out which move was played.
 */
export function indexPgn(
  pgn: string,
  maxPlies = 24,
): { epds: string[]; firstSans: string[]; firstUcis: string[] } {
  const epds: string[] = [];
  const firstSans: string[] = [];
  const firstUcis: string[] = [];
  try {
    const c = new Chess();
    c.loadPgn(pgn, { strict: false });
    const history = c.history({ verbose: true });
    const replay = new Chess();
    epds.push(fenToEpd(replay.fen()));
    const limit = Math.min(history.length, maxPlies);
    for (let i = 0; i < limit; i++) {
      firstSans.push(history[i].san);
      firstUcis.push(history[i].lan);
      replay.move(history[i]);
      epds.push(fenToEpd(replay.fen()));
    }
  } catch (err) {
    console.warn(
      `[library] indexPgn failed: ${(err as Error).message} (pgn=${pgn.slice(0, 80)}…)`,
    );
  }
  return { epds, firstSans, firstUcis };
}

/* ---------------------------------------------------------------------- */
/* Unified result shape                                                    */
/* ---------------------------------------------------------------------- */

export interface ExplorerMove {
  san: string;
  uci: string;
  whiteWins: number;
  draws: number;
  blackWins: number;
  games: number;
  /** Play rate within this tier, 0..1. */
  rate: number;
  /** Score for white in % (1=win, 0.5=draw). */
  whiteScore: number;
  avgRating: number | null;
  evalCp?: number | null;
}

export interface ExplorerSampleGame {
  libraryGameId?: number;
  lichessGameId?: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  year?: number;
}

export interface ExplorerResult {
  tier: ExplorerTier;
  label: string;
  epd: string;
  totalGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgRating: number | null;
  moves: ExplorerMove[];
  sampleGames: ExplorerSampleGame[];
  /** Whether the data came from cache vs a fresh network call. */
  cached: boolean;
  /** ISO timestamp of the last refresh. */
  refreshedAt: string;
}

/* ---------------------------------------------------------------------- */
/* Lichess explorer (tier-banded amateur/club/expert)                      */
/* ---------------------------------------------------------------------- */

interface LichessExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}
interface LichessExplorerResponse {
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
  moves: LichessExplorerMove[];
  topGames?: Array<{
    id: string;
    white: { name: string; rating: number };
    black: { name: string; rating: number };
    winner?: "white" | "black";
    year?: number;
  }>;
}

async function fetchLichessExplorer(
  fen: string,
  ratings: string,
): Promise<LichessExplorerResponse | null> {
  if (!ALLOW_NETWORK) return null;
  try {
    const url = new URL("https://explorer.lichess.ovh/lichess");
    url.searchParams.set("fen", fen);
    url.searchParams.set("moves", "12");
    url.searchParams.set("topGames", "6");
    url.searchParams.set("recentGames", "0");
    if (ratings) url.searchParams.set("ratings", ratings);
    url.searchParams.set("speeds", "blitz,rapid,classical");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LICHESS_TIMEOUT_MS);
    const headers: Record<string, string> = {
      "User-Agent": "ChessFinderPro/0.1 (+https://chessfinderpro.local)",
      Accept: "application/json",
    };
    if (process.env.LICHESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.LICHESS_TOKEN}`;
    }
    const res = await fetch(url.toString(), { signal: ctrl.signal, headers });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(
        `[library] lichess explorer ${res.status} ${res.statusText} (ratings=${ratings || "any"})`,
      );
      return null;
    }
    return (await res.json()) as LichessExplorerResponse;
  } catch (err) {
    console.warn(`[library] lichess explorer error: ${(err as Error).message}`);
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Local library aggregation                                               */
/* ---------------------------------------------------------------------- */

/**
 * Resolve the tier filter for `aggregateLocalGames`. Accepts a single
 * library tier, an array of tiers, or undefined for "all tiers".
 */
function normalizeTierFilter(
  tier?: string | readonly string[],
): Set<string> | null {
  if (tier == null) return null;
  const arr = Array.isArray(tier) ? tier : [tier];
  const set = new Set(arr.filter((t) => t !== "local"));
  return set.size === 0 ? null : set;
}

/**
 * Aggregate move stats from our local LibraryGame collection for the
 * positions that reach `epd`. We walk each game forward from its start
 * until we hit `epd`, then record the next move played.
 */
async function aggregateLocalGames(
  fen: string,
  tier?: string | readonly string[],
): Promise<{
  totalGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  moves: ExplorerMove[];
  sampleGames: ExplorerSampleGame[];
  avgRating: number | null;
}> {
  const epd = fenToEpd(fen);
  // Cap candidates so very common positions (e.g. the starting square)
  // don't pin the event loop. The cap is large enough that aggregate
  // win/draw/loss rates are statistically meaningful.
  const games = await storage.listLibraryGamesByEpd(epd, 250);
  const tierFilter = normalizeTierFilter(tier);
  const filtered = tierFilter ? games.filter((g) => tierFilter.has(g.tier)) : games;

  type Counts = {
    san: string;
    uci: string;
    whiteWins: number;
    draws: number;
    blackWins: number;
    games: number;
    ratingSum: number;
    ratingN: number;
  };
  const byMove = new Map<string, Counts>();
  let whiteWins = 0;
  let draws = 0;
  let blackWins = 0;
  let ratingSum = 0;
  let ratingN = 0;
  const sampleGames: ExplorerSampleGame[] = [];

  for (const g of filtered) {
    const next = nextMoveAtEpd(g, epd);
    if (!next) continue;
    const key = next.uci;
    let c = byMove.get(key);
    if (!c) {
      c = {
        san: next.san,
        uci: next.uci,
        whiteWins: 0,
        draws: 0,
        blackWins: 0,
        games: 0,
        ratingSum: 0,
        ratingN: 0,
      };
      byMove.set(key, c);
    }
    c.games++;
    if (g.result === "1-0") c.whiteWins++;
    else if (g.result === "0-1") c.blackWins++;
    else if (g.result === "1/2-1/2") c.draws++;
    if (g.avgRating != null) {
      c.ratingSum += g.avgRating;
      c.ratingN++;
    }
    if (g.result === "1-0") whiteWins++;
    else if (g.result === "0-1") blackWins++;
    else if (g.result === "1/2-1/2") draws++;
    if (g.avgRating != null) {
      ratingSum += g.avgRating;
      ratingN++;
    }
    if (sampleGames.length < 6) {
      sampleGames.push({
        libraryGameId: g.id,
        white: g.whitePlayer ?? "?",
        black: g.blackPlayer ?? "?",
        whiteRating: g.whiteRating ?? undefined,
        blackRating: g.blackRating ?? undefined,
        result: g.result ?? "*",
        year: g.playedAt?.getFullYear(),
      });
    }
  }

  const total = whiteWins + draws + blackWins;
  const moves: ExplorerMove[] = Array.from(byMove.values())
    .map<ExplorerMove>((c) => ({
      san: c.san,
      uci: c.uci,
      whiteWins: c.whiteWins,
      draws: c.draws,
      blackWins: c.blackWins,
      games: c.games,
      rate: total > 0 ? c.games / total : 0,
      whiteScore: c.games > 0 ? (c.whiteWins + c.draws / 2) / c.games : 0,
      avgRating: c.ratingN > 0 ? Math.round(c.ratingSum / c.ratingN) : null,
    }))
    .sort((a, b) => b.games - a.games);

  return {
    totalGames: total,
    whiteWins,
    draws,
    blackWins,
    moves,
    sampleGames,
    avgRating: ratingN > 0 ? Math.round(ratingSum / ratingN) : null,
  };
}

/**
 * Find the move played from `epd` in the given library game.
 *
 * Fast path (modern games): O(1) lookup against the parallel
 * `firstSans` array we stored at ingest time. We also need the UCI
 * form for the move table — we recompute it on demand by replaying
 * just enough of the history to know the side-to-move and piece map,
 * but cap that at the first match in `epds`.
 *
 * Slow path (legacy games without `firstSans`): falls back to PGN
 * replay. Used only for storage migrated from earlier versions.
 */
function nextMoveAtEpd(
  game: LibraryGame,
  epd: string,
): { san: string; uci: string } | null {
  const idx = game.epds.indexOf(epd);
  // Last index of `epds` has no successor (it's the position at the
  // end of the indexed window), so skip it.
  if (idx >= 0 && idx < game.epds.length - 1 && game.firstSans?.[idx]) {
    const san = game.firstSans[idx];
    const uci = game.firstUcis?.[idx] ?? sanToUci(epd, san);
    return { san, uci };
  }
  // Fallback for legacy games — replay the PGN with chess.js.
  try {
    const c = new Chess();
    c.loadPgn(game.pgn, { strict: false });
    const history = c.history({ verbose: true });
    const replay = new Chess();
    if (fenToEpd(replay.fen()) === epd && history.length > 0) {
      return { san: history[0].san, uci: history[0].lan };
    }
    for (let i = 0; i < history.length - 1; i++) {
      replay.move(history[i]);
      if (fenToEpd(replay.fen()) === epd) {
        return { san: history[i + 1].san, uci: history[i + 1].lan };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve a SAN move to its UCI form by playing it from the EPD.
 * Cheap — one chess.js instance per call, no full PGN parse. Only
 * used as a fallback when `firstUcis` isn't available on a legacy row.
 */
function sanToUci(epd: string, san: string): string {
  try {
    const fen = `${epd} 0 1`;
    const c = new Chess(fen);
    const m = c.move(san);
    return m?.lan ?? san;
  } catch {
    return san;
  }
}

/* ---------------------------------------------------------------------- */
/* Main entry — explore(fen, tiers?)                                       */
/* ---------------------------------------------------------------------- */

/**
 * Return per-tier explorer stats for the given FEN. Heavy lifting goes
 * through the position-stats cache; fresh fetches are async and
 * persisted for re-use.
 */
export async function exploreLibrary(
  fen: string,
  tiers: readonly ExplorerTier[] = EXPLORER_TIERS,
): Promise<ExplorerResult[]> {
  const epd = fenToEpd(fen);
  const out: ExplorerResult[] = [];
  for (const tier of tiers) {
    out.push(await getTierStats(fen, epd, tier));
  }
  return out;
}

async function getTierStats(
  fen: string,
  epd: string,
  tier: ExplorerTier,
): Promise<ExplorerResult> {
  // "local" and "masters" both touch our local library — local always
  // by definition, masters as a fallback when Lichess is unreachable.
  // We compute these live every time so newly imported games show up
  // immediately and the cap on aggregation is always respected.
  if (tier === "local") {
    return fetchLocalTier(fen, epd);
  }
  if (tier === "masters") {
    return fetchMastersTier(fen, epd);
  }
  const cached = await storage.getLibraryPositionStats(epd, tier);
  const age = cached ? Date.now() - cached.refreshedAt.getTime() : Infinity;
  // Empty cached entries get a much shorter TTL (60 seconds) so a single
  // transient API failure doesn't poison the slot for a week.
  const ttl = cached && cached.totalGames === 0 ? 60_000 : CACHE_TTL_MS;
  if (cached && age < ttl) {
    return normalizeCached(cached, tier);
  }
  const result = await fetchLichessTier(fen, epd, tier);
  const upstreamSucceeded = result.totalGames > 0;
  if (!upstreamSucceeded) {
    // Lichess returned nothing for this tier — try the local library at
    // the same tier band. This is what gives the user useful data even
    // when Lichess is rate-limiting or unreachable, *and* it surfaces
    // the user's own imported games at the right rating bucket.
    const local = await aggregateLocalGames(
      fen,
      TIER_LOCAL_FALLBACKS[tier],
    );
    if (local.totalGames > 0) {
      return {
        tier,
        label: TIER_LABELS[tier],
        epd,
        totalGames: local.totalGames,
        whiteWins: local.whiteWins,
        draws: local.draws,
        blackWins: local.blackWins,
        avgRating: local.avgRating,
        moves: local.moves,
        sampleGames: local.sampleGames,
        cached: false,
        refreshedAt: new Date().toISOString(),
      };
    }
    return result;
  }
  // Only persist cache entries when upstream actually returned data.
  // Empty network responses are NOT cached.
  const insert: InsertLibraryPositionStats = {
    epd,
    tier,
    whiteWins: result.whiteWins,
    draws: result.draws,
    blackWins: result.blackWins,
    totalGames: result.totalGames,
    avgRating: result.avgRating,
    moves: result.moves.map((m) => ({
      san: m.san,
      uci: m.uci,
      whiteWins: m.whiteWins,
      draws: m.draws,
      blackWins: m.blackWins,
      games: m.games,
      avgRating: m.avgRating,
      evalCp: m.evalCp ?? null,
    })),
    sampleGames: result.sampleGames,
    refreshedAt: new Date(),
  };
  await storage.upsertLibraryPositionStats(insert);
  return result;
}

function normalizeCached(
  c: LibraryPositionStats,
  tier: ExplorerTier,
): ExplorerResult {
  const moves: ExplorerMove[] = (c.moves ?? []).map((m) => {
    const games = m.games || 0;
    return {
      san: m.san,
      uci: m.uci,
      whiteWins: m.whiteWins,
      draws: m.draws,
      blackWins: m.blackWins,
      games,
      rate: c.totalGames > 0 ? games / c.totalGames : 0,
      whiteScore: games > 0 ? (m.whiteWins + m.draws / 2) / games : 0,
      avgRating: m.avgRating,
      evalCp: m.evalCp ?? null,
    };
  });
  return {
    tier,
    label: TIER_LABELS[tier],
    epd: c.epd,
    totalGames: c.totalGames,
    whiteWins: c.whiteWins,
    draws: c.draws,
    blackWins: c.blackWins,
    avgRating: c.avgRating,
    moves,
    sampleGames: c.sampleGames ?? [],
    cached: true,
    refreshedAt: c.refreshedAt.toISOString(),
  };
}

async function fetchMastersTier(fen: string, epd: string): Promise<ExplorerResult> {
  // Always compute the local-masters slice as a fallback; if Lichess
  // gives us data, we use it. Otherwise we promote local masters games
  // into this tier so the Masters tab is never empty when the bundled
  // champion library has games reaching this position.
  const localMastersPromise = aggregateLocalGames(
    fen,
    TIER_LOCAL_FALLBACKS.masters,
  );
  const raw: MasterStats | null = await fetchMasters(fen);
  if (!raw) {
    const local = await localMastersPromise;
    return {
      tier: "masters",
      label: TIER_LABELS.masters,
      epd,
      totalGames: local.totalGames,
      whiteWins: local.whiteWins,
      draws: local.draws,
      blackWins: local.blackWins,
      avgRating: local.avgRating,
      moves: local.moves,
      sampleGames: local.sampleGames,
      cached: false,
      refreshedAt: new Date().toISOString(),
    };
  }
  const total = (raw.white ?? 0) + (raw.draws ?? 0) + (raw.black ?? 0);
  const moves: ExplorerMove[] = (raw.moves ?? []).map((m) => {
    const games = m.white + m.draws + m.black;
    return {
      san: m.san,
      uci: m.uci,
      whiteWins: m.white,
      draws: m.draws,
      blackWins: m.black,
      games,
      rate: total > 0 ? games / total : 0,
      whiteScore: games > 0 ? (m.white + m.draws / 2) / games : 0,
      avgRating: m.averageRating ?? null,
    };
  });
  // Bring local masters in as sample games even when Lichess delivered
  // stats — gives the user clickable game refs the public Masters DB
  // doesn't include.
  const local = await localMastersPromise;
  return {
    tier: "masters",
    label: TIER_LABELS.masters,
    epd,
    totalGames: total,
    whiteWins: raw.white ?? 0,
    draws: raw.draws ?? 0,
    blackWins: raw.black ?? 0,
    avgRating: raw.averageRating ?? null,
    moves,
    sampleGames: local.sampleGames.slice(0, 6),
    cached: false,
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchLichessTier(
  fen: string,
  epd: string,
  tier: ExplorerTier,
): Promise<ExplorerResult> {
  const ratings = TIER_RATINGS[tier];
  const raw = await fetchLichessExplorer(fen, ratings);
  if (!raw) return emptyResult(tier, epd);
  const total = (raw.white ?? 0) + (raw.draws ?? 0) + (raw.black ?? 0);
  const moves: ExplorerMove[] = (raw.moves ?? []).map((m) => {
    const games = m.white + m.draws + m.black;
    return {
      san: m.san,
      uci: m.uci,
      whiteWins: m.white,
      draws: m.draws,
      blackWins: m.black,
      games,
      rate: total > 0 ? games / total : 0,
      whiteScore: games > 0 ? (m.white + m.draws / 2) / games : 0,
      avgRating: m.averageRating ?? null,
    };
  });
  const sampleGames: ExplorerSampleGame[] =
    raw.topGames?.map((g) => ({
      lichessGameId: g.id,
      white: g.white.name,
      black: g.black.name,
      whiteRating: g.white.rating,
      blackRating: g.black.rating,
      result: g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2",
      year: g.year,
    })) ?? [];
  return {
    tier,
    label: TIER_LABELS[tier],
    epd,
    totalGames: total,
    whiteWins: raw.white ?? 0,
    draws: raw.draws ?? 0,
    blackWins: raw.black ?? 0,
    avgRating: raw.averageRating ?? null,
    moves,
    sampleGames,
    cached: false,
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchLocalTier(fen: string, epd: string): Promise<ExplorerResult> {
  const agg = await aggregateLocalGames(fen);
  return {
    tier: "local",
    label: TIER_LABELS.local,
    epd,
    totalGames: agg.totalGames,
    whiteWins: agg.whiteWins,
    draws: agg.draws,
    blackWins: agg.blackWins,
    avgRating: agg.avgRating,
    moves: agg.moves,
    sampleGames: agg.sampleGames,
    cached: false,
    refreshedAt: new Date().toISOString(),
  };
}

function emptyResult(tier: ExplorerTier, epd: string): ExplorerResult {
  return {
    tier,
    label: TIER_LABELS[tier],
    epd,
    totalGames: 0,
    whiteWins: 0,
    draws: 0,
    blackWins: 0,
    avgRating: null,
    moves: [],
    sampleGames: [],
    cached: false,
    refreshedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------------- */
/* Random library position picker — used by training generators            */
/* ---------------------------------------------------------------------- */

/**
 * Pick a random middlegame position (ply 12..40) from the library that
 * matches the desired tier band. Returns FEN, the side to move, and a
 * reference to the source game.
 */
export async function pickLibraryPosition(opts: {
  tier?: string;
  player?: string;
  minPly?: number;
  maxPly?: number;
}): Promise<
  | {
      fen: string;
      ply: number;
      side: "white" | "black";
      sourceGameId: number;
      pgn: string;
    }
  | null
> {
  const minPly = opts.minPly ?? 12;
  const maxPly = opts.maxPly ?? 40;
  const candidates = await storage.listLibraryGames({
    tier: opts.tier,
    player: opts.player,
    limit: 200,
  });
  if (candidates.length === 0) return null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const g = candidates[Math.floor(Math.random() * candidates.length)];
    try {
      const c = new Chess();
      c.loadPgn(g.pgn, { strict: false });
      const history = c.history({ verbose: true });
      const targetPly = Math.min(
        history.length - 2,
        minPly + Math.floor(Math.random() * Math.max(1, maxPly - minPly)),
      );
      if (targetPly < minPly) continue;
      const replay = new Chess();
      for (let i = 0; i < targetPly; i++) replay.move(history[i]);
      return {
        fen: replay.fen(),
        ply: targetPly,
        side: replay.turn() === "w" ? "white" : "black",
        sourceGameId: g.id,
        pgn: g.pgn,
      };
    } catch {
      /* skip malformed game */
    }
  }
  return null;
}
