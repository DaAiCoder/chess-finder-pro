/**
 * One tight "puzzle explanation" style line: move + what it hits + motifs + follow-up SAN.
 */
import { Chess, type Move, type Square } from "chess.js";
import { detectMotifsForMove } from "./motifDetector.js";

/** Squares around the enemy king we name when attacked (empty or occupied). */
const KING_RING: Record<"w" | "b", Square[]> = {
  w: ["f2", "h2", "g2", "e3", "d2"],
  b: ["f7", "h7", "g7", "e6", "d7"],
};

/** Our second SAN along Stockfish PV from `fenAfter` (opponent to move): 1…best 2.ours. */
function ourSecondPlySanFromPv(fenAfter: string, pv: string[]): string | null {
  if (pv.length < 2) return null;
  try {
    const c = new Chess(fenAfter);
    const u0 = pv[0]!.trim().toLowerCase();
    const u1 = pv[1]!.trim().toLowerCase();
    if (u0.length < 4 || u1.length < 4) return null;
    const a = c.move({
      from: u0.slice(0, 2) as Square,
      to: u0.slice(2, 4) as Square,
      promotion: u0.length > 4 ? (u0[4] as "q" | "r" | "b" | "n") : undefined,
    });
    if (!a) return null;
    const b = c.move({
      from: u1.slice(0, 2) as Square,
      to: u1.slice(2, 4) as Square,
      promotion: u1.length > 4 ? (u1[4] as "q" | "r" | "b" | "n") : undefined,
    });
    return b?.san ?? null;
  } catch {
    return null;
  }
}

/** Squares the moved piece strikes (captures first, then king-ring targets), max 2. */
function attackTargetsText(c: Chess, played: Move, them: "w" | "b"): string | null {
  const ring = new Set(KING_RING[them]);
  const mvs = c.moves({ square: played.to as Square, verbose: true });
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const m of mvs) {
    if (m.captured && !seen.has(m.to)) {
      ordered.push(m.to);
      seen.add(m.to);
    }
  }
  for (const m of mvs) {
    if (m.captured) continue;
    if (ring.has(m.to as Square) && !seen.has(m.to)) {
      ordered.push(m.to);
      seen.add(m.to);
    }
  }
  if (ordered.length === 0) return null;
  return ordered.slice(0, 2).join(" and ");
}

function motifPhrase(keys: string[]): string | null {
  const bits: string[] = [];
  if (keys.includes("royal-fork")) bits.push("king-and-queen fork ideas");
  else if (keys.includes("fork")) bits.push("fork ideas");
  if (keys.includes("pin")) bits.push("pinning pressure");
  if (keys.includes("skewer")) bits.push("skewer motifs");
  if (keys.includes("discovered-check")) bits.push("discovered-check tricks");
  else if (keys.includes("discovered-attack")) bits.push("discovered-attack ideas");
  if (keys.includes("double-check")) bits.push("double-check follow-ups");
  if (bits.length === 0) return null;
  return bits.slice(0, 2).join(" and ");
}

/** Ng5–f7 style: knight eyes the king's wing pawns (motif detector ignores minor-on-pawn forks). */
function weakKingForkNudge(played: Move, tgt: string | null): string | null {
  if (played.piece !== "n" || !tgt) return null;
  if (played.color === "w" && /\b(f7|h7)\b/.test(tgt)) return "fork ideas";
  if (played.color === "b" && /\b(f2|h2)\b/.test(tgt)) return "fork ideas";
  return null;
}

export function buildPuzzleStyleLead(args: {
  fenBefore: string;
  played: Move;
  /** PV from position after our move (opponent to move). */
  pvAfter: string[] | undefined;
}): string {
  const { fenBefore, played, pvAfter } = args;
  let c: Chess;
  try {
    c = new Chess(played.after);
  } catch {
    return `${played.san} is on the board.`;
  }

  const them = played.color === "w" ? "b" : "w";
  const before = new Chess(fenBefore);
  const motifs = detectMotifsForMove(before, c, {
    from: played.from as Square,
    to: played.to as Square,
    san: played.san,
    color: played.color,
  });

  const followOur = ourSecondPlySanFromPv(played.after, pvAfter ?? []);
  const tgt = attackTargetsText(c, played, them);

  let motif = motifPhrase(motifs);
  if (!motif) motif = weakKingForkNudge(played, tgt);

  let s = played.san;
  if (played.isKingsideCastle() || played.isQueensideCastle()) {
    s += played.isKingsideCastle() ? " castles kingside" : " castles queenside";
  } else if (played.isCapture()) {
    s += ` takes on ${played.to}`;
  } else if (tgt) {
    s += ` attacks ${tgt}`;
  } else {
    s += ` sets up on ${played.to}`;
  }

  if (motif) {
    s += `, threatening ${motif}`;
    if (followOur) s += ` with ${followOur}`;
  } else if (followOur) {
    s += `, with ideas like ${followOur}`;
  } else if (c.inCheck()) {
    s += ", giving check";
  }

  s += ".";
  if (s.length > 260) return `${s.slice(0, 257)}…`;
  return s;
}
