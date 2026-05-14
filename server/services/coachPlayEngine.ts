/**
 * Play vs computer — puzzle-style tactical line + short Stockfish footnote.
 * Tune with COACH_PLAY_SF_DEPTH / COACH_PLAY_SF_MS / COACH_PLAY_AFTER_*.
 */
import { Chess } from "chess.js";
import { buildPuzzleStyleLead } from "./coachPlayPuzzleLine.js";
import { stockfish } from "./stockfish.js";
import { playMoveOneLiner } from "./coachPlayOneLiner.js";

const PLAY_DEPTH = Math.min(14, Math.max(4, Number(process.env.COACH_PLAY_SF_DEPTH) || 7));
const PLAY_MS = Math.min(5000, Math.max(250, Number(process.env.COACH_PLAY_SF_MS) || 900));
/** Second, smaller search from the position after your move (same White-perspective eval numbers). */
const AFTER_MS = Math.min(4500, Math.max(180, Number(process.env.COACH_PLAY_AFTER_MS) || Math.floor(PLAY_MS * 0.65)));
const AFTER_DEPTH = Math.min(8, Math.max(3, Number(process.env.COACH_PLAY_AFTER_DEPTH) || Math.min(5, PLAY_DEPTH)));

function extractPlayedSan(userMessage: string): string | null {
  const cleaned = userMessage.replace(/\r/g, "").trim();
  for (const re of [
    /I just played\s+([^\s.!?\n]+)/i,
    /comment on the move I just played:\s*([^\s.!?\n]+)/i,
    /move\s+([^\s.!?\n]+)\s+I just played/i,
    /played:\s*([^\s.!?\n]+)/i,
  ]) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].replace(/[+#?!]+$/, "");
  }
  return null;
}

function pvOpeningSnippet(fen: string, pv: string[]): string | null {
  if (!pv.length) return null;
  try {
    const c = new Chess(fen);
    const out: string[] = [];
    for (let i = 0; i < Math.min(3, pv.length); i++) {
      const u = pv[i]!.trim().toLowerCase();
      if (u.length < 4) break;
      const m = c.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        promotion: u.length > 4 ? (u[4] as "q" | "r" | "b" | "n") : undefined,
      });
      if (!m) break;
      out.push(m.san);
    }
    if (out.length < 2) return null;
    return out.slice(0, 2).join(" ");
  } catch {
    return null;
  }
}

function sanFromUci(fen: string, uci: string): string {
  const u = uci.trim().toLowerCase();
  if (u.length < 4) return uci;
  try {
    const c = new Chess(fen);
    const m = c.move({
      from: u.slice(0, 2),
      to: u.slice(2, 4),
      promotion: u.length > 4 ? (u[4] as "q" | "r" | "b" | "n") : undefined,
    });
    return m?.san ?? uci;
  } catch {
    return uci;
  }
}

/** Centipawns from White's POV (matches `stockfish.evaluate`). */
function whiteEvalWords(cp: number): string {
  if (Math.abs(cp) > 25000) return "the evaluation is extreme on the board";
  const a = Math.abs(cp);
  if (a < 22) return "the position is roughly level";
  const p = (cp / 100).toFixed(1);
  if (cp >= 45) return `White has a solid edge (about +${p} pawns)`;
  if (cp <= -45) return `Black is clearly better (about +${Math.abs(Number(p))} for Black)`;
  if (cp > 0) return `White is a touch better (~+${p})`;
  return `Black is a touch better (~+${Math.abs(Number(p))})`;
}

export async function buildPlayCoachLine(
  fenBefore: string,
  san: string,
  playerColor?: "white" | "black",
): Promise<string> {
  let played;
  try {
    const c = new Chess(fenBefore);
    played = c.move(san);
  } catch {
    return "That move is not legal from this position.";
  }
  if (!played) return "That move is not legal from this position.";

  if (playerColor) {
    const want = playerColor === "white" ? "w" : "b";
    if (played.color !== want) {
      return (
        playMoveOneLiner(fenBefore, san, playerColor) ??
        "Keep your pieces coordinated toward the center."
      );
    }
  }

  let ev;
  try {
    ev = await stockfish.evaluate(fenBefore, PLAY_DEPTH, PLAY_MS);
  } catch {
    ev = await stockfish.evaluate(fenBefore, 5, 600);
  }

  const bestUci = (ev.bestMove ?? "").toLowerCase().trim();
  const userUci = `${played.from}${played.to}${played.promotion ?? ""}`.toLowerCase();
  const match =
    !!bestUci &&
    (userUci === bestUci ||
      (userUci.slice(0, 4) === bestUci.slice(0, 4) && userUci.length >= 4 && bestUci.length >= 4));

  const bestSan = bestUci.length >= 4 ? sanFromUci(fenBefore, bestUci) : bestUci;
  const evalPhrase = whiteEvalWords(ev.evaluation);
  const depth = ev.depth || PLAY_DEPTH;
  const mode = stockfish.getEngineMode();

  let engineLine: string;
  if (match) {
    engineLine = `Engine (depth ${depth}): matches your move; ${evalPhrase}.`;
  } else if (bestUci) {
    engineLine = `Engine (depth ${depth}): ${bestSan} was first choice; ${evalPhrase}.`;
  } else {
    engineLine = `${evalPhrase} (depth ${depth}).`;
  }

  const pvRoot = pvOpeningSnippet(fenBefore, ev.pv);
  if (pvRoot && engineLine.length < 210) {
    engineLine += ` From the start of the search: ${pvRoot}.`;
  }

  if (mode === "mock") {
    engineLine += " Set STOCKFISH_PATH for sharper lines.";
  }

  const fenAfter = played.after;
  let pvAfter: string[] | undefined;
  if (stockfish.getEngineMode() !== "mock") {
    try {
      const evAfter = await stockfish.evaluate(fenAfter, AFTER_DEPTH, AFTER_MS);
      pvAfter = evAfter.pv;
    } catch {
      /* ignore */
    }
  }

  const puzzleLead = buildPuzzleStyleLead({ fenBefore, played, pvAfter });

  let body = `${puzzleLead} ${engineLine}`.trim();
  if (body.length > 520) body = `${body.slice(0, 517)}…`;
  return body;
}

export async function* iterPlayCoachReply(params: {
  userMessage: string;
  fen?: string;
  targetSan?: string | null;
  playerColor?: "white" | "black";
}): AsyncGenerator<string, void, void> {
  const san = params.targetSan?.trim() || extractPlayedSan(params.userMessage);
  if (!params.fen || !san) {
    yield "Play a move on the board — the coach reads the real position with Stockfish.";
    return;
  }
  const line = await buildPlayCoachLine(params.fen, san, params.playerColor);
  yield line;
}
