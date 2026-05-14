/**
 * Setup searcher.
 *
 * For "play this setup vs anything" queries (Hedgehog, London, KIA, …).
 *
 * Algorithm:
 *   1. Enumerate the top opponent first moves (e4, d4, c4, Nf3, …).
 *   2. For each, walk the masters tree forward. At our turn we pick the
 *      move that maximises progress toward the setup's `targets`; at the
 *      opponent's turn we pick the masters top-1 (or top-2 if branching).
 *   3. When the position satisfies `minMatchCount` of the targets, stop
 *      and run the engine for the eval. Filter by the query's predicate.
 *   4. Emit one `DiscoveredLine` per opponent first move (deduped on FEN).
 *
 * Masters API is used everywhere — we only fall back to chess.js legal
 * moves when out of book, then pick whichever legal move makes the most
 * progress toward the target structure. This keeps the search fast.
 */

import { Chess, type Square } from "chess.js";
import { stockfish } from "./stockfish.js";
import { fetchMasters, getCachedMasters } from "./masters.js";
import { detectMotifsForMove, materialBalance } from "./motifDetector.js";
import type {
  DiscoveredLine,
  EvalBand,
  LineQuery,
  MaterialGain,
  MaterialPiece,
  SetupTemplate,
} from "../../shared/schema.js";

const LEAF_DEPTH = 10;
const ENGINE_TIMEOUT_MS = 2_500;
const PER_BRANCH_PLY_CAP = 24; // 12 full moves of walking before giving up
const PER_BRANCH_BUDGET_MS = 6_000;
const TOTAL_BUDGET_MS = 22_000;

/* ---------------------------------------------------------------------- */
/* First moves to test, by setup `side`                                    */
/* ---------------------------------------------------------------------- */

const OPPONENT_FIRST_MOVES: Record<"white" | "black", string[]> = {
  // Setup played by black → enumerate white's first moves.
  black: ["e4", "d4", "c4", "Nf3", "g3", "b3"],
  // Setup played by white → no opponent first move (white moves first).
  white: ["__first__"],
};

/* ---------------------------------------------------------------------- */
/* Public API                                                              */
/* ---------------------------------------------------------------------- */

export interface SetupSearchInput extends LineQuery {
  /** Set explicitly so the caller can override per-call. */
  setupId: string;
}

export async function searchSetup(
  setup: SetupTemplate,
  query: LineQuery,
): Promise<DiscoveredLine[]> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const results: DiscoveredLine[] = [];
  const seenFens = new Set<string>();

  const firsts = OPPONENT_FIRST_MOVES[setup.side];

  for (const first of firsts) {
    if (Date.now() > deadline) break;
    if (results.length >= (query.limit ?? 8)) break;

    const c = new Chess();
    let moves: string[] = [];
    let against: string;

    if (setup.side === "black") {
      // White moves first; we control black's reply tree.
      try {
        const m = c.move(first);
        if (!m) continue;
        moves = [first];
        against = `vs 1.${first}`;
      } catch {
        continue;
      }
    } else {
      // White-side setup — we're the side to move from move 1.
      against = "from start";
    }

    const branchDeadline = Math.min(deadline, Date.now() + PER_BRANCH_BUDGET_MS);
    const line = await walkBranch(c, moves, setup, query, against, branchDeadline);
    if (!line) continue;
    if (seenFens.has(line.leafFen)) continue;
    seenFens.add(line.leafFen);
    // Drop branches that ended in disaster — when the walker loses
    // material due to a move-order trap (e.g. Hedgehog vs 1.c4 e6 2.g3
    // b6?? 3.Bg2 winning a8), we'd rather show fewer good lines than
    // include misleading "Hedgehog vs 1.c4 with eval +7" rows.
    if (line.evalCp != null) {
      const sidePov = setup.side === "white" ? line.evalCp : -line.evalCp;
      if (sidePov < -300) continue;
    }
    if (!matchesPredicate(line, query)) continue;
    results.push(line);
  }

  return results;
}

/* ---------------------------------------------------------------------- */
/* Branch walker                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Walk forward from `c` (with `moves` recorded so far) toward the setup
 * structure. Stops when the structure is hit, the branch deadline passes,
 * or we exceed PER_BRANCH_PLY_CAP plies of new search.
 */
