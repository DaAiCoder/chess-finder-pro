/**
 * Pattern detection over a played game.
 *
 * Heuristic, fast, no engine required:
 *   - Fork: a knight or queen move that simultaneously attacks 2+ undefended
 *     pieces of higher value (or any piece + the king).
 *   - Pin: an attacker x-rays through one piece to a more valuable piece
 *     (or the king) on the same line.
 *   - Skewer: same as pin but the more valuable piece is in front.
 *   - Discovered attack: a move that uncovers an attack from another piece.
 *   - Hanging piece: an undefended piece attacked by a less valuable one.
 *
 * The list is short by design — these are the motifs the rest of the app
 * surfaces in the UI. Extend by adding entries to MOTIF_DEFINITIONS and a
 * matching detector below.
 */

import { Chess, type Square, type Piece } from "chess.js";
import type {
  InsertMotifDefinition,
  InsertMotifInstance,
  MotifInstanceData,
} from "../../shared/schema.js";

import { MOTIF_CATEGORIES } from "../../shared/schema.js";

export const MOTIF_DEFINITIONS: InsertMotifDefinition[] = [
  { key: "fork",                name: "Fork",                category: MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS,    description: "One piece attacks two enemy units at once." },
  { key: "royal-fork",          name: "Royal Fork",          category: MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS,    description: "Fork attacking both the enemy king and queen." },
  { key: "double-attack",       name: "Double Attack",       category: MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS,    description: "Two simultaneous threats by different pieces." },
  { key: "pin",                 name: "Pin",                 category: MOTIF_CATEGORIES.PINS_SKEWERS,            description: "Attacker pins a piece against a more valuable one behind it." },
  { key: "skewer",              name: "Skewer",              category: MOTIF_CATEGORIES.PINS_SKEWERS,            description: "Attacker forces a more valuable piece to move, exposing the piece behind it." },
  { key: "x-ray",               name: "X-Ray",               category: MOTIF_CATEGORIES.PINS_SKEWERS,            description: "Long-range piece attacks through another piece." },
  { key: "discovered-attack",   name: "Discovered Attack",   category: MOTIF_CATEGORIES.DISCOVERED_IDEAS,        description: "A piece moves out of the way, uncovering an attack from another piece." },
  { key: "discovered-check",    name: "Discovered Check",    category: MOTIF_CATEGORIES.DISCOVERED_IDEAS,        description: "Moving piece uncovers a check from a piece behind it." },
  { key: "double-check",        name: "Double Check",        category: MOTIF_CATEGORIES.DISCOVERED_IDEAS,        description: "Two pieces give check at once — only the king can move." },
  { key: "windmill",            name: "Windmill",            category: MOTIF_CATEGORIES.DISCOVERED_IDEAS,        description: "Repeating discovered checks that win material each cycle." },
  { key: "deflection",          name: "Deflection",          category: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,     description: "Force a defender to move away from a key square." },
  { key: "decoy",               name: "Decoy",               category: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,     description: "Lure a piece to a bad square." },
  { key: "overloaded-piece",    name: "Overloaded Piece",    category: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,     description: "A defender has too many duties." },
  { key: "interference",        name: "Interference",        category: MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE, description: "Block the line between defender and target." },
  { key: "zwischenzug",         name: "Zwischenzug",         category: MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE, description: "Surprising in-between move that changes the evaluation." },
  { key: "trapped-piece",       name: "Trapped Piece",       category: MOTIF_CATEGORIES.TRAPPING,                description: "A piece has no safe squares." },
  { key: "hanging-piece",       name: "Hanging Piece",       category: MOTIF_CATEGORIES.TRAPPING,                description: "An undefended piece is attacked." },
  { key: "back-rank",           name: "Back Rank Mate",      category: MOTIF_CATEGORIES.MATING_NETS,             description: "Rook or queen delivers mate on the back rank." },
  { key: "smothered-mate",      name: "Smothered Mate",      category: MOTIF_CATEGORIES.MATING_NETS,             description: "Knight delivers mate to a king blocked by its own pieces." },
  { key: "greek-gift",          name: "Greek Gift",          category: MOTIF_CATEGORIES.MATING_NETS,             description: "Bishop sacrifice on h7 or h2 to expose the king." },
  { key: "passed-pawn",         name: "Passed Pawn",         category: MOTIF_CATEGORIES.PROMOTION,               description: "Pawn with a clear path to promotion." },
  { key: "opposition",          name: "Opposition",          category: MOTIF_CATEGORIES.ENDGAME,                 description: "Kings facing each other in king-and-pawn endgames." },
  { key: "lucena",              name: "Lucena Position",     category: MOTIF_CATEGORIES.ENDGAME,                 description: "Winning rook endgame technique." },
  { key: "philidor",            name: "Philidor Position",   category: MOTIF_CATEGORIES.ENDGAME,                 description: "Drawing rook endgame technique." },
];

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export interface DetectedMotif extends InsertMotifInstance {
  // narrowed type — we always have a key + ply + fen here.
  motifKey: string;
  ply: number;
  fen: string;
}

