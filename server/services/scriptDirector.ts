/**
 * Long-form hybrid script (≈22–28 min): hook, opening ideas, per-move prose,
 * engine key dives, summaries, outro. Emits packed caption segments + board timing.
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import type { LibraryGame } from "../../shared/schema.js";
import type { NarrationCaption } from "./narration.js";
import {
  collectPlyHints,
  pickHintPlies,
  type PlyEngineHint,
  type TimelinePosLite,
} from "./watchCommentary.js";

/** Bump when script logic changes (timeline cache invalidation). */
export const SCRIPT_DIRECTOR_VERSION = 1;

const TARGET_MIN_S = 22 * 60;
const TARGET_MAX_S = 28 * 60;
const TARGET_MID_S = (TARGET_MIN_S + TARGET_MAX_S) / 2;

export interface TimelinePositionFull {
  fen: string;
  san: string;
  uci?: string;
  evalCp?: number | null;
  mateIn?: number | null;
  bestMoveUci?: string | null;
  alternates?: {
    uci: string;
    san?: string;
    cp?: number | null;
    mateIn?: number | null;
    pvSan?: string;
  }[];
}

interface ScriptSegment {
  displayPly: number;
  /** Narration / caption */
  text: string;
  kind: NonNullable<NarrationCaption["kind"]>;
  /** Wall-clock duration before audio stretch (seconds). */
  durationS: number;
  /** Logical ply for captions (may match displayPly). */
  ply: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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

function pvToSanShort(fen: string, pvUci: string[], maxPlies = 3): string {
  const parts: string[] = [];
  try {
    const c = new Chess();
    c.load(fen);
    const tokens = pvUci.join(" ").trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < Math.min(maxPlies * 2, tokens.length); i++) {
      const t = tokens[i]!;
      if (t.length < 4) continue;
      const from = t.slice(0, 2);
      const to = t.slice(2, 4);
      const promotion = t.length > 4 ? (t[4] as "q" | "r" | "b" | "n") : undefined;
      const m = c.move({ from, to, promotion });
      if (m) parts.push(m.san);
    }
  } catch {
    /* ignore */
  }
  return parts.join(" ");
}

function loadHistory(game: LibraryGame): { san: string }[] {
  try {
    const c = new Chess();
    c.loadPgn(game.pgn, { strict: false });
    return c.history({ verbose: true }).map((m) => ({ san: m.san }));
  } catch {
    return [];
  }
}

function positionsFromGame(game: LibraryGame): TimelinePositionFull[] {
  try {
    const c = new Chess();
    c.loadPgn(game.pgn, { strict: false });
    const verbose = c.history({ verbose: true });
    const replay = new Chess();
    const out: TimelinePositionFull[] = [{ fen: replay.fen(), san: "", uci: undefined }];
    for (const m of verbose) {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      const uci = `${m.from}${m.to}${m.promotion ?? ""}`;
      out.push({ fen: replay.fen(), san: m.san, uci });
    }
    return out;
  } catch {
    return [{ fen: new Chess().fen(), san: "" }];
  }
}

function titleFor(g: LibraryGame): string {
  return `${g.whitePlayer ?? "?"} vs ${g.blackPlayer ?? "?"}`;
}

function subtitleFor(g: LibraryGame): string | undefined {
  const parts: string[] = [];
  if (g.event) parts.push(g.event);
  if (g.playedAt) parts.push(new Date(g.playedAt).getFullYear().toString());
  if (g.eco) parts.push(`ECO ${g.eco}`);
  if (g.opening) parts.push(g.opening);
  return parts.length ? parts.join(" · ") : undefined;
}

function describeSan(san: string): string {
  if (!san) return "the position";
  if (san.includes("x")) return "a capture that reshapes the pawn skeleton";
  if (san.endsWith("+") || san.endsWith("#")) return "forcing the king to answer immediately";
  if (san.startsWith("O-O")) return "castling to tuck the king away and connect the rooks";
  if (/^[NBRQK]/.test(san)) return "a piece hop that improves coordination or creates threats";
  if (san === san.toLowerCase()) return "a pawn stab that contests the center or flanks";
  return "a purposeful developing idea";
}

