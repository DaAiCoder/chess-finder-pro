/**
 * Time-Pressure Simulator picks positions from the user's blitz losses
 * where engine eval swung by >=150 cp during the user's clock-pressure
 * phase (move >= 25 in fast time controls).
 *
 * When the user has no analysed blitz blunders we fall back to a
 * "blunder-preventer" training problem with a 30-second timer so the
 * UX is functional on a fresh account.
 *
 * For both branches we attach a Stockfish-derived `bestMoveSan`,
 * `engineLine` (the principal variation as SAN), and a generated
 * `explanation` so the UI can tell the user *why* the best move is
 * best — not just "the engine wanted X". The explanation combines:
 *   - the move's tactical character (capture / check / mate / promotion /
 *     castles)
 *   - the eval delta vs the runner-up move
 *   - the existing training-problem explanation when present (fallback
 *     branch).
 */

import { Chess } from "chess.js";
import { storage } from "../storage.js";
import { stockfish } from "./stockfish.js";
import type { TrainingProblem } from "../../shared/schema.js";

export interface TimePressureProblem {
  fen: string;
  /** SAN moves that came BEFORE the position, replayed at original tempo. */
  preface: string[];
  /** SAN sequence the user needs to find. Single element for live-game picks. */
  solution: string[];
  /** Seconds on the user's clock when the position arose. */
  clockSeconds: number;
  /** Optional reference to the source game / problem. */
  source: { kind: "game"; gameId: number } | { kind: "problem"; problemId: number };
  /** Brief context line for the UI. */
  context: string;
  /** Engine's preferred move in SAN. */
  bestMoveSan: string | null;
  /** Principal variation (engine line) as SAN moves. */
  engineLine: string[];
  /** Eval (centipawns from side-to-move's POV) after the best move. */
  evalAfterBest: number | null;
  /** Mate distance (positive = side-to-move mates) or null. */
  mateIn: number | null;
  /** Eval gap vs runner-up. Positive means clear best move. */
  evalGap: number | null;
  /** Human-readable explanation of *why* the best move is best. */
  explanation: string;
}

const FAST_TC = new Set(["bullet", "blitz", "3+0", "3+2", "5+0", "5+3"]);

/** UCI like "e2e4" / "e7e8q" → SAN, or null if invalid. */
function uciToSan(fen: string, uci: string): string | null {
  if (!uci || uci.length < 4) return null;
  try {
    const ch = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length >= 5 ? uci[4] : undefined;
    const mv = ch.move({ from, to, promotion: promo });
    return mv?.san ?? null;
  } catch {
    return null;
  }
}

/** Convert a UCI PV to SAN, replaying on a Chess instance. */
function pvToSan(fen: string, pv: string[], maxPlies = 6): string[] {
  const out: string[] = [];
  try {
    const ch = new Chess(fen);
    for (const uci of pv.slice(0, maxPlies)) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length >= 5 ? uci[4] : undefined;
      const mv = ch.move({ from, to, promotion: promo });
      if (!mv) break;
      out.push(mv.san);
    }
  } catch {
    /* swallow — partial PV is still useful */
  }
  return out;
}

/**
 * Generate a short, human-readable rationale for why `bestSan` is the
 * engine's pick from `fen`.
 *
 * The explanation is layered:
 *   1. Tactical surface: mate? capture? check? promotion? castles?
 *   2. Eval delta to the runner-up (if known): "clearly best" vs
 *      "marginal preference".
 *   3. The engine line: "Engine plans 1...Bxh2+ 2.Kxh2 Qh4+ 3.Kg1 Qxf2#".
 *   4. Optional extra context the caller passes in (e.g. the problem's
 *      curated explanation).
 */