export interface DetectorContext {
  /** PGN result tag, used to enrich instance data + decide "missed" weight. */
  gameResult?: string | null;
}

export function detectMotifsInGame(
  pgn: string,
  gameId?: number,
  ctx: DetectorContext = {},
): DetectedMotif[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }
  const history = chess.history({ verbose: true });
  const replay = new Chess();
  const found: DetectedMotif[] = [];
  const gameResult = ctx.gameResult ?? null;

  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    const fen = replay.fen();
    // After playing ply (i+1), it is the OPPONENT's turn — `m.color` is the
    // side that just moved (and so "owns" the motif we just spotted).
    const side: "white" | "black" = m.color === "w" ? "white" : "black";
    const baseData: MotifInstanceData = {
      san: m.san,
      side,
      gameResult: gameResult ?? undefined,
      missed: false,
    };

    const push = (motifKey: string, extra: Partial<MotifInstanceData> = {}) => {
      const data: MotifInstanceData = { ...baseData, ...extra };
      found.push({
        motifKey,
        ply: i + 1,
        fen,
        gameId: gameId ?? null,
        data,
      });
    };

    const fork = isFork(replay, m.to as Square);
    if (fork.kind === "royal") push("royal-fork", { square: m.to });
    else if (fork.kind === "fork") push("fork", { square: m.to });

    if (createsPin(replay, m.to as Square)) push("pin", { square: m.to });
    if (createsSkewer(replay, m.to as Square)) push("skewer", { square: m.to });

    if (m.san.includes("+") || m.san.includes("#")) {
      const checkKind = classifyCheck(history.slice(0, i + 1));
      if (checkKind === "double") push("double-check", { square: m.to });
      else if (checkKind === "discovered") push("discovered-check", { square: m.to });
    } else if (isDiscoveredAttack(history.slice(0, i + 1))) {
      push("discovered-attack", { square: m.to });
    }

    // Hanging pieces detected AFTER the move belong to the side now to move
    // (they failed to defend) — flag those as "missed" by that side.
    const hanging = findHangingPieces(replay);
    for (const sq of hanging) {
      const owner: "white" | "black" = replay.turn() === "w" ? "white" : "black";
      found.push({
        motifKey: "hanging-piece",
        ply: i + 1,
        fen,
        gameId: gameId ?? null,
        data: {
          ...baseData,
          side: owner,
          missed: true,
          square: sq,
        },
      });
    }

    if (m.san.includes("#") && isBackRankMate(replay)) {
      push("back-rank", { square: m.to });
    }
    if (m.san.includes("#") && isSmotheredMate(replay, m.to as Square)) {
      push("smothered-mate", { square: m.to });
    }
  }

  return found;
}

/**
 * Detect motif keys triggered by a single move from `before` → `after`.
 *
 * Used by the line searcher to tag candidate lines without rebuilding a full
 * PGN. `move` is whatever chess.js returned from `Chess.move()`.
 */
export function detectMotifsForMove(
  before: Chess,
  after: Chess,
  move: { from: Square; to: Square; san: string; color: "w" | "b" },
): string[] {
  const keys: string[] = [];
  const fork = isFork(after, move.to);
  if (fork.kind === "royal") keys.push("royal-fork");
  else if (fork.kind === "fork") keys.push("fork");
  if (createsPin(after, move.to)) keys.push("pin");
  if (createsSkewer(after, move.to)) keys.push("skewer");

  if (move.san.includes("+") || move.san.includes("#")) {
    const kind = classifyCheckPair(before, after, move);
    if (kind === "double") keys.push("double-check");
    else if (kind === "discovered") keys.push("discovered-check");
  } else if (isDiscoveredAttackPair(before, after, move)) {
    keys.push("discovered-attack");
  }

  if (move.san.includes("#") && isBackRankMate(after)) keys.push("back-rank");
  if (move.san.includes("#") && isSmotheredMate(after, move.to)) keys.push("smothered-mate");

  return keys;
}

