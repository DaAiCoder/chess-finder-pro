/**
 * Line searcher.
 *
 * Given a `LineQuery`, walks the move tree starting from an opening and
 * surfaces continuations that satisfy the predicate (eval band, material
 * gain, motif present, …). Three sources of candidate moves at each ply:
 *
 *   1. **Lichess masters explorer** (https://explorer.lichess.ovh/masters)
 *      — when network access is available, ranks moves by master frequency.
 *      Cached aggressively in memory keyed by FEN.
 *   2. **Stockfish MultiPV** — `evaluateAllMoves` at the configured depth.
 *      Used as fallback or to override explorer results when the query
 *      asks for `replyMode: "forcing"` (theoretically best play).
 *   3. **User's imported games** — pulled from `motif_instances` /
 *      `listGames` when scope == "games"; we never search the engine tree
 *      in that branch.
 *
 * Tree shape:
 *   - At the side-to-move (`materialGain.side` or the query's `side`) we
 *     try up to `aiBranching` engine candidates (default 3).
 *   - At the opponent's move we either take the masters #1 (common) or
 *     the engine #1 (forcing).
 *   - Depth is bounded by `plyTarget` (in plies from the opening prefix).
 *
 * The walker emits a `DiscoveredLine` whenever the predicate fires at the
 * leaf and prunes any branch whose engine eval falls outside the band
 * with no plausible recovery (within ±150cp slack).
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import {
  detectMotifsForMove,
  materialBalance,
} from "./motifDetector.js";
import {
  findOpeningByFen,
  getOpening,
  listOpenings,
  resolveOpeningName,
} from "./openingsDictionary.js";
import { fetchMasters, getCachedMasters } from "./masters.js";
import type {
  DiscoveredLine,
  EvalBand,
  LineQuery,
  MaterialGain,
  MaterialPiece,
  OpeningEntry,
} from "../../shared/schema.js";

/** Engine depth used at the leaf for the published eval. */
const DEFAULT_DEPTH = 10;
/** Shallower depth for candidate selection — needs to be cheap. */
const CANDIDATE_DEPTH = 6;
/** Fan-out when it's the searching side's turn. */
const AI_BRANCHING = 2;
/** Hard upper bound on leaves to evaluate per query. */
const MAX_LEAVES = 18;
/**
 * Cap plyTarget so the tree stays tractable. With masters-first walks the
 * cost stays manageable up to ~24 plies (12 full moves); deeper than that
 * we usually run out of book and burn engine time per node.
 */
const PLY_TARGET_CAP = 24;
/** Per-engine-call timeout (ms). */
const ENGINE_TIMEOUT_MS = 2_500;
/** Whole-request budget — return whatever we've found by then. */
const REQUEST_BUDGET_MS = 20_000;

/** Cache per FEN so repeat positions in the tree don't re-evaluate. */
const candidateCache = new Map<string, string[]>();
const leafEvalCache = new Map<
  string,
  { evalCp: number | null; mateIn: number | null; depth: number }
>();

const PIECE_PAWN_VALUE: Record<MaterialPiece, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  minor: 3,
  rook: 5,
  major: 5,
  queen: 9,
};

/** Did `side` gain ≥ `piece` worth of material vs. the opening start? */
function satisfiesMaterialGain(
  initialBalance: number,
  finalBalance: number,
  gain: MaterialGain,
): boolean {
  const need = PIECE_PAWN_VALUE[gain.piece];
  const delta =
    gain.side === "white"
      ? finalBalance - initialBalance
      : initialBalance - finalBalance;
  return delta >= need - 0.5; // small tolerance for trades
}

/** Convert PerMoveEval cp → centipawns from white's POV (engine already is). */
function evalInBand(cp: number, band: EvalBand): boolean {
  return cp >= band.cpMin && cp <= band.cpMax;
}

/** Convert cp from white-POV to the requested side's POV. */
function cpFromSidePov(cp: number, side: "white" | "black"): number {
  return side === "white" ? cp : -cp;
}

interface SearchNode {
  fen: string;
  moves: string[]; // SAN list from the very start
  prefixPlies: number;
  motifs: Set<string>;
  materialDelta: number;
}

export interface LineSearchInput extends LineQuery {
  /** Maximum lines returned. Defaults to query.limit ?? 12. */
  maxResults?: number;
  /** Engine depth override. Defaults to DEFAULT_DEPTH. */
  depth?: number;
}

export async function searchLines(
  query: LineSearchInput,
): Promise<DiscoveredLine[]> {
  const target = await resolveTargetOpening(query);
  // No explicit opening — sweep across plausible openings instead.
  if (!target) return searchAnyOpening(query);

  const startChess = new Chess();
  for (const san of target.prefixSan) {
    try {
      startChess.move(san);
    } catch {
      return [];
    }
  }
  const startBalance = materialBalance(startChess);

  const depth = query.depth ?? DEFAULT_DEPTH;
  const plyTarget = Math.min(PLY_TARGET_CAP, query.plyTarget ?? 10);
  const replyMode = query.replyMode ?? "common";
  const searchSide: "white" | "black" =
    query.materialGain?.side ?? query.side ?? "white";
  const maxResults = query.maxResults ?? query.limit ?? 12;

  const ctx: SearchContext = {
    target,
    startBalance,
    depth,
    replyMode,
    searchSide,
    query,
    results: [],
    leavesEvaluated: 0,
    deadline: Date.now() + REQUEST_BUDGET_MS,
  };

  const root: SearchNode = {
    fen: startChess.fen(),
    moves: [...target.prefixSan],
    prefixPlies: target.prefixSan.length,
    motifs: new Set(),
    materialDelta: 0,
  };

  await dfs(root, plyTarget, maxResults, ctx);
  return ctx.results;
}