function buildExplanation(opts: {
  fen: string;
  bestSan: string;
  bestUci: string;
  engineLineSan: string[];
  evalAfter: number;
  mateIn: number | null;
  evalGap: number | null;
  extra?: string | null;
}): string {
  const { fen, bestSan, bestUci, engineLineSan, evalAfter, mateIn, evalGap, extra } = opts;
  const parts: string[] = [];

  // 1. Move character — derive from the move itself rather than parsing
  //    the SAN string (parsing SAN is brittle once we get to disambiguations).
  let character = "";
  try {
    const ch = new Chess(fen);
    const from = bestUci.slice(0, 2);
    const to = bestUci.slice(2, 4);
    const promo = bestUci.length >= 5 ? bestUci[4] : undefined;
    const piece = ch.get(from as any);
    const target = ch.get(to as any);
    const mv = ch.move({ from, to, promotion: promo });
    if (mv) {
      const pieceName = pieceLongName(piece?.type);
      const traits: string[] = [];
      if (mv.flags.includes("k") || mv.flags.includes("q")) {
        traits.push(mv.flags.includes("k") ? "castles short" : "castles long");
      } else if (mv.flags.includes("p")) {
        traits.push(`promotes to a ${pieceLongName(mv.promotion)}`);
      } else if (target) {
        traits.push(`captures ${pieceLongName(target.type)} on ${to}`);
      } else {
        traits.push(`brings the ${pieceName} to ${to}`);
      }
      if (ch.isCheckmate()) traits.push("delivering checkmate");
      else if (ch.isCheck()) traits.push("with check");
      character = `${bestSan} ${traits.join(", ")}.`;
    }
  } catch {
    character = `${bestSan} is the engine's pick.`;
  }
  parts.push(character);

  // 2. How decisive — eval / mate / gap framing.
  if (mateIn !== null && mateIn !== 0) {
    parts.push(
      `Mate in ${Math.abs(mateIn)} ply${Math.abs(mateIn) === 1 ? "" : "s"} — every other move loses the win.`,
    );
  } else if (evalGap !== null && evalGap >= 200) {
    parts.push(`Clearly best — it scores ${formatCp(evalGap)} better than any alternative.`);
  } else if (evalGap !== null && evalGap >= 60) {
    parts.push(`Best by ${formatCp(evalGap)} — the runner-up is real but worse.`);
  } else if (evalGap !== null) {
    parts.push(`Only slightly preferred (${formatCp(evalGap)} over the second choice) — other moves keep the position too.`);
  }

  // 3. Engine continuation.
  if (engineLineSan.length > 1) {
    parts.push(`Engine plans: ${formatLineWithNumbers(fen, engineLineSan)}.`);
  }

  // 4. After-eval framing (only when not mate).
  if (mateIn === null || mateIn === 0) {
    const cpOwn = evalAfter;
    if (Math.abs(cpOwn) >= 50) {
      const advLabel =
        cpOwn >= 300
          ? "decisive advantage"
          : cpOwn >= 150
            ? "clear advantage"
            : cpOwn >= 50
              ? "edge"
              : cpOwn <= -300
                ? "lost position"
                : cpOwn <= -150
                  ? "clearly worse"
                  : "slightly worse";
      parts.push(
        `Resulting eval: ${formatCp(cpOwn)} (${advLabel} for the side to move).`,
      );
    }
  }

  // 5. Curated bonus context (only kept if it adds something the rest
  //    didn't already say).
  if (extra && extra.trim().length > 0 && !parts.some((p) => p.includes(extra.trim()))) {
    parts.push(extra.trim());
  }

  return parts.join(" ");
}

function pieceLongName(t?: string | null): string {
  switch (t) {
    case "p": return "pawn";
    case "n": return "knight";
    case "b": return "bishop";
    case "r": return "rook";
    case "q": return "queen";
    case "k": return "king";
    default:  return "piece";
  }
}