/**
 * Material balance in pawns, positive when white has more material.
 * Counts only non-king pieces.
 */
export function materialBalance(c: Chess): number {
  let balance = 0;
  for (const row of c.board()) {
    for (const cell of row) {
      if (!cell || cell.type === "k") continue;
      const v = PIECE_VALUE[cell.type] ?? 0;
      balance += cell.color === "w" ? v : -v;
    }
  }
  return balance;
}

type ForkKind = "none" | "fork" | "royal";

function isFork(c: Chess, from: Square): { kind: ForkKind } {
  const piece = c.get(from);
  if (!piece) return { kind: "none" };
  const attacks = squaresAttackedFrom(c, from);
  let valuable = 0;
  let hitsKing = false;
  let hitsQueen = false;
  for (const sq of attacks) {
    const target = c.get(sq);
    if (!target) continue;
    if (target.color === piece.color) continue;
    if (PIECE_VALUE[target.type] >= PIECE_VALUE[piece.type] || target.type === "k") {
      valuable++;
      if (target.type === "k") hitsKing = true;
      if (target.type === "q") hitsQueen = true;
    }
  }
  if (hitsKing && hitsQueen) return { kind: "royal" };
  if (valuable >= 2) return { kind: "fork" };
  return { kind: "none" };
}

/**
 * Classify the check at position `replay` after replaying `historyUpTo`:
 *   - "double"     — two enemy pieces give check at once.
 *   - "discovered" — the checking piece is NOT the one that just moved.
 *   - "normal"     — the moving piece directly delivers the check.
 */
function classifyCheck(historyUpTo: Array<{ from: string; to: string; promotion?: string }>): "normal" | "discovered" | "double" {
  if (historyUpTo.length === 0) return "normal";
  const after = new Chess();
  for (const m of historyUpTo) after.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion });
  if (!after.isCheck()) return "normal";

  const before = new Chess();
  for (let i = 0; i < historyUpTo.length - 1; i++) {
    const m = historyUpTo[i];
    before.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion });
  }
  const last = historyUpTo[historyUpTo.length - 1];
  return classifyCheckPair(before, after, { from: last.from as Square, to: last.to as Square, color: after.turn() === "w" ? "b" : "w" });
}

function classifyCheckPair(
  before: Chess,
  after: Chess,
  move: { from: Square; to: Square; color: "w" | "b" },
): "normal" | "discovered" | "double" {
  if (!after.isCheck()) return "normal";
  const enemyKing = findKingSquare(after, move.color === "w" ? "b" : "w");
  if (!enemyKing) return "normal";
  const checkers = after.attackers(enemyKing, move.color);
  if (checkers.length >= 2) return "double";
  if (checkers.length === 1 && checkers[0] !== move.to) return "discovered";
  return "normal";
}

/** Detect "discovered attack" without a check: the moving piece reveals a
 *  long-range attacker that now hits a piece worth more than itself. */
function isDiscoveredAttack(historyUpTo: Array<{ from: string; to: string; promotion?: string }>): boolean {
  if (historyUpTo.length < 1) return false;
  const before = new Chess();
  for (let i = 0; i < historyUpTo.length - 1; i++) {
    const m = historyUpTo[i];
    before.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion });
  }
  const last = historyUpTo[historyUpTo.length - 1];
  const probe = new Chess();
  for (const m of historyUpTo) probe.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion });
  const color = probe.turn() === "w" ? "b" : "w";
  return isDiscoveredAttackPair(before, probe, { from: last.from as Square, to: last.to as Square, color });
}

function isDiscoveredAttackPair(
  before: Chess,
  after: Chess,
  move: { from: Square; to: Square; color: "w" | "b" },
): boolean {
  // For every long-range friendly piece, check whether it attacks any enemy
  // target now that it didn't before.
  const enemyColor = move.color === "w" ? "b" : "w";
  const board = after.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      if (cell.color !== move.color) continue;
      if (cell.square === move.to) continue; // not the piece that moved
      if (!"bqr".includes(cell.type)) continue;
      const sq = cell.square as Square;
      const valueSelf = PIECE_VALUE[cell.type];
      for (const target of squaresAttackedFrom(after, sq)) {
        const tp = after.get(target);
        if (!tp || tp.color !== enemyColor) continue;
        if (PIECE_VALUE[tp.type] < valueSelf) continue;
        // Was the attacker NOT attacking this target before the move? If the
        // attacker can see the target after but not before, it's discovered.
        if (!squaresAttackedFrom(before, sq).includes(target)) return true;
      }
    }
  }
  return false;
}