async function walkBranch(
  c: Chess,
  moves: string[],
  setup: SetupTemplate,
  query: LineQuery,
  against: string,
  deadline: number,
): Promise<DiscoveredLine | null> {
  const startPly = moves.length;
  const motifsSeen = new Set<string>();
  const startBalance = materialBalance(c);
  const minMatch = setup.minMatchCount ?? setup.targets.length;
  const samplePtr = { idx: startPly }; // tracks how far into sampleSan we've consumed
  const ourColor: "w" | "b" = setup.side === "white" ? "w" : "b";

  while (
    moves.length - startPly < PER_BRANCH_PLY_CAP &&
    Date.now() < deadline
  ) {
    // Are we at our turn or the opponent's?
    const turn = c.turn();
    let san: string | null;

    if (turn === ourColor) {
      san = await chooseOurMove(c, setup, samplePtr);
    } else {
      san = await chooseOpponentMove(c);
    }
    if (!san) break;

    const before = new Chess(c.fen());
    let move;
    try {
      move = c.move(san);
    } catch {
      break;
    }
    if (!move) break;
    moves.push(move.san);

    // Pick up motifs along the way.
    for (const k of detectMotifsForMove(before, c, {
      from: move.from as Square,
      to: move.to as Square,
      san: move.san,
      color: move.color,
    })) {
      motifsSeen.add(k);
    }

    // After OUR move, check whether the structure is achieved.
    if (turn === ourColor && satisfiesSetup(c, setup, minMatch, ourColor)) {
      const leaf = await finalize(setup, c, moves, against, motifsSeen, startBalance);
      return leaf;
    }
  }

  // Ran out of plies — still produce a row if we got close (≥ half-match).
  if (countMatches(c, setup, ourColor) >= Math.max(2, Math.floor(minMatch / 2))) {
    return finalize(setup, c, moves, against, motifsSeen, startBalance);
  }
  return null;
}

/* ---------------------------------------------------------------------- */
/* Move pickers                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Pick our move. Strategy:
 *   - Build a candidate pool: top-5 masters moves + canonical sample moves
 *     that are legal here + every legal move as a final fallback.
 *   - Score each candidate by `(setupTargets gained) * 10` plus tiebreakers
 *     for theory popularity, sample-order presence, and development; minus
 *     a penalty for material-losing moves.
 *   - Return the highest scorer.
 *
 * This lets the walker stay on theory when masters agrees with the setup
 * (e.g. Hedgehog → Sicilian Kan vs 1.e4) but veer off-book when masters'
 * #1 move steers AWAY from the target structure (1.e4 Nf6 Alekhine —
 * doesn't reach Hedgehog, so c5 wins on setup-progress instead).
 */
async function chooseOurMove(
  c: Chess,
  setup: SetupTemplate,
  _samplePtr: { idx: number },
): Promise<string | null> {
  const ourColor: "w" | "b" = setup.side === "white" ? "w" : "b";
  const sampleSet = new Set(setup.sampleSan);

  // 1. Build candidate SAN list: masters top-5 + sample moves + legal fallback.
  const masters = await fetchMasters(c.fen());
  const candidateSan = new Set<string>();
  if (masters) {
    for (const m of masters.moves.slice(0, 5)) candidateSan.add(m.san);
  }
  // Legal sample-order moves.
  for (const san of setup.sampleSan) {
    const probe = new Chess(c.fen());
    try {
      if (probe.move(san)) candidateSan.add(san);
    } catch {
      /* not legal here */
    }
  }
  // If neither masters nor sample gave us anything, allow ALL legal moves.
  if (candidateSan.size === 0) {
    for (const m of c.moves()) candidateSan.add(m);
  }

  // Index masters frequency for theory tiebreak.
  const mastersFreq = new Map<string, number>();
  if (masters) {
    const total = masters.moves.reduce(
      (n, m) => n + m.white + m.draws + m.black,
      0,
    );
    for (const m of masters.moves) {
      const games = m.white + m.draws + m.black;
      if (total > 0) mastersFreq.set(m.san, games / total);
    }
  }

  // 2. Score each candidate. Masters frequency dominates so the walker
  //    stays on theoretical paths; setup-progress acts as a tiebreaker
  //    among the most-played moves. A hanging-piece check on the
  //    *position after our move* keeps obvious blunders out.
  const beforeWeighted = weightedMatches(c, setup, ourColor);
  let bestSan: string | null = null;
  let bestScore = -Infinity;
  for (const san of candidateSan) {
    const probe = new Chess(c.fen());
    let move;
    try {
      move = probe.move(san);
    } catch {
      continue;
    }
    if (!move) continue;
    const hangingPenalty = worstHangingThreat(probe);
    const after = weightedMatches(probe, setup, ourColor);
    const attacked = countAttackedByPawn(probe, setup, ourColor);

    // Masters popularity FIRST — keeps us on book through unusual move
    // orders (e.g. 1.c4 e6 2.g3 Nf6 instead of 2…b6 which loses to Bxa8).
    let score = (mastersFreq.get(san) ?? 0) * 30;
    score += Math.min(6, (after - beforeWeighted) * 2);
    if (sampleSet.has(san)) score += 1;
    if (san === "O-O" || san === "O-O-O") score += 0.5;
    score -= attacked * 4;
    score -= hangingPenalty * 30;
    if (score > bestScore) {
      bestScore = score;
      bestSan = san;
    }
  }
  return bestSan;
}

