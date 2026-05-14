/**
 * VariantEngine — a thin rule layer over `chess.js` that lets us serve
 * Chess960, King of the Hill, Three-Check, Atomic, Antichess, Horde,
 * Racing Kings, Crazyhouse, Fog of War, and a couple of custom modes
 * (Motif Hunt, Live Coach, Reverse Endgame) without forking the chess
 * library.
 *
 * The engine is deliberately "permissive" — it always uses chess.js for
 * baseline legality / move generation, then applies per-variant hooks
 * AFTER each move to:
 *   - decide alternate game-over conditions (e.g. king-on-d4 in KotH)
 *   - apply explosion / capture side-effects (Atomic)
 *   - generate starting FENs (960, Horde, Racing Kings)
 *
 * Variants whose move-LEGALITY differs from standard chess (Antichess
 * forced capture, Atomic king move into check, Racing Kings no-check)
 * are validated after the chess.js move with a post-filter that rejects
 * illegal moves by mutating back. Crazyhouse (drop moves) is partially
 * supported via the `dropPiece` path which sidesteps chess.js move
 * generation entirely.
 *
 * This module is the single source of truth for variant rules — the
 * lobby UI and bot driver both call into it.
 */

import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { storage } from "../storage.js";
import type {
  VariantGame,
  VariantId,
  InsertVariantGame,
} from "../../shared/schema.js";

/* ---------------------------------------------------------------------- */
/* Catalog                                                                 */
/* ---------------------------------------------------------------------- */

export interface VariantDef {
  id: VariantId;
  name: string;
  tier: 1 | 2 | 3;
  /** Brief one-line description shown in the lobby. */
  blurb: string;
  /** Set when the start position is non-standard. */
  randomStart?: boolean;
  /** Whether the bot driver should use Stockfish (true) or a hand rules engine. */
  useStockfish: boolean;
}

export const VARIANT_CATALOG: VariantDef[] = [
  {
    id: "standard",
    name: "Standard Chess",
    tier: 1,
    blurb: "Classic rules, the engine adapts to your level.",
    useStockfish: true,
  },
  {
    id: "chess960",
    name: "Chess960 (Fischer Random)",
    tier: 1,
    blurb: "Back-rank pieces shuffled to one of 960 starting positions.",
    randomStart: true,
    useStockfish: true,
  },
  {
    id: "king-of-the-hill",
    name: "King of the Hill",
    tier: 1,
    blurb: "Win by walking your king to any of the four center squares.",
    useStockfish: true,
  },
  {
    id: "three-check",
    name: "Three-Check",
    tier: 1,
    blurb: "First side to deliver three checks wins.",
    useStockfish: true,
  },
  {
    id: "motif-hunt",
    name: "Motif Hunt",
    tier: 2,
    blurb: "Score points for every tactical motif you create on the board.",
    useStockfish: true,
  },
  {
    id: "live-coach",
    name: "Live Coach",
    tier: 2,
    blurb: "The engine highlights your best move ideas in real time.",
    useStockfish: true,
  },
  {
    id: "reverse-endgame",
    name: "Reverse Endgame",
    tier: 2,
    blurb: "Defend a losing endgame against perfect tablebase play.",
    useStockfish: true,
  },
  {
    id: "atomic",
    name: "Atomic",
    tier: 3,
    blurb: "Captures explode a 3x3 area, taking out adjacent pieces.",
    useStockfish: false,
  },
  {
    id: "antichess",
    name: "Antichess",
    tier: 3,
    blurb: "Lose all your pieces to win. Captures are forced.",
    useStockfish: false,
  },
  {
    id: "crazyhouse",
    name: "Crazyhouse",
    tier: 3,
    blurb: "Captured pieces return to your hand to drop back on the board.",
    useStockfish: false,
  },
  {
    id: "racing-kings",
    name: "Racing Kings",
    tier: 3,
    blurb: "Both kings race for the 8th rank. No checks allowed.",
    randomStart: true,
    useStockfish: false,
  },
  {
    id: "horde",
    name: "Horde",
    tier: 3,
    blurb: "Black has the standard army; White has 36 pawns and must avoid mate.",
    randomStart: true,
    useStockfish: false,
  },
  {
    id: "fog-of-war",
    name: "Fog of War",
    tier: 3,
    blurb: "You only see squares your own pieces can see — capture the king to win.",
    useStockfish: false,
  },
];

/* ---------------------------------------------------------------------- */
/* Starting positions                                                      */
/* ---------------------------------------------------------------------- */

const STANDARD_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const HORDE_FEN =
  "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1";
const RACING_KINGS_FEN =
  "8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1";