function findKingSquare(c: Chess, color: "w" | "b"): Square | null {
  const board = c.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell?.type === "k" && cell.color === color) return cell.square as Square;
    }
  }
  return null;
}

function createsPin(c: Chess, from: Square): boolean {
  const piece = c.get(from);
  if (!piece) return false;
  if (!"bqr".includes(piece.type)) return false;
  const lines = directionsFor(piece.type);
  for (const [df, dr] of lines) {
    const lineHits: { sq: Square; piece: Piece }[] = [];
    let f = fileIdx(from) + df;
    let r = rankIdx(from) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = idxToSquare(f, r);
      const p = c.get(sq);
      if (p) {
        lineHits.push({ sq, piece: p });
        if (lineHits.length === 2) break;
      }
      f += df;
      r += dr;
    }
    if (
      lineHits.length === 2 &&
      lineHits[0].piece.color !== piece.color &&
      lineHits[1].piece.color !== piece.color &&
      PIECE_VALUE[lineHits[1].piece.type] > PIECE_VALUE[lineHits[0].piece.type]
    ) {
      return true;
    }
  }
  return false;
}

function createsSkewer(c: Chess, from: Square): boolean {
  const piece = c.get(from);
  if (!piece) return false;
  if (!"bqr".includes(piece.type)) return false;
  const lines = directionsFor(piece.type);
  for (const [df, dr] of lines) {
    const lineHits: { sq: Square; piece: Piece }[] = [];
    let f = fileIdx(from) + df;
    let r = rankIdx(from) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = idxToSquare(f, r);
      const p = c.get(sq);
      if (p) {
        lineHits.push({ sq, piece: p });
        if (lineHits.length === 2) break;
      }
      f += df;
      r += dr;
    }
    if (
      lineHits.length === 2 &&
      lineHits[0].piece.color !== piece.color &&
      lineHits[1].piece.color !== piece.color &&
      PIECE_VALUE[lineHits[0].piece.type] > PIECE_VALUE[lineHits[1].piece.type]
    ) {
      return true;
    }
  }
  return false;
}

function findHangingPieces(c: Chess): Square[] {
  const board = c.board();
  const stm = c.turn();
  const hanging: Square[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      if (cell.color !== stm) continue;
      const sq = cell.square as Square;
      const attackers = c.attackers(sq, stm === "w" ? "b" : "w");
      const defenders = c.attackers(sq, stm);
      if (attackers.length > defenders.length && cell.type !== "k") {
        hanging.push(sq);
      }
    }
  }
  return hanging;
}

function isBackRankMate(c: Chess): boolean {
  // After a checkmate move, side-to-move is the loser.
  const stm = c.turn();
  const board = c.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell?.type === "k" && cell.color === stm) {
        const isBackRank = (cell.color === "w" && r === 7) || (cell.color === "b" && r === 0);
        return isBackRank;
      }
    }
  }
  return false;
}

function isSmotheredMate(c: Chess, attackerSquare: Square): boolean {
  const piece = c.get(attackerSquare);
  return piece?.type === "n";
}

function directionsFor(type: string): Array<[number, number]> {
  if (type === "r") return [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (type === "b") return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
}

function squaresAttackedFrom(c: Chess, from: Square): Square[] {
  // Build the set of squares to which a piece at `from` could move/capture.
  // We use chess.js's verbose moves for the side that just moved by temporarily
  // swapping turns.
  const piece = c.get(from);
  if (!piece) return [];
  const fen = c.fen();
  const fenParts = fen.split(" ");
  fenParts[1] = piece.color; // make it that color's turn
  // Reset castling/ep so we don't introduce illegal-state errors.
  fenParts[2] = "-";
  fenParts[3] = "-";
  const probe = new Chess();
  try {
    probe.load(fenParts.join(" "));
  } catch {
    return [];
  }
  return probe.moves({ square: from, verbose: true }).map((m) => m.to as Square);
}

function fileIdx(sq: string): number {
  return sq.charCodeAt(0) - 97;
}
function rankIdx(sq: string): number {
  return Number(sq[1]) - 1;
}
function idxToSquare(f: number, r: number): Square {
  return (String.fromCharCode(97 + f) + (r + 1)) as Square;
}