/** Opponent picks Lichess masters top-1, or the engine's best as fallback. */
async function chooseOpponentMove(c: Chess): Promise<string | null> {
  const stats = await fetchMasters(c.fen());
  if (stats && stats.moves.length > 0) return stats.moves[0].san;
  // Fallback — quick engine call to grab a strong reply.
  try {
    const r = await stockfish.evaluate(c.fen(), 8, ENGINE_TIMEOUT_MS);
    if (r.bestMove) {
      const probe = new Chess(c.fen());
      const from = r.bestMove.slice(0, 2);
      const to = r.bestMove.slice(2, 4);
      const promo = r.bestMove.length > 4 ? r.bestMove.slice(4, 5) : undefined;
      const m = probe.move({ from, to, promotion: promo });
      if (m) return m.san;
    }
  } catch {
    /* ignore */
  }
  // Last resort — pick any legal move so the walk doesn't stall.
  const legal = c.moves();
  return legal.length > 0 ? legal[0] : null;
}

/* ---------------------------------------------------------------------- */
/* Setup matching                                                          */
/* ---------------------------------------------------------------------- */

function countMatches(
  c: Chess,
  setup: SetupTemplate,
  color: "w" | "b",
): number {
  let hits = 0;
  for (const t of setup.targets) {
    const found = t.squares.some((sq) => {
      const p = c.get(sq as Square);
      return p?.color === color && p.type === t.piece;
    });
    if (found) hits++;
  }
  return hits;
}

/**
 * Like `countMatches` but pawn targets are weighted heavier than piece
 * targets. Rationale: pawn structure is stable once placed; a knight on
 * f6 is fragile until the supporting pawn skeleton is built.
 *
 * Weighting pawn=3, piece=1 makes the walker lay down …c5/…e6/…b6/…d6
 * before fianchettoing and developing — the correct move order for
 * Hedgehog-style setups regardless of white's first move.
 */
function weightedMatches(
  c: Chess,
  setup: SetupTemplate,
  color: "w" | "b",
): number {
  let score = 0;
  for (const t of setup.targets) {
    const found = t.squares.some((sq) => {
      const p = c.get(sq as Square);
      return p?.color === color && p.type === t.piece;
    });
    if (!found) continue;
    score += t.piece === "p" ? 3 : 1;
  }
  return score;
}

/**
 * Count target pieces that sit on a square attacked by an enemy pawn —
 * i.e. structurally unstable and likely to be lost or forced to move.
 * Used to penalise candidate moves that look good on the surface but
 * will be refuted by an opponent push.
 */
function countAttackedByPawn(
  c: Chess,
  setup: SetupTemplate,
  color: "w" | "b",
): number {
  let bad = 0;
  for (const t of setup.targets) {
    if (t.piece === "p") continue; // pawn on a pawn target — fine
    for (const sq of t.squares) {
      const p = c.get(sq as Square);
      if (!p || p.color !== color || p.type !== t.piece) continue;
      if (squareAttackedByPawn(c, sq, color)) bad++;
    }
  }
  return bad;
}

/**
 * Quick "hanging piece" sniffer.
 *
 * Looks at every legal opponent move that's a capture. For each, if the
 * captured piece is worth more than the capturer (or the target square
 * has no defender), returns that net material gain in pawns.
 *
 * Returns 0 when no obvious free capture exists. Cheap — no recursion,
 * uses chess.js' legal-move generator.
 */
function worstHangingThreat(c: Chess): number {
  const VALUES: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
  };
  let worst = 0;
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured) continue;
    const capturedValue = VALUES[m.captured] ?? 0;
    const capturerValue = VALUES[m.piece] ?? 0;
    // Best case for opponent if we cannot recapture.
    const lossUndefended = capturedValue;
    // Best case for opponent if we recapture (simple 1-ply SEE).
    const lossDefended = capturedValue - capturerValue;
    // Cheap pruning: even the defended case is bad → bail to the SEE step.
    if (Math.max(lossUndefended, lossDefended) <= worst) continue;
    const probe = new Chess(c.fen());
    try {
      probe.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      continue;
    }
    // After opponent moves it's our turn; legal moves to m.to are our
    // recaptures. No legal recapture → opponent keeps the full piece.
    const recaptures = probe
      .moves({ verbose: true })
      .filter((d) => d.to === m.to);
    const net = recaptures.length === 0 ? lossUndefended : lossDefended;
    if (net > worst) worst = net;
  }
  return worst;
}