/**
 * Fallback when the caller didn't pin a specific opening — enumerate a
 * small set of common opening roots that fit the requested side and run
 * the regular `searchLines` against each. Results are merged and labelled
 * with `against: "<root opening>"`.
 *
 * Designed to be cheap (per-root timeout, max 6 roots) so an "any opening"
 * query still returns inside the 20 s budget.
 */
async function searchAnyOpening(
  query: LineSearchInput,
): Promise<DiscoveredLine[]> {
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  const wanted = query.side ?? query.materialGain?.side ?? "white";

  // Hand-picked, popular roots — enough variety to cover almost any user
  // intent without exploding the engine budget.
  const ROOTS_BLACK = [
    "sicilian-defense",
    "french-defense",
    "caro-kann",
    "queens-gambit-declined",
    "slav-defense",
    "kings-indian-defense",
  ];
  const ROOTS_WHITE = [
    "ruy-lopez",
    "italian-game",
    "queens-gambit",
    "london-system",
    "english-opening",
    "kings-indian-attack",
  ];

  const roots = wanted === "black" ? ROOTS_BLACK : ROOTS_WHITE;

  const all: DiscoveredLine[] = [];
  for (const id of roots) {
    if (Date.now() > deadline) break;
    if (all.length >= (query.limit ?? 12)) break;
    try {
      const sub = await searchLines({
        ...query,
        openingId: id,
        maxResults: 2,
        limit: 2,
        depth: 8,
      });
      for (const line of sub) {
        all.push({ ...line, against: `vs ${line.opening.name}` });
      }
    } catch (err) {
      console.warn(`[finder] sub-search failed for ${id}: ${(err as Error).message}`);
    }
  }
  return all;
}

interface SearchContext {
  target: OpeningEntry;
  startBalance: number;
  depth: number;
  replyMode: "forcing" | "common";
  searchSide: "white" | "black";
  query: LineQuery;
  results: DiscoveredLine[];
  leavesEvaluated: number;
  deadline: number;
}

/**
 * Depth-first walk. Stops as soon as we have `maxResults` matches OR we
 * exhaust the per-request leaf budget OR the request deadline passes.
 * DFS gives us fast first-result feedback instead of the BFS blow-up.
 */
