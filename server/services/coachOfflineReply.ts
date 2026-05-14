/**
 * Coach-style replies with no cloud API keys: compact Stockfish-grounded notes
 * on the move you played (FEN + SAN) + optional weakness + practice links.
 */
import { Chess } from "chess.js";
import type { WeaknessRow } from "./weaknessProfile.js";
import { stockfish } from "./stockfish.js";
import { iterPlayCoachReply } from "./coachPlayEngine.js";

/** Shallow search keeps Play + coach snappy; raise via env if you want deeper notes. */
const OFFLINE_SF_DEPTH = Math.min(12, Math.max(4, Number(process.env.COACH_OFFLINE_SF_DEPTH) || 6));
const OFFLINE_SF_MS = Math.min(8000, Math.max(1200, Number(process.env.COACH_OFFLINE_SF_MS) || 2800));

/** FEN before the move; message is the coach prompt from Play / Analysis. */
function extractPlayedSan(userMessage: string): string | null {
  const cleaned = userMessage.replace(/\r/g, "").trim();
  const patterns = [
    /I just played\s+([^\s.!?\n]+)/i,
    /comment on the move I just played:\s*([^\s.!?\n]+)/i,
    /move\s+([^\s.!?\n]+)\s+I just played/i,
    /played:\s*([^\s.!?\n]+)/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].replace(/[+#?!]+$/, "");
  }
  return null;
}

function evalBlurb(evalCp: number, mover: "White" | "Black"): string {
  const abs = Math.abs(evalCp);
  if (abs < 38) return "the position was roughly level";
  const p = (evalCp / 100).toFixed(1);
  if (evalCp > 0) {
    return mover === "White"
      ? `White was ahead by about ${p} pawns (engine view)`
      : `White stood better by ~${p} pawns before your move (so Black was under some pressure)`;
  }
  return mover === "Black"
    ? `Black was fine — White down ~${Math.abs(Number(p))} pawns on the scoreboard`
    : `the game was tilting Black's way by ~${Math.abs(Number(p))} pawns`;
}

async function engineMoveParagraph(fen: string, userSan: string): Promise<string | null> {
  try {
    const probe = new Chess(fen);
    const played = probe.move(userSan);
    if (!played) {
      return (
        `Could not apply **${userSan}** to this FEN — send the board **before** the move (castling: O-O / O-O-O).\n\n`
      );
    }
    const userUci = `${played.from}${played.to}${played.promotion ?? ""}`.toLowerCase();
    const mover = played.color === "w" ? "White" : "Black";
    const moverLong: "White" | "Black" = mover;
    const nextToMove = probe.turn() === "w" ? "White" : "Black";

    const ev = await stockfish.evaluate(fen, OFFLINE_SF_DEPTH, OFFLINE_SF_MS);
    const best = ev.bestMove?.toLowerCase() ?? "";
    const depth = ev.depth;
    const evalSentence = evalBlurb(ev.evaluation, moverLong);

    const matches =
      best &&
      (userUci === best ||
        (userUci.slice(0, 4) === best.slice(0, 4) && userUci.length >= 4 && best.length >= 4));

    if (matches) {
      return (
        `**${mover}** played **${played.san}** — Stockfish's top try at depth ${depth}; ${evalSentence}. ` +
        `**${nextToMove}** to move.\n\n`
      );
    }
    if (best) {
      return (
        `**${mover}** played **${played.san}**; the engine's first pick was **${best}** (depth ${depth}). ` +
        `${evalSentence}. **${nextToMove}** is on the clock — compare follow-ups for both moves in analysis.\n\n`
      );
    }
    return `**${mover}** played **${played.san}** — quick engine read to depth ${depth} with no clean best line. **${nextToMove}** moves.\n\n`;
  } catch {
    return null;
  }
}

/**
 * Topical answers for conversational chess questions when no LLM is
 * available. Keyed on a regex matched against the user's message.
 * Each answer is meant to be a real 1–3 sentence response with one
 * follow-up drill link, not a "send me a FEN" deflection.
 */
const TOPIC_REPLIES: { match: RegExp; reply: string }[] = [
  {
    match: /\btal\b.*\b(bishop pair|two bishops)\b|\b(bishop pair|two bishops)\b.*\btal\b/i,
    reply:
      "Tal treated the bishop pair as an attacking weapon, not a long-term plus: he'd open the position with pawn breaks, aim both bishops at the king (often via a long diagonal), and use the second bishop to clear blockaders for a sacrifice. Drill the attacking patterns in [Tactics](/training/tactics) or [Checkmate Patterns](/training/checkmate-patterns).",
  },
  {
    match: /\btal\b|\bmikhail tal\b/i,
    reply:
      "Tal's style is concrete sacrifice-first chess: provoke weaknesses, then throw pieces at the king to keep the defender calculating under time pressure. He cared more about practical chances than perfect evaluation. Sharpen the same skill in [Tactics](/training/tactics) and [Calculation Studio](/training/calculation-studio).",
  },
  {
    match: /\bcapablanca\b|\bcapa\b/i,
    reply:
      "Capablanca's superpower was simplification — trade into a position your opponent can't draw, then convert with flawless technique. Watch for endings a tempo or a square ahead and grind from there. Build the same touch in [Endgame](/training/endgame) and [Advantage Conversion](/training/advantage).",
  },
  {
    match: /\bpetrosian\b/i,
    reply:
      "Petrosian prevents threats *before* they exist: he plans the opponent's attack for them and quietly removes every piece that would join in, often with exchange sacs. Train this in [Defender](/training/defender) and [Intuition](/training/intuition).",
  },
  {
    match: /\b(why|reason).{0,30}\b(1\.?\s*e4|e4).{0,40}\b(stronger|better|good).*\b(h4|1\.?\s*h4)\b|\b1\.?\s*e4\b.*\bvs\b.*\b1\.?\s*h4\b/i,
    reply:
      "1.e4 fights for the center, opens lines for the bishop and queen, and lets the king's-knight develop with tempo. 1.h4 does none of those — it loses a tempo on the rim and gives Black a free hand in the middle of the board. Reinforce opening principles with the [Opening Improver](/training/opening-improver).",
  },
  {
    match: /\b1\.?\s*e4\b|\bking'?s pawn\b|\bopen game\b/i,
    reply:
      "1.e4 stakes a central pawn, frees the king-bishop, and aims for fast development — that's why it's been the most-played first move for two centuries. Branch into the [Opening Improver](/training/opening-improver) to learn book reps for your favorite reply.",
  },
  {
    match: /\bblunder.{0,40}\bqueen\b|\b(time scramble|time trouble)\b|\b(stop|avoid).{0,30}\bblunder\b/i,
    reply:
      "In time scrambles, fall back to a 3-step checklist: (1) is my last move safe? (2) what is opponent's threat? (3) one move I'd play if forced now. Drill the discipline directly in [Time Pressure](/training/time-pressure) and [Blunder Prevention](/training/blunder-preventer).",
  },
  {
    match: /\b(endgame|king and pawn|opposition|lucena|philidor)\b/i,
    reply:
      "Most endgames you'll hit below 2000 are K+P races and R+P holds. Memorize the key squares + opposition for pawn endings, and the Lucena/Philidor positions for rook endings. Drill in [Endgame](/training/endgame).",
  },
  {
    match: /\b(visualiz|calcul)/i,
    reply:
      "Calculation is muscle, not magic: train short blindfold lines daily and force yourself to verbalize each move before playing it. Step up gradually in [Calculation Ladder](/training/calculation-ladder) and full blindfold sets in [Calculation Studio](/training/calculation-studio).",
  },
  {
    match: /\b(opening|repertoire|book|theory)\b/i,
    reply:
      "For openings, pick one mainline reply to 1.e4 and one to 1.d4, drill the first 8–10 moves, and only then memorize sidelines. Build the deck in [Repertoire Trainer](/training/repertoire), then sharpen with [Opening Improver](/training/opening-improver).",
  },
  {
    match: /\b(tactic|puzzle|fork|pin|skewer|discovered|mate in)\b/i,
    reply:
      "Best tactical ROI is mate patterns + simple forks: a 20-puzzle daily set keeps the muscle warm. Use [Tactics](/training/tactics) for rated reps, [Checkmate Patterns](/training/checkmate-patterns) for the named motifs.",
  },
  {
    match: /\b(plan|strategy|middlegame|pawn structure)\b/i,
    reply:
      "Strategy starts from the pawn structure: identify your weak square, your opponent's weak square, and which minor piece exploits each. Train it in [Pawn Structures](/training/pawn-structures) and [Plan Finder](/training/plans).",
  },
];

function topicalAnswer(userMessage: string): string | null {
  const text = userMessage.trim();
  if (text.length === 0) return null;
  for (const { match, reply } of TOPIC_REPLIES) {
    if (match.test(text)) return reply;
  }
  return null;
}

export async function* iterOfflineCoachReply(params: {
  userMessage: string;
  fen?: string;
  weak: WeaknessRow[] | null;
  /** When set (e.g. from `/api/coach/chat`), skips regex extraction from `userMessage`. */
  targetSan?: string | null;
  context?: "play" | "default";
  playerColor?: "white" | "black";
}): AsyncGenerator<string, void, void> {
  if (params.context === "play") {
    yield* iterPlayCoachReply({
      userMessage: params.userMessage,
      fen: params.fen,
      targetSan: params.targetSan,
      playerColor: params.playerColor,
    });
    return;
  }

  const chunks: string[] = [];

  // 1. FEN + SAN → engine note. Highest-signal reply when the user is
  //    in Analysis or just played a move.
  const san = params.targetSan?.trim() || extractPlayedSan(params.userMessage);
  if (params.fen && san) {
    const para = await engineMoveParagraph(params.fen, san);
    if (para) chunks.push(para);
  } else if (params.fen) {
    try {
      const chess = new Chess(params.fen);
      const side = chess.turn() === "w" ? "White" : "Black";
      const ev = await stockfish.evaluate(params.fen, OFFLINE_SF_DEPTH, OFFLINE_SF_MS);
      if (ev.bestMove) {
        chunks.push(
          `${side} to move — Stockfish suggests **${ev.bestMove}** (depth ${ev.depth}). Name a SAN if you want it graded against that line.\n\n`,
        );
      }
    } catch {
      /* ignore */
    }
  }

  // 2. No engine note — give a real conversational answer if the
  //    message matches a topical pattern (Tal/Capa/Petrosian, openings,
  //    blunders, calculation, etc.). This is what the landing-page
  //    CoachPreview hits.
  if (chunks.length === 0) {
    const topical = topicalAnswer(params.userMessage);
    if (topical) chunks.push(`${topical}\n\n`);
  }

  // 3. Weakness pointer, if we have one and there's still room.
  if (params.weak && params.weak.length > 0 && chunks.length < 2) {
    const w = params.weak[0];
    chunks.push(
      `Training note: **${w.name}** has been shaky (${w.accuracyPct}% / ${w.attempts} tries) — [drill it](${w.href}).\n\n`,
    );
  }

  // 4. Last-resort prompt.
  if (chunks.length === 0) {
    chunks.push(
      "Tell me what you're working on — an opening, a tactical theme, a player you want to scout — and I'll point you at the right drill.\n\n",
    );
    chunks.push("Drills: [Tactics](/training/tactics) · [360 trainer](/training/360).\n");
  }

  for (const c of chunks) {
    yield c;
  }
}