/** True iff `square` is attacked by an opposing pawn. */
function squareAttackedByPawn(c: Chess, square: string, defenderColor: "w" | "b"): boolean {
  const file = square.charCodeAt(0); // 'a' = 97
  const rank = parseInt(square[1], 10);
  // Attacking pawn for defender=w sits one rank above (rank+1) on adjacent files;
  // for defender=b sits one rank below (rank-1).
  const attackRank = defenderColor === "w" ? rank + 1 : rank - 1;
  if (attackRank < 1 || attackRank > 8) return false;
  for (const dx of [-1, 1]) {
    const f = file + dx;
    if (f < 97 || f > 104) continue;
    const sq = `${String.fromCharCode(f)}${attackRank}` as Square;
    const p = c.get(sq);
    if (p && p.type === "p" && p.color !== defenderColor) return true;
  }
  return false;
}

function satisfiesSetup(
  c: Chess,
  setup: SetupTemplate,
  minMatch: number,
  color: "w" | "b",
): boolean {
  return countMatches(c, setup, color) >= minMatch;
}

/* ---------------------------------------------------------------------- */
/* Leaf evaluation                                                         */
/* ---------------------------------------------------------------------- */

async function finalize(
  setup: SetupTemplate,
  c: Chess,
  moves: string[],
  against: string,
  motifsSeen: Set<string>,
  startBalance: number,
): Promise<DiscoveredLine> {
  let evalCp: number | null = null;
  let mateIn: number | null = null;
  let depth = LEAF_DEPTH;
  try {
    const r = await stockfish.evaluate(c.fen(), LEAF_DEPTH, ENGINE_TIMEOUT_MS);
    evalCp = r.evaluation;
    mateIn = r.mateIn;
    depth = r.depth;
  } catch {
    /* leave null */
  }
  const stats = getCachedMasters(c.fen());
  return {
    id: `${setup.id}:${against}:${moves.length}`,
    opening: { id: setup.id, name: setup.name },
    moves,
    // For setup walks we treat the opponent's first move(s) as the prefix.
    prefixPlies: setup.side === "black" ? 1 : 0,
    leafFen: c.fen(),
    evalCp,
    mateIn,
    depth,
    motifs: Array.from(motifsSeen),
    stats: stats
      ? {
          games: stats.white + stats.draws + stats.black,
          white: stats.white,
          draws: stats.draws,
          black: stats.black,
          avgElo: stats.averageRating,
        }
      : undefined,
    materialDelta: materialBalance(c) - startBalance,
    against,
    setup: { id: setup.id, name: setup.name },
  };
}

/* ---------------------------------------------------------------------- */
/* Predicate matching (same shape as lineSearcher.matchesPredicate)        */
/* ---------------------------------------------------------------------- */

function matchesPredicate(line: DiscoveredLine, query: LineQuery): boolean {
  if (query.evalBand && line.evalCp != null) {
    const side = query.side ?? query.materialGain?.side ?? "white";
    const cp = side === "white" ? line.evalCp : -line.evalCp;
    if (!evalInBand(cp, query.evalBand)) return false;
  }
  if (query.materialGain) {
    if (!satisfiesMaterialGain(0, line.materialDelta, query.materialGain)) return false;
  }
  if (query.motifs?.length) {
    if (!query.motifs.some((k) => line.motifs.includes(k))) return false;
  }
  return true;
}

function evalInBand(cp: number, band: EvalBand): boolean {
  return cp >= band.cpMin && cp <= band.cpMax;
}

const PIECE_PAWN_VALUE: Record<MaterialPiece, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  minor: 3,
  rook: 5,
  major: 5,
  queen: 9,
};

function satisfiesMaterialGain(
  startBalance: number,
  endBalanceDelta: number,
  gain: MaterialGain,
): boolean {
  const need = PIECE_PAWN_VALUE[gain.piece];
  // endBalanceDelta is positive when white gained material.
  const delta = gain.side === "white" ? endBalanceDelta : -endBalanceDelta;
  return delta >= need - 0.5;
}