function formatCp(cp: number): string {
  // Centipawns → pawn-units string, like "+1.27" or "-0.65".
  const v = cp / 100;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function formatLineWithNumbers(fen: string, sans: string[]): string {
  const whiteToMove = fen.split(" ")[1] === "w";
  // Try to read the full move number from the FEN tail (fullmove counter).
  const tail = fen.split(" ");
  const startNumber = Number(tail[tail.length - 1] ?? "1") || 1;
  const out: string[] = [];
  let n = startNumber;
  let i = 0;
  if (!whiteToMove && sans.length > 0) {
    out.push(`${n}...${sans[0]}`);
    n += 1;
    i = 1;
  }
  while (i < sans.length) {
    const w = sans[i];
    const b = sans[i + 1];
    if (b) out.push(`${n}.${w} ${b}`);
    else out.push(`${n}.${w}`);
    n += 1;
    i += 2;
  }
  return out.join(" ");
}

/** Compute the eval gap between the best move and the runner-up. */
async function bestGap(fen: string): Promise<{
  bestUci: string | null;
  bestCp: number;
  mateIn: number | null;
  pv: string[];
  gap: number | null;
}> {
  try {
    const result = await stockfish.evaluateAllMoves(fen, 10);
    const lines = result.lines;
    if (!lines || lines.length === 0) {
      return { bestUci: null, bestCp: 0, mateIn: null, pv: [], gap: null };
    }
    // Lines are sorted best-first from white's POV in `cp`. Normalise to
    // side-to-move so positive cp = good for the mover.
    const stm = fen.split(" ")[1];
    const flip = stm === "b" ? -1 : 1;
    const ranked = lines
      .map((l) => ({
        uci: l.uci,
        cp: l.cp * flip,
        mateIn:
          l.mateIn == null
            ? null
            : // mateIn is signed positive = white mates. Convert to "side to move
              // mates": positive means good for stm.
              l.mateIn * (stm === "w" ? 1 : -1),
        pv: l.pv,
      }))
      .sort((a, b) => scoreFor(b) - scoreFor(a));
    const best = ranked[0];
    const second = ranked[1];
    const gap = second ? scoreFor(best) - scoreFor(second) : null;
    return {
      bestUci: best.uci,
      bestCp: best.cp,
      mateIn: best.mateIn,
      pv: best.pv,
      gap,
    };
  } catch {
    return { bestUci: null, bestCp: 0, mateIn: null, pv: [], gap: null };
  }
}

/** Score that orders moves from the mover's POV (mate wins, then high cp). */
function scoreFor(l: { cp: number; mateIn: number | null }): number {
  if (l.mateIn !== null) {
    // Faster mate for the mover beats slower mate. Being mated is worst.
    if (l.mateIn > 0) return 1_000_000 - l.mateIn; // we deliver mate
    if (l.mateIn < 0) return -1_000_000 - l.mateIn; // we get mated
  }
  return l.cp;
}

export async function pickTimePressureProblem(
  userId: number,
): Promise<TimePressureProblem | null> {
  const games = await storage.listGames(userId);
  for (const g of games) {
    if (!g.timeControl || !FAST_TC.has(g.timeControl.toLowerCase())) continue;
    const analysis = await storage.getAnalysisForGame(g.id);
    if (!analysis?.moveAnalysis) continue;
    const moves = Array.isArray(analysis.moveAnalysis)
      ? analysis.moveAnalysis
      : [];
    const userIsWhite = (g.whitePlayer ?? "").toLowerCase() === "dev"; // anon → no match; fine
    // Find a late blunder where eval swung against the user.
    for (let i = 25 * 2; i < moves.length; i++) {
      const m = moves[i] as {
        ply: number;
        san: string;
        fenBefore: string;
        evalBefore: number;
        evalAfter: number;
        isWhite: boolean;
        cpl?: number;
      };
      if (!m || m.isWhite !== userIsWhite) continue;
      const swing = (m.evalAfter - m.evalBefore) * (m.isWhite ? -1 : 1);
      if (swing < 150) continue;
      const prefaceSans: string[] = [];
      const probe = new Chess();
      for (let j = 0; j < i; j++) {
        const pm = moves[j] as { san: string } | undefined;
        if (!pm) break;
        prefaceSans.push(pm.san);
        try { probe.move(pm.san); } catch { /* ignore */ }
      }
      const enriched = await enrichWithEngine(m.fenBefore, null);
      return {
        fen: m.fenBefore,
        preface: prefaceSans,
        solution: enriched.bestMoveSan ? [enriched.bestMoveSan] : [],
        clockSeconds: 30,
        source: { kind: "game", gameId: g.id },
        context: `Replay of your ${g.timeControl} loss vs ${g.blackPlayer ?? g.whitePlayer ?? "opponent"} — find the move you missed.`,
        ...enriched,
      };
    }
  }

  // Fallback: a blunder-preventer problem.
  const fb = await storage.listTrainingProblems({ module: "blunder-preventer" });
  if (fb.length === 0) return null;
  const p: TrainingProblem = fb[Math.floor(Math.random() * fb.length)];
  const sol = Array.isArray(p.solution) ? (p.solution as string[]) : [];
  const enriched = await enrichWithEngine(p.fen, p.explanation ?? null);
  return {
    fen: p.fen,
    preface: [],
    // Prefer the curated solution if the engine and the seed agree, otherwise
    // the engine wins (it's more current than a stored SAN).
    solution: enriched.bestMoveSan ? [enriched.bestMoveSan] : sol,
    clockSeconds: 30,
    source: { kind: "problem", problemId: p.id },
    context:
      "Sample blunder-preventer puzzle. Once you import games we'll replay your own time-trouble misses here.",
    ...enriched,
  };
}

/**
 * Run Stockfish on `fen` and produce the bestMoveSan + PV + explanation.
 * Returns a partial `TimePressureProblem` payload (only the engine-driven
 * fields). If Stockfish is unavailable, returns sensible nulls and a
 * generic explanation so the UI still has something to render.
 */
async function enrichWithEngine(
  fen: string,
  extra: string | null,
): Promise<Pick<TimePressureProblem, "bestMoveSan" | "engineLine" | "evalAfterBest" | "mateIn" | "evalGap" | "explanation">> {
  const { bestUci, bestCp, mateIn, pv, gap } = await bestGap(fen);
  if (!bestUci) {
    return {
      bestMoveSan: null,
      engineLine: [],
      evalAfterBest: null,
      mateIn: null,
      evalGap: null,
      explanation:
        extra ?? "The engine couldn't resolve this position quickly enough — play the move that feels safest.",
    };
  }
  const bestSan = uciToSan(fen, bestUci);
  const engineLineSan = pvToSan(fen, pv, 6);
  const explanation = bestSan
    ? buildExplanation({
        fen,
        bestSan,
        bestUci,
        engineLineSan,
        evalAfter: bestCp,
        mateIn,
        evalGap: gap,
        extra,
      })
    : extra ?? "Engine identified the best move but couldn't translate it.";
  return {
    bestMoveSan: bestSan,
    engineLine: engineLineSan,
    evalAfterBest: bestCp,
    mateIn,
    evalGap: gap,
    explanation,
  };
}