function pieceCountFromFen(fen: string): { wq: boolean; bq: boolean; pcs: number } {
  const board = fen.split(" ")[0] ?? "";
  const wq = board.includes("Q");
  const bq = board.includes("q");
  const letters = board.replace(/[^a-zA-Z]/g, "");
  return { wq, bq, pcs: letters.length };
}

export interface ScriptDirectorResult {
  positions: TimelinePositionFull[];
  captions: NarrationCaption[];
  plyTimeStarts: number[];
  introEndS: number;
  outroStartS: number;
  totalDurationS: number;
  /** Uniform seconds per ply for legacy scrubber math (derived). */
  perMoveSecondsAt1x: number;
  introHoldS: number;
  outroHoldS: number;
  plyCount: number;
  criticalPlies: number[];
}

export async function buildScript(
  game: LibraryGame,
  opts: { targetDurationS?: number } = {},
): Promise<ScriptDirectorResult> {
  const positions = positionsFromGame(game);
  const history = loadHistory(game);
  const lastPly = Math.max(0, positions.length - 1);
  const targetBand = clamp(
    opts.targetDurationS ?? TARGET_MID_S,
    20 * 60,
    30 * 60,
  );

  const hintPlies = pickHintPlies(lastPly, Math.min(56, Math.max(24, Math.floor(lastPly / 2))));
  const hints = await collectPlyHints(positions as TimelinePosLite[], hintPlies);

  /* Fill eval + best arrow on positions from hints */
  let lastCp: number | null = 0;
  let lastMate: number | null = null;
  try {
    const ev = await stockfish.evaluate(positions[0]!.fen, 6, 2200);
    lastCp = ev.evaluation;
    lastMate = ev.mateIn;
  } catch {
    lastCp = 0;
  }
  positions[0]!.evalCp = positions[0]!.evalCp ?? lastCp;
  positions[0]!.mateIn = positions[0]!.mateIn ?? lastMate;
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i]!;
    const h = hints.get(i);
    if (h) {
      p.evalCp = h.cpAfter;
      p.mateIn = h.mateAfter;
      if (h.playedRank > 1 && h.bestUci.length >= 4) p.bestMoveUci = h.bestUci;
    }
    if (p.evalCp == null && lastCp != null) p.evalCp = lastCp;
    if (p.mateIn == null) p.mateIn = lastMate;
    lastCp = p.evalCp ?? lastCp;
    lastMate = p.mateIn ?? lastMate;
  }

  /* Swing scores at hinted plies */
  const swings: { ply: number; delta: number }[] = [];
  let prevCp = positions[0]?.evalCp ?? 0;
  for (let ply = 1; ply <= lastPly; ply++) {
    const cp = positions[ply]?.evalCp ?? prevCp;
    const d = Math.abs((cp ?? 0) - (prevCp ?? 0));
    if (hints.has(ply)) swings.push({ ply, delta: d });
    prevCp = cp;
  }
  swings.sort((a, b) => b.delta - a.delta);
  const keyDivePlies = new Set(swings.slice(0, 5).map((s) => s.ply));

  /* Key dive: multipv lines */
  const keyDiveText = new Map<number, string>();
  const keyAlternates = new Map<number, PlyEngineHint["altLineLabels"]>();
  for (const ply of keyDivePlies) {
    if (ply < 1 || ply > lastPly) continue;
    const fenBefore = positions[ply - 1]!.fen;
    try {
      const { best, lines } = await stockfish.evaluateAllMoves(fenBefore, 12, 9000);
      const top = lines.filter((l) => l.uci.length >= 4).slice(0, 3);
      const played = positions[ply]?.uci ?? "";
      const playedN = normalizeUci(played);
      let rank = 99;
      for (let i = 0; i < top.length; i++) {
        if (normalizeUci(top[i]!.uci) === playedN) {
          rank = i + 1;
          break;
        }
      }
      const pv0 = top[0]?.pv?.length ? pvToSanShort(fenBefore, top[0]!.pv, 3) : "";
      const pv1 = top[1]?.pv?.length ? pvToSanShort(fenBefore, top[1]!.pv, 2) : "";
      const alts = top.map((l) => {
        const san = sanFromUci(fenBefore, l.uci);
        const lab =
          l.mateIn != null ? `M${Math.abs(l.mateIn)}` : (l.cp / 100).toFixed(1);
        return `${san} (${lab})`;
      });
      keyAlternates.set(ply, alts);
      const bestSan = top[0] ? sanFromUci(fenBefore, top[0]!.uci) : best.bestMove ?? "";
      keyDiveText.set(
        ply,
        rank === 1
          ? `Engine-first choice ${bestSan} matches the game. Main continuation could be: ${pv0 || "…"}. A human sideline to keep in mind: ${pv1 || "the usual alternatives in this structure"}.`
          : `Here the silicon soul prefers ${bestSan} first — in the game we saw ${positions[ply]?.san}. That was roughly rank ${rank} at this search depth. If instead ${bestSan}, a forcing try is ${pv0 || "…"} — worth pausing the video and trying a few replies yourself.`,
      );
    } catch {
      keyDiveText.set(
        ply,
        "Engine deep-dive timed out here — the position is still tactically rich; try moving the pieces yourself on a second board.",
      );
    }
  }

  /* Attach alternates to positions for UI (from hints + key dives) */
  for (let ply = 1; ply <= lastPly; ply++) {
    const fenBefore = positions[ply - 1]!.fen;
    const h = hints.get(ply);
    const pos = positions[ply]!;
    const alts: NonNullable<TimelinePositionFull["alternates"]> = [];
    if (keyAlternates.has(ply)) {
      const labels = keyAlternates.get(ply)!;
      for (let i = 0; i < labels.length; i++) {
        alts.push({ uci: "", san: labels[i], pvSan: labels[i] });
      }
    } else if (h?.altLineLabels?.length) {
      for (const lab of h.altLineLabels.slice(0, 3)) {
        alts.push({ uci: "", san: lab, pvSan: lab });
      }
    }
    if (h?.bestUci && h.bestUci.length >= 4) {
      pos.alternates = [
        {
          uci: h.bestUci,
          san: h.bestSan,
          cp: h.cpAfter,
          mateIn: h.mateAfter,
          pvSan: pvToSanShort(fenBefore, [h.bestUci], 3),
        },
        ...alts.filter((a) => a.san && !a.san.startsWith(h.bestSan)),
      ].slice(0, 3);
    } else if (alts.length) pos.alternates = alts.slice(0, 3);
  }

  const segments: ScriptSegment[] = [];
  const white = game.whitePlayer ?? "White";
  const black = game.blackPlayer ?? "Black";
  const opening = game.opening ?? game.eco ?? "this opening";

  segments.push({
    displayPly: 0,
    ply: 0,
    kind: "intro",
    durationS: 14,
    text: `Welcome back to the channel. Today we're walking through ${titleFor(game)} — ${subtitleFor(game) ?? "a complete game worth your time"}. Grab tea; we'll explain every move and zoom in when the bar swings hard.`,
  });

  segments.push({
    displayPly: 0,
    ply: 0,
    kind: "phase",
    durationS: 42,
    text: `Opening context: we're looking at ${opening}. ${white} and ${black} both want the middle — watch how small pawn choices echo twenty moves later.`,
  });

  let phaseFlag = "opening";
  for (let ply = 1; ply <= lastPly; ply++) {
    const m = history[ply - 1];
    if (!m) continue;
    const side = ply % 2 === 1 ? white : black;
    const moveNo = Math.ceil(ply / 2);
    const { wq, bq, pcs } = pieceCountFromFen(positions[ply]!.fen);
    if (phaseFlag === "opening" && (!wq || !bq || ply > 26)) {
      phaseFlag = "middlegame";
      segments.push({
        displayPly: Math.max(0, ply - 1),
        ply,
        kind: "phase",
        durationS: 8,
        text: !wq || !bq
          ? "Queens have left the stage — welcome to a sharper middlegame where rooks wake up."
          : "We're sliding from theory into independent middlegame plans.",
      });
    }
    if (phaseFlag === "middlegame" && pcs <= 12 && ply > 30) {
      phaseFlag = "endgame";
      segments.push({
        displayPly: Math.max(0, ply - 1),
        ply,
        kind: "phase",
        durationS: 8,
        text: "Material is melting — this is endgame technique territory now.",
      });
    }

    const hint = hints.get(ply);
    let moveText = `${side} (${moveNo}.) plays ${m.san}: ${describeSan(m.san)}.`;
    if (hint) {
      if (hint.playedRank === 1) {
        moveText += ` The engine lines up behind ${hint.bestSan} — principled chess.`;
      } else {
        moveText += ` Silicon would nudge ${hint.bestSan} first; on the board we got ${m.san}, still a human try at rank ${hint.playedRank}.`;
      }
      if (hint.altLineLabels.length) {
        moveText += ` Other roads: ${hint.altLineLabels.slice(0, 2).join("; ")}.`;
      }
    }

    segments.push({
      displayPly: ply,
      ply,
      kind: "move",
      durationS: 12,
      text: moveText,
    });

    if (keyDivePlies.has(ply) && keyDiveText.has(ply)) {
      segments.push({
        displayPly: ply,
        ply,
        kind: "key",
        durationS: 48,
        text: keyDiveText.get(ply)!,
      });
    }

    if (ply % 8 === 0 && ply < lastPly) {
      segments.push({
        displayPly: ply,
        ply,
        kind: "info",
        durationS: 12,
        text: `Mini checkpoint after ${moveNo} full moves: both sides have shown their cards — notice how the pawn breaks and open files are shaping the rest of the game.`,
      });
    }
  }

  segments.push({
    displayPly: lastPly,
    ply: lastPly,
    kind: "outro",
    durationS: 24,
    text: `That wraps ${titleFor(game)} — final mark ${game.result ?? "*"}. If you enjoyed the long-form pace, export an MP4 from Studio and drop a comment with which classic you want next.`,
  });

  /* Hybrid scale toward targetBand */
  let sum = segments.reduce((s, g) => s + g.durationS, 0);
  const scaleToward = (factor: number) => {
    for (const g of segments) {
      if (g.kind === "key") g.durationS = clamp(g.durationS * factor, 36, 72);
      else if (g.kind === "move") g.durationS = clamp(g.durationS * factor, 7, 28);
      else if (g.kind === "intro" || g.kind === "outro")
        g.durationS = clamp(g.durationS * factor, 12, 40);
      else g.durationS = clamp(g.durationS * factor, 6, 55);
    }
    sum = segments.reduce((s, g) => s + g.durationS, 0);
  };
  let guard = 0;
  while (sum < TARGET_MIN_S && guard++ < 40) scaleToward(1.08);
  guard = 0;
  while (sum > TARGET_MAX_S && guard++ < 40) scaleToward(0.92);
  /* Nudge toward user target if inside 20–30 window */
  if (sum < targetBand - 60) scaleToward(1.05);
  if (sum > targetBand + 60) scaleToward(0.95);

  /* Pack captions + ply breakpoints (first second each FEN appears). */
  const captions: NarrationCaption[] = [];
  const plyTimeStarts: number[] = Array.from({ length: lastPly + 1 }, () => Number.POSITIVE_INFINITY);
  plyTimeStarts[0] = 0;
  let t = 0;
  for (const seg of segments) {
    const tStart = t;
    const tEnd = t + seg.durationS;
    captions.push({
      tStart,
      tEnd,
      ply: seg.ply,
      kind: seg.kind,
      text: seg.text,
    });
    const dp = clamp(seg.displayPly, 0, lastPly);
    plyTimeStarts[dp] = Math.min(plyTimeStarts[dp]!, tStart);
    t = tEnd;
  }
  /* Monotonic: board never jumps backward in time */
  for (let i = 1; i <= lastPly; i++) {
    const v = plyTimeStarts[i]!;
    plyTimeStarts[i] = Number.isFinite(v)
      ? Math.max(plyTimeStarts[i - 1]!, v)
      : plyTimeStarts[i - 1]!;
  }

  const totalDurationS = t;
  const introEndS = Math.min(plyTimeStarts[1] ?? 18, totalDurationS * 0.05 + 12);
  const outroSeg = segments[segments.length - 1]!;
  const outroStartS = totalDurationS - outroSeg.durationS;

  const introHoldS = introEndS;
  const outroHoldS = totalDurationS - outroStartS;
  const perMoveSecondsAt1x =
    lastPly > 0 ? (totalDurationS - introHoldS - outroHoldS) / lastPly : totalDurationS;

  const criticalPlies = [...keyDivePlies].sort((a, b) => a - b);

  return {
    positions,
    captions,
    plyTimeStarts,
    introEndS,
    outroStartS,
    totalDurationS,
    perMoveSecondsAt1x,
    introHoldS,
    outroHoldS,
    plyCount: lastPly,
    criticalPlies,
  };
}