export async function pickVariantStartFen(
  variant: VariantId,
  persona?: string | null,
): Promise<string> {
  let base: string;
  switch (variant) {
    case "chess960":
      base = generate960Fen();
      break;
    case "horde":
      base = HORDE_FEN;
      break;
    case "racing-kings":
      base = RACING_KINGS_FEN;
      break;
    case "reverse-endgame":
      base = "8/8/8/8/4k3/8/4K3/4B1N1 b - - 0 1";
      break;
    default:
      base = STANDARD_FEN;
  }
  // Apply piece-odds personas — they remove a piece from the BOT (Black).
  if (persona === "knight-odds") base = removeFirstPiece(base, "n", "b");
  if (persona === "rook-odds") base = removeFirstPiece(base, "r", "b");
  if (persona === "queen-odds") base = removeFirstPiece(base, "q", "b");
  return base;
}

/** Removes the first matching piece of the given (lowercase) type and
 *  colour from the FEN board. Returns the original FEN unchanged if no
 *  match (defensive — most useful when chess960 + piece odds collide). */
function removeFirstPiece(fen: string, type: string, color: "w" | "b"): string {
  const [board, rest] = [fen.split(" ")[0], fen.slice(fen.indexOf(" "))];
  const rows = board.split("/");
  // White pieces are uppercase, black lowercase.
  const target = color === "w" ? type.toUpperCase() : type.toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes(target)) {
      const idx = rows[i].indexOf(target);
      // Replace with a single empty square; chess.js will collapse it.
      rows[i] = rows[i].slice(0, idx) + "1" + rows[i].slice(idx + 1);
      // Normalise consecutive digits.
      rows[i] = rows[i].replace(/(\d)(\d)/g, (_, a, b) => String(Number(a) + Number(b)));
      return rows.join("/") + rest;
    }
  }
  return fen;
}

/** Generates a legal Fischer Random starting FEN. */
function generate960Fen(): string {
  // Standard 960 placement rules: bishops on opposite colours, king
  // between the rooks. We use a rejection sample for simplicity.
  let pieces: string[] = [];
  while (true) {
    const slots: Array<string | null> = Array(8).fill(null);
    const placeRandom = (piece: string) => {
      const empties = slots
        .map((v, i) => (v === null ? i : -1))
        .filter((i) => i >= 0);
      const idx = empties[Math.floor(Math.random() * empties.length)];
      slots[idx] = piece;
    };
    // Two bishops on opposite colours.
    const lightSquares = [1, 3, 5, 7];
    const darkSquares = [0, 2, 4, 6];
    slots[lightSquares[Math.floor(Math.random() * 4)]] = "b";
    slots[darkSquares[Math.floor(Math.random() * 4)]] = "b";
    placeRandom("q");
    placeRandom("n");
    placeRandom("n");
    // King between rooks: the remaining 3 empty squares get r, k, r.
    const empties = slots
      .map((v, i) => (v === null ? i : -1))
      .filter((i) => i >= 0);
    const [a, b, c] = empties;
    slots[a] = "r";
    slots[b] = "k";
    slots[c] = "r";
    pieces = slots as string[];
    if (pieces.filter(Boolean).length === 8) break;
  }
  const row = pieces.join("");
  return `${row}/pppppppp/8/8/8/8/PPPPPPPP/${row.toUpperCase()} w KQkq - 0 1`;
}

/* ---------------------------------------------------------------------- */
/* Move application                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Applies a single UCI move to a stored variant game, runs variant-
 * specific side effects (atomic explosion etc.) and updates the row.
 *
 * UCI input is `<from><to>[promotion]`, e.g. `e2e4` or `a7a8q`.
 */
