import { Chess, type Square } from "chess.js";

const START_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function pieceAt(c: Chess, sq: Square) {
  return c.get(sq);
}

/** One factual sentence — squares + diagonals, no dialogue (offline play coach). */
export function playMoveOneLiner(
  fenBefore: string,
  san: string,
  playerColor: "white" | "black" | undefined,
): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return null;
  }
  const moverBefore = chess.turn();
  const m = chess.move(san);
  if (!m) return null;
  if (playerColor) {
    const want = playerColor === "white" ? "w" : "b";
    if (m.color !== want) {
      return "That move tweaks the tension — keep pieces coordinated toward the center.";
    }
  }

  const parts = fenBefore.trim().split(/\s+/);
  const board = parts[0] ?? "";
  const fullmove = Math.max(1, Number(parts[5]) || 1);
  const isRootWhite = board === START_BOARD && moverBefore === "w" && fullmove === 1;

  if (isRootWhite && m.color === "w") {
    const t = WHITE_MOVE1[m.san];
    if (t) return t;
  }

  const wp = pieceAt(new Chess(fenBefore), "d4");
  if (wp?.type === "p" && wp.color === "w" && m.color === "b" && m.san === "d5") {
    return "d5 mirrors White's center pawn, fights for e4 and c4, and lets the c8-bishop develop along the c8–h3 diagonal toward the center.";
  }

  if (m.flags.includes("k") || m.flags.includes("q")) {
    return m.color === "w"
      ? "Castling kingside tucks the king to g1, connects the rooks, and often frees the f-pawn for central play."
      : "Castling gets the king safe and brings a rook toward the half-open e-file toward the center.";
  }

  if (m.captured) {
    return m.piece === "p"
      ? "That pawn capture changes the pawn skeleton — watch newly opened files and diagonals."
      : "The capture alters material and lines — make sure your own king and pieces stay coordinated.";
  }

  if (m.piece === "n") {
    return `${m.san} develops the knight toward the center from ${m.to}, a classic step toward d5, e4, and kingside castling.`;
  }
  if (m.piece === "b") {
    return `${m.san} develops the bishop to ${m.to}, training pressure along long diagonals that cut through the center.`;
  }
  if (m.piece === "q") {
    return `${m.san} moves the queen — keep it tied to concrete threats so it does not become a tempo target.`;
  }
  if (m.piece === "r") {
    return `${m.san} shifts a rook — look for half-open files pointing at the opposing king or weak pawns.`;
  }
  if (m.piece === "p") {
    if (m.san.includes("=")) return "Promotion gains a heavy piece — consolidate before the opponent counterattacks.";
    const f = m.from[0];
    if (f === "d" || f === "e")
      return `${m.san} pushes a central pawn, disputing key light and dark squares ahead of it.`;
    return `${m.san} nudges a flank pawn — mind weak squares and opposite-side breaks it may create.`;
  }
  if (m.piece === "k") {
    return `${m.san} walks the king — only sensible when the center is quiet or to dodge a concrete threat.`;
  }
  return `${m.san} improves the coordination of your army — keep developing with central and king-safety goals in mind.`;
}

const WHITE_MOVE1: Record<string, string> = {
  d4:
    "d4 is a sound classical choice: it contests e5 and c5 and frees the dark-squared bishop on c1 along the c1–h6 diagonal into the game.",
  e4:
    "e4 stakes the center toward d5 and f5 and opens the f1–a6 diagonal for the light-squared bishop on f1.",
  c4:
    "c4 flanks the center from the queenside, restrains …d5 ideas, and often pairs with a fianchettoed light-squared bishop on g2.",
  Nf3:
    "Nf3 develops toward e5 and d4 without locking the pawn center yet, keeping both d4 and e4 pushes in the picture.",
  Nc3:
    "Nc3 eyes d5 and e4 from the rim, keeps e2–e4 available for the f1-bishop, and speeds kingside castling.",
  g3:
    "g3 prepares Bg2, aiming the light-squared bishop down the a8–h1 diagonal while the long diagonal stays flexible.",
  b3:
    "b3 prepares Bb2, pressuring the long a1–h8 diagonal and queenside expansion without an early central pawn clash.",
  f4:
    "f4 grabs kingside space and eyes e5, often leading to open lines toward the black king once the center cracks.",
  d3:
    "d3 is a quiet queen's-pawn move that supports e4 and keeps the c1–h6 diagonal clear for the dark-squared bishop.",
  e3:
    "e3 solidifies d4 and f4 support squares and keeps the f1–a6 diagonal open for the light-squared bishop.",
  b4:
    "b4 challenges the c5-square from the flank and can transpose into snappy queenside skirmishes.",
  a3:
    "a3 clamps b4 and can prepare b4 itself, trading a tempo for queenside pawn tension.",
  h3:
    "h3 takes g4 away from a black bishop or knight and buys luft before committing the king.",
};
