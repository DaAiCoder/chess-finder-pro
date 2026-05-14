/**
 * Long-form Watch commentary: per-move explanations and engine-backed
 * alternate lines, aligned to the same timeline seconds as the player.
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import type { NarrationCaption } from "./narration.js";

export interface TimelinePosLite {
  fen: string;
  san: string;
  uci?: string;
}

export interface PlyEngineHint {
  /** Centipawns from White's POV at the position *after* the move. */
  cpAfter: number | null;
  mateAfter: number | null;
  bestUci: string;
  bestSan: string;
  /** 1 = engine's top choice matches what was played. */
  playedRank: number;
  /** First moves of the top few engine lines (human-readable). */
  altLineLabels: string[];
}

function normalizeUci(raw: string | undefined): string {
  if (!raw) return "";
  const s = raw.trim().toLowerCase();
  if (s.length >= 4) return s.slice(0, 4) + (s.length > 4 ? s.slice(4) : "");
  return s;
}

function sanFromUci(fen: string, uci: string): string {
  try {
    const c = new Chess();
    c.load(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
    const m = c.move({ from, to, promotion });
    return m ? m.san : uci;
  } catch {
    return uci;
  }
}

/** Pick plies where we will call Stockfish (capped for latency). */
export function pickHintPlies(lastPly: number, cap = 48): number[] {
  const out: number[] = [];
  for (let p = 1; p <= lastPly; p++) {
    if (p <= 18 && p % 2 === 1) out.push(p);
    else if (p <= 60 && p % 4 === 1) out.push(p);
    else if (p % 7 === 1) out.push(p);
  }
  const uniq = [...new Set(out)].sort((a, b) => a - b);
  if (uniq.length <= cap) return uniq;
  const step = Math.ceil(uniq.length / cap);
  const thinned: number[] = [];
  for (let i = 0; i < uniq.length; i += step) thinned.push(uniq[i]!);
  return thinned.slice(0, cap);
}

/**
 * Engine hints at selected plies (FEN *before* the move on the board).
 */
export async function collectPlyHints(
  positions: TimelinePosLite[],
  plies: number[],
): Promise<Map<number, PlyEngineHint>> {
  const map = new Map<number, PlyEngineHint>();
  for (const ply of plies) {
    if (ply < 1 || ply >= positions.length) continue;
    const fenBefore = positions[ply - 1]!.fen;
    const playedUci = normalizeUci(positions[ply]!.uci);
    try {
      const { best, lines } = await stockfish.evaluateAllMoves(fenBefore, 8, 4500);
      const top = lines.filter((l) => l.uci.length >= 4).slice(0, 8);
      const bestUci = normalizeUci(best.bestMove ?? top[0]?.uci ?? "");
      let playedRank = 99;
      for (let i = 0; i < top.length; i++) {
        if (normalizeUci(top[i]!.uci) === playedUci) {
          playedRank = i + 1;
          break;
        }
      }
      const linePlayed = top.find((l) => normalizeUci(l.uci) === playedUci);
      const cpAfter = linePlayed?.cp ?? best.evaluation;
      const mateAfter = linePlayed?.mateIn ?? best.mateIn;
      const altLineLabels: string[] = [];
      for (const line of top.slice(0, 3)) {
        const san = sanFromUci(fenBefore, line.uci);
        const cp =
          line.mateIn != null ? `M${Math.abs(line.mateIn)}` : (line.cp / 100).toFixed(1);
        altLineLabels.push(`${san} (${cp})`);
      }
      map.set(ply, {
        cpAfter,
        mateAfter,
        bestUci,
        bestSan: sanFromUci(fenBefore, bestUci || top[0]?.uci || playedUci),
        playedRank,
        altLineLabels,
      });
    } catch {
      /* skip ply */
    }
  }
  return map;
}

function describeSan(san: string): string {
  if (!san) return "the position";
  if (san.includes("x")) return "a capture that changes the pawn structure";
  if (san.endsWith("+") || san.endsWith("#")) return "forcing the king to react";
  if (san.startsWith("O-O")) return "getting the king to safety and connecting the rooks";
  if (/^[NBRQK]/.test(san)) return "developing or repositioning a piece with tempo";
  if (san === san.toLowerCase()) return "a pawn advance that stakes space";
  return "a purposeful developing move";
}

/**
 * Dense captions inside each move window — three beats: what happened,
 * engine opinion / alternates, takeaway. Uses tighter intervals so the
 * UI picks them over wider phase captions when timestamps overlap.
 */
export function buildPerMoveExplanationCaptions(
  history: { san: string }[],
  positions: TimelinePosLite[],
  hints: Map<number, PlyEngineHint>,
  opts: { introHoldS: number; perMoveS: number },
): NarrationCaption[] {
  const { introHoldS, perMoveS } = opts;
  const captions: NarrationCaption[] = [];
  const lastPly = positions.length - 1;

  const tForPly = (ply: number) =>
    ply === 0 ? 0 : introHoldS + (ply - 1) * perMoveS;

  for (let ply = 1; ply <= lastPly; ply++) {
    const m = history[ply - 1];
    if (!m) continue;
    const T0 = tForPly(ply);
    const T1 = tForPly(ply + 1);
    const span = Math.max(0.8, T1 - T0);
    const side = ply % 2 === 1 ? "White" : "Black";
    const moveNo = Math.ceil(ply / 2);
    const hint = hints.get(ply);

    const a0 = T0;
    const a1 = T0 + span * 0.36;
    const b0 = a1;
    const b1 = T0 + span * 0.78;
    const c0 = b1;
    const c1 = T1 - 0.05;

    captions.push({
      tStart: a0,
      tEnd: a1,
      ply,
      kind: "move",
      text: `${side} (${moveNo}.) plays ${m.san} — ${describeSan(m.san)}.`,
    });

    if (hint) {
      const playedIsBest = hint.playedRank === 1;
      const alt = hint.altLineLabels.filter((_, i) => i > 0).slice(0, 2).join("; ");
      if (playedIsBest) {
        captions.push({
          tStart: b0,
          tEnd: b1,
          ply,
          kind: "info",
          text: `Engine agrees: ${hint.bestSan} is the principled try here. Top alternatives: ${alt || "…"}.`,
        });
      } else {
        captions.push({
          tStart: b0,
          tEnd: b1,
          ply,
          kind: "info",
          text: `Silicon would prefer ${hint.bestSan} first (rank #1). In the game we saw ${m.san} — still line ${hint.playedRank} in the search tree. Other tries: ${alt || "…"}.`,
        });
      }
      if (hint.mateAfter != null) {
        captions.push({
          tStart: c0,
          tEnd: c1,
          ply,
          kind: "key",
          text: `Mate is now on the radar (${hint.mateAfter > 0 ? "White" : "Black"} to deliver).`,
        });
      } else if (hint.cpAfter != null) {
        const ev = (hint.cpAfter / 100).toFixed(1);
        captions.push({
          tStart: c0,
          tEnd: c1,
          ply,
          kind: "info",
          text: `Approximate bar after the move: ${ev} pawns from White's perspective — long-form shows like Agadmator's deep dives spend several minutes here exploring sidelines; we've stretched the clock so you have room to think between moves.`,
        });
      }
    } else {
      captions.push({
        tStart: b0,
        tEnd: b1,
        ply,
        kind: "info",
        text: `Pausing on ${m.san}: in a full studio session we'd spin up the engine on every move — here we sample key moments to keep the page responsive.`,
      });
      captions.push({
        tStart: c0,
        tEnd: c1,
        ply,
        kind: "info",
        text: "Install Stockfish and set STOCKFISH_PATH for deeper live commentary on every ply.",
      });
    }
  }
  return captions;
}