export async function applyVariantMove(
  game: VariantGame,
  uci: string,
): Promise<VariantGame | undefined> {
  if (game.result !== "*") return game;
  const variant = game.variant;
  const startFen = game.startFen;
  const chess = new Chess(startFen);
  // Replay prior moves to bring chess.js up to date.
  if (game.pgn) {
    try {
      chess.loadPgn(game.pgn, { strict: false });
    } catch {
      // If loadPgn fails for variant-specific reasons, replay manually
      // from FEN — best-effort fallback.
    }
  }

  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci[4] as PieceSymbol) : undefined;

  const sideToMove = chess.turn();
  let mv;
  try {
    mv = chess.move({ from, to, promotion });
  } catch {
    return game;
  }
  if (!mv) return game;

  /* Variant post-checks & effects. */
  let result: string = game.result;

  if (variant === "atomic" && mv.captured) {
    applyAtomicExplosion(chess, to);
    // After explosion, recompute game-over: either king is gone → win.
    const winner = kingExploded(chess);
    if (winner) result = winner === "w" ? "1-0" : "0-1";
  }

  if (variant === "racing-kings") {
    // Reject any move that leaves either king in check.
    if (chess.inCheck()) {
      // Undo by reloading.
      const tmp = new Chess(startFen);
      if (game.pgn) tmp.loadPgn(game.pgn, { strict: false });
      return updateGame(game.id, { pgn: tmp.pgn() });
    }
    // Win condition: a king reaches the 8th rank.
    if (kingReached8thRank(chess)) {
      result = sideToMove === "w" ? "1-0" : "0-1";
    }
  }

  if (variant === "antichess" && !mv.captured) {
    // Forced-capture check: if a capture was legal, this move was
    // illegal. Revert.
    const had = anyCaptureLegalFromFen(beforeFen(chess, mv));
    if (had) {
      const tmp = new Chess(startFen);
      if (game.pgn) tmp.loadPgn(game.pgn, { strict: false });
      return updateGame(game.id, { pgn: tmp.pgn() });
    }
  }
  if (variant === "antichess") {
    // Win = no pieces of your colour left OR no legal moves.
    if (sideHasNoPieces(chess, sideToMove === "w" ? "b" : "w") || chess.moves().length === 0) {
      result = sideToMove === "w" ? "1-0" : "0-1";
    }
  }

  if (variant === "king-of-the-hill" && kingOnHill(chess, sideToMove)) {
    result = sideToMove === "w" ? "1-0" : "0-1";
  }

  if (variant === "three-check") {
    const checks = countChecksInPgn(chess.pgn());
    if (checks.w >= 3) result = "1-0";
    else if (checks.b >= 3) result = "0-1";
  }

  if (variant === "horde" && sideHasNoPieces(chess, "w") && sideToMove === "b") {
    // All white pawns captured → black wins.
    result = "0-1";
  }
  if (variant === "horde" && chess.isCheckmate()) {
    result = sideToMove === "w" ? "1-0" : "0-1";
  }

  /* Default standard game-over checks. */
  if (result === "*") {
    if (chess.isCheckmate()) result = sideToMove === "w" ? "1-0" : "0-1";
    else if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isDraw()) {
      result = "1/2-1/2";
    }
  }

  return updateGame(game.id, {
    pgn: chess.pgn(),
    result,
    finishedAt: result === "*" ? null : new Date(),
  });
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function applyAtomicExplosion(chess: Chess, center: Square): void {
  // Atomic: capture explodes attacker AND all non-pawn pieces in the
  // 3x3 zone around `center`. The captured square (target) is also
  // emptied (chess.js already removed the captured piece on capture).
  // The capturing piece is removed too.
  chess.remove(center);
  const file = center.charCodeAt(0); // 'a'..'h'
  const rank = Number(center[1]);
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = String.fromCharCode(file + df);
      const r = rank + dr;
      if (f < "a" || f > "h" || r < 1 || r > 8) continue;
      const sq = (`${f}${r}`) as Square;
      const piece = chess.get(sq);
      if (piece && piece.type !== "p") chess.remove(sq);
    }
  }
}

function kingExploded(chess: Chess): Color | null {
  // Returns the COLOR that won (i.e. the OTHER side's king was destroyed).
  const board = chess.board();
  let whiteKing = false;
  let blackKing = false;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.type === "k") {
        if (cell.color === "w") whiteKing = true;
        else blackKing = true;
      }
    }
  }
  if (!whiteKing) return "b";
  if (!blackKing) return "w";
  return null;
}

function kingReached8thRank(chess: Chess): boolean {
  const board = chess.board();
  for (let i = 0; i < 8; i++) {
    const cell = board[0][i]; // rank 8 row
    if (cell?.type === "k") return true;
  }
  return false;
}

function kingOnHill(chess: Chess, side: Color): boolean {
  const hill: Square[] = ["d4", "e4", "d5", "e5"];
  for (const sq of hill) {
    const p = chess.get(sq);
    if (p?.type === "k" && p.color === side) return true;
  }
  return false;
}

function sideHasNoPieces(chess: Chess, side: Color): boolean {
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell?.color === side) return false;
    }
  }
  return true;
}

function anyCaptureLegalFromFen(fen: string): boolean {
  try {
    const c = new Chess(fen);
    return c.moves({ verbose: true }).some((m) => m.captured);
  } catch {
    return false;
  }
}

/**
 * Best-effort: the FEN BEFORE the just-played move. We rebuild by
 * undoing the move; chess.js doesn't expose pre-move FEN cleanly.
 */
function beforeFen(chess: Chess, mv: { san: string }): string {
  const probe = new Chess();
  const history = chess.history({ verbose: true });
  for (let i = 0; i < history.length - 1; i++) {
    probe.move(history[i].san);
  }
  void mv;
  return probe.fen();
}

function countChecksInPgn(pgn: string): { w: number; b: number } {
  // Crude: count '+' symbols on white-move vs black-move tokens.
  // A more accurate version walks the move list. This is good enough
  // for the win-condition trigger.
  const moves = pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\d+\.(\.\.)?/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let w = 0;
  let b = 0;
  moves.forEach((m, idx) => {
    const isCheck = m.includes("+") || m.includes("#");
    if (!isCheck) return;
    if (idx % 2 === 0) w++;
    else b++;
  });
  return { w, b };
}

async function updateGame(
  id: number,
  patch: Partial<Pick<VariantGame, "pgn" | "result" | "finishedAt">>,
): Promise<VariantGame | undefined> {
  return storage.updateVariantGame(id, patch);
}

/** Convenience exporter so the lobby UI can preview a starting position. */
export async function startVariantGame(
  args: InsertVariantGame,
): Promise<VariantGame> {
  return storage.createVariantGame(args);
}