async function dfs(
  node: SearchNode,
  plyTarget: number,
  maxResults: number,
  ctx: SearchContext,
): Promise<void> {
  if (ctx.results.length >= maxResults) return;
  if (ctx.leavesEvaluated >= MAX_LEAVES) return;
  if (Date.now() > ctx.deadline) return;

  const plies = node.moves.length - node.prefixPlies;
  if (plies >= plyTarget) {
    ctx.leavesEvaluated++;
    const line = await finalize(node, ctx.target, ctx.startBalance, ctx.depth, ctx.query);
    if (line && matchesPredicate(line, ctx.query, ctx.startBalance)) {
      ctx.results.push(line);
    }
    return;
  }

  const c = new Chess(node.fen);
  const turn = c.turn() === "w" ? "white" : "black";
  const role: "search" | "reply" = turn === ctx.searchSide ? "search" : "reply";
  const candidates = await pickCandidates(node.fen, role, ctx.depth, ctx.replyMode);
  if (candidates.length === 0) {
    ctx.leavesEvaluated++;
    const line = await finalize(node, ctx.target, ctx.startBalance, ctx.depth, ctx.query);
    if (line && matchesPredicate(line, ctx.query, ctx.startBalance)) {
      ctx.results.push(line);
    }
    return;
  }

  for (const san of candidates) {
    if (ctx.results.length >= maxResults) return;
    if (Date.now() > ctx.deadline) return;
    const next = new Chess(node.fen);
    let movePlayed;
    try {
      movePlayed = next.move(san);
    } catch {
      continue;
    }
    if (!movePlayed) continue;
    const newMotifs = detectMotifsForMove(c, next, {
      from: movePlayed.from,
      to: movePlayed.to,
      san: movePlayed.san,
      color: movePlayed.color,
    });
    const child: SearchNode = {
      fen: next.fen(),
      moves: [...node.moves, movePlayed.san],
      prefixPlies: node.prefixPlies,
      motifs: new Set([...node.motifs, ...newMotifs]),
      materialDelta: materialBalance(next) - ctx.startBalance,
    };
    await dfs(child, plyTarget, maxResults, ctx);
  }
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

async function resolveTargetOpening(
  query: LineQuery,
): Promise<OpeningEntry | undefined> {
  if (query.openingId) return getOpening(query.openingId);
  if (query.openingHint) {
    const e = await resolveOpeningName(query.openingHint);
    if (e) return e;
  }
  if (query.raw) {
    const e = await resolveOpeningName(query.raw);
    if (e) return e;
  }
  return undefined;
}

async function pickCandidates(
  fen: string,
  role: "search" | "reply",
  _depth: number,
  replyMode: "forcing" | "common",
): Promise<string[]> {
  const cacheKey = `${role}:${replyMode}:${fen}`;
  const cached = candidateCache.get(cacheKey);
  if (cached) return cached;

  // 1. Try the Lichess masters explorer for both roles.
  //    - Replies in "common" mode take the top-1 (what masters play).
  //    - Replies in "forcing" mode skip masters and use the engine.
  //    - Our side ("search") takes the top-N most-played masters moves;
  //      this is faster than calling Stockfish at every internal node and
  //      keeps us on theoretical paths.
  if (!(role === "reply" && replyMode === "forcing")) {
    const stats = await fetchMasters(fen);
    if (stats && stats.moves.length > 0) {
      const take = role === "search" ? AI_BRANCHING : 1;
      const out = stats.moves.slice(0, Math.max(take, 1)).map((m) => m.san);
      candidateCache.set(cacheKey, out);
      return out;
    }
  }

  // 2. Out of book → fall back to the engine at a shallow depth.
  try {
    const { lines } = await stockfish.evaluateAllMoves(
      fen,
      CANDIDATE_DEPTH,
      ENGINE_TIMEOUT_MS,
    );
    const c = new Chess(fen);
    const sanList: string[] = [];
    const sorted = [...lines].sort((a, b) => {
      const sign = c.turn() === "w" ? 1 : -1;
      return (b.cp - a.cp) * sign;
    });
    const take = role === "search" ? AI_BRANCHING : 1;
    for (const ln of sorted.slice(0, Math.max(take, 1))) {
      const probe = new Chess(fen);
      const from = ln.uci.slice(0, 2);
      const to = ln.uci.slice(2, 4);
      const promo = ln.uci.length > 4 ? ln.uci.slice(4, 5) : undefined;
      try {
        const m = probe.move({ from, to, promotion: promo });
        if (m) sanList.push(m.san);
      } catch {
        /* skip */
      }
    }
    candidateCache.set(cacheKey, sanList);
    return sanList;
  } catch {
    return [];
  }
}

async function finalize(
  node: SearchNode,
  opening: OpeningEntry,
  startBalance: number,
  depth: number,
  query: LineQuery,
): Promise<DiscoveredLine | null> {
  // Final engine eval at the leaf — cached so identical positions don't re-eval.
  let evalCp: number | null = null;
  let mateIn: number | null = null;
  let usedDepth = depth;
  const cached = leafEvalCache.get(node.fen);
  if (cached) {
    evalCp = cached.evalCp;
    mateIn = cached.mateIn;
    usedDepth = cached.depth;
  } else {
    try {
      const r = await stockfish.evaluate(node.fen, depth, ENGINE_TIMEOUT_MS);
      evalCp = r.evaluation;
      mateIn = r.mateIn;
      usedDepth = r.depth;
      leafEvalCache.set(node.fen, { evalCp, mateIn, depth: usedDepth });
    } catch {
      /* leave as null */
    }
  }
  // Stats from Lichess masters at the leaf (if cached).
  const stats = getCachedMasters(node.fen);

  return {
    id: `${opening.id}:${node.moves.slice(node.prefixPlies).join("-") || "root"}`,
    opening: { id: opening.id, name: opening.name, eco: opening.eco },
    moves: node.moves,
    prefixPlies: node.prefixPlies,
    leafFen: node.fen,
    evalCp,
    mateIn,
    depth: usedDepth,
    motifs: Array.from(node.motifs),
    stats: stats
      ? {
          games: stats.white + stats.draws + stats.black,
          white: stats.white,
          draws: stats.draws,
          black: stats.black,
          avgElo: stats.averageRating,
        }
      : undefined,
    materialDelta: node.materialDelta,
  };
}

function matchesPredicate(
  line: DiscoveredLine,
  query: LineQuery,
  startBalance: number,
): boolean {
  if (query.evalBand && line.evalCp != null) {
    const side = query.side ?? query.materialGain?.side ?? "white";
    const cp = cpFromSidePov(line.evalCp, side);
    if (!evalInBand(cp, query.evalBand)) return false;
  }
  if (query.materialGain) {
    const finalBalance = startBalance + line.materialDelta;
    if (!satisfiesMaterialGain(startBalance, finalBalance, query.materialGain)) return false;
  }
  if (query.motifs && query.motifs.length > 0) {
    if (!query.motifs.some((k) => line.motifs.includes(k))) return false;
  }
  return true;
}

/** Tag an arbitrary FEN with its opening name, if any. */
export async function detectOpeningAtFen(fen: string): Promise<OpeningEntry | undefined> {
  return findOpeningByFen(fen);
}

/** Sanity check during boot. */
export async function _selfTest() {
  const all = await listOpenings();
  if (all.length === 0) throw new Error("openings dictionary is empty");
}
