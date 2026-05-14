/**
 * Narration / commentary generator for the Watch player.
 *
 * Produces a `Caption[]` schema that's consumed verbatim by both the
 * in-app `AnimatedBoardPlayer` and the headless MP4 renderer. Two
 * layers are wired in here:
 *
 *   1. **Rules-based** (default, free, deterministic). Combines the
 *      ECO/opening header, motif detector output, a small Stockfish
 *      eval-swing scan, and phase callouts (opening / middlegame /
 *      endgame). Templated phrasing pool with mild randomization to
 *      keep batches of episodes from sounding identical.
 *
 *   2. **LLM polish** (optional). When `process.env.NARRATION_PROVIDER`
 *      is set to `openai`, the script is run through a single
 *      rewrite-pass so the prose sounds more natural. Off by default —
 *      we never call out unless the user opts in.
 *
 * Captions are aligned to the timeline used by the player: ply 0 sits
 * at the intro hold; each subsequent ply at `introS + (ply-1)*perMoveS`.
 */

import { Chess } from "chess.js";
import { stockfish } from "./stockfish.js";
import { detectMotifsInGame } from "./motifDetector.js";
import { resolveNarrationProvider } from "./narrationProvider.js";
import type { LibraryGame } from "../../shared/schema.js";

export interface NarrationCaption {
  tStart: number;
  tEnd: number;
  ply: number;
  text: string;
  kind?: "intro" | "outro" | "phase" | "move" | "key" | "info";
  /** Pre-rendered edge-tts MP3 URL (server fills when synthesis succeeds). */
  audioUrl?: string;
  audioDurationS?: number;
  audioHash?: string;
}

export interface NarrationOptions {
  /** Seconds the intro card is held. Must match the player's value. */
  introHoldS?: number;
  /** Seconds per ply at 1.0x. Must match the player. */
  perMoveSecondsAt1x?: number;
  /** Seconds the outro card is held. */
  outroHoldS?: number;
  /** Stockfish depth for the critical-move pass. */
  evalDepth?: number;
  /** Cap on how many critical-move callouts to emit. */
  maxCriticalMoves?: number;
  /** Cap on how many motif callouts to emit. */
  maxMotifCallouts?: number;
  /** Pass through to LLM rewrite. Off by default. */
  llmPolish?: boolean;
}

export interface NarrationResult {
  captions: NarrationCaption[];
  /** Number of plies the narration was generated over. */
  plyCount: number;
  /** Total timeline duration the captions span (matches the player). */
  totalDurationS: number;
  /** Index of plies the rules-based detector flagged as critical. */
  criticalPlies: number[];
}

const DEFAULT_OPTS: Required<Omit<NarrationOptions, "llmPolish">> & {
  llmPolish: boolean;
} = {
  introHoldS: 2.5,
  perMoveSecondsAt1x: 1.6,
  outroHoldS: 3.5,
  evalDepth: 10,
  maxCriticalMoves: 6,
  maxMotifCallouts: 8,
  llmPolish: false,
};

/* ---------------------------------------------------------------------- */
/* Phrasing pools                                                         */
/* ---------------------------------------------------------------------- */

const INTRO_TEMPLATES = [
  (g: LibraryGame) =>
    `Today: ${asPlayer(g.whitePlayer)} versus ${asPlayer(g.blackPlayer)}${g.event ? `, from ${g.event}` : ""}.`,
  (g: LibraryGame) =>
    `${asPlayer(g.whitePlayer)} has the white pieces against ${asPlayer(g.blackPlayer)}${g.playedAt ? ` in ${new Date(g.playedAt).getFullYear()}` : ""}.`,
  (g: LibraryGame) =>
    `A modern classic — ${asPlayer(g.whitePlayer)} faces ${asPlayer(g.blackPlayer)}.`,
];

const OPENING_TEMPLATES = [
  (name: string) => `They head into the ${name}.`,
  (name: string) => `${name} — a tried and tested choice.`,
  (name: string) => `The ${name} hits the board.`,
];

const PHASE_TEMPLATES = {
  middlegame: [
    "The pieces are out — now the real fight begins.",
    "Out of the opening, both sides are ready to commit.",
    "We move into the middlegame, where calculation takes over.",
  ],
  endgame: [
    "Material has thinned out. Welcome to the endgame.",
    "With queens off the board, technique decides the result.",
    "An endgame now — every pawn matters.",
  ],
};

const SWING_TEMPLATES = {
  blunder: [
    "That's a serious mistake — the evaluation jumps.",
    "A misstep here, and the position shifts hard.",
    "This move lets the opponent right back in.",
  ],
  brilliancy: [
    "A brilliant move! The evaluation tips decisively.",
    "Exactly what was needed — the position is now winning.",
    "A precise blow, and the silicon agrees.",
  ],
  mate: [
    "Mate is in the air.",
    "There's forced mate from here.",
    "The king is in a net — mate is unavoidable.",
  ],
};

const MOTIF_TEMPLATES: Record<string, string[]> = {
  fork: ["Watch the fork.", "A classic fork lands."],
  "royal-fork": [
    "A royal fork — king and queen at once.",
    "Royal fork! Both heavy pieces attacked.",
  ],
  pin: ["A pin is set up.", "That piece is pinned to a heavier one."],
  skewer: ["A skewer — the bigger piece has to move.", "Skewer tactic."],
  "discovered-attack": ["A discovered attack appears.", "Discovered hit."],
  "discovered-check": ["Discovered check — the moving piece reveals it."],
  "double-check": ["Double check! Only a king move helps."],
  "back-rank": ["Back-rank mate motif is alive.", "The back rank is fatal."],
  "hanging-piece": ["A piece is hanging.", "An unprotected piece sits exposed."],
  "passed-pawn": ["A passed pawn becomes a major asset."],
};

const RESULT_OUTRO: Record<string, string[]> = {
  "1-0": ["White wins.", "A win for White."],
  "0-1": ["Black takes the point.", "Black wins."],
  "1/2-1/2": ["The game is drawn.", "Honors are even — a draw."],
};

/* ---------------------------------------------------------------------- */
/* Public API                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Generate captions for a library game. The returned timeline shares
 * the timing math with `AnimatedBoardPlayer` so they stay in lockstep.
 */
export async function generateNarration(
  game: LibraryGame,
  options: NarrationOptions = {},
): Promise<NarrationResult> {
  const opts = { ...DEFAULT_OPTS, ...options };
  const captions: NarrationCaption[] = [];
  const criticalPlies: number[] = [];

  const tForPly = (ply: number): number =>
    ply === 0 ? 0 : opts.introHoldS + (ply - 1) * opts.perMoveSecondsAt1x;

  // Replay PGN once to know ply count + history.
  let plyCount = 0;
  let history: { from: string; to: string; promotion?: string; san: string }[] = [];
  try {
    const c = new Chess();
    c.loadPgn(game.pgn, { strict: false });
    history = c.history({ verbose: true });
    plyCount = history.length;
  } catch {
    plyCount = game.plyCount ?? 0;
  }

  const totalDurationS =
    opts.introHoldS + opts.perMoveSecondsAt1x * Math.max(0, plyCount) + opts.outroHoldS;

  /* --------------------- 1. Intro card narration --------------------- */
  const intro = pick(INTRO_TEMPLATES)(game);
  captions.push({
    tStart: 0,
    tEnd: opts.introHoldS,
    ply: 0,
    kind: "intro",
    text: intro,
  });

  /* --------------------- 2. Opening / phase callouts ------------------ */
  if (game.opening) {
    const t = tForPly(1);
    captions.push({
      tStart: t,
      tEnd: t + opts.perMoveSecondsAt1x * 1.5,
      ply: 1,
      kind: "phase",
      text: pick(OPENING_TEMPLATES)(game.opening),
    });
  }
  // Middlegame at move ~12 (ply 24) — if the game lasts that long.
  if (plyCount >= 24) {
    const ply = 24;
    const t = tForPly(ply);
    captions.push({
      tStart: t,
      tEnd: t + opts.perMoveSecondsAt1x * 1.5,
      ply,
      kind: "phase",
      text: pick(PHASE_TEMPLATES.middlegame),
    });
  }
  // Endgame trigger: when material first drops below 14 (queens + 2
  // minors-ish). Computed via simple piece count.
  const endgamePly = firstEndgamePly(history);
  if (endgamePly != null && endgamePly < plyCount) {
    const t = tForPly(endgamePly);
    captions.push({
      tStart: t,
      tEnd: t + opts.perMoveSecondsAt1x * 1.5,
      ply: endgamePly,
      kind: "phase",
      text: pick(PHASE_TEMPLATES.endgame),
    });
  }

  /* --------------------- 3. Critical moves (eval-swing scan) ---------- */
  try {
    const critical = await scanCriticalMoves(history, opts.evalDepth);
    const top = critical.slice(0, opts.maxCriticalMoves);
    for (const c of top) {
      criticalPlies.push(c.ply);
      const t = tForPly(c.ply);
      const text =
        c.kind === "mate"
          ? pick(SWING_TEMPLATES.mate)
          : c.kind === "blunder"
            ? pick(SWING_TEMPLATES.blunder)
            : pick(SWING_TEMPLATES.brilliancy);
      captions.push({
        tStart: t,
        tEnd: t + opts.perMoveSecondsAt1x * 1.5,
        ply: c.ply,
        kind: "key",
        text: `${c.san}: ${text}`,
      });
    }
  } catch {
    // Engine unavailable — skip critical-move pass, the rules-based
    // commentary still gives a usable narration.
  }

  /* --------------------- 4. Motif callouts --------------------------- */
  try {
    const motifs = detectMotifsInGame(game.pgn);
    const seen = new Set<string>();
    let used = 0;
    for (const m of motifs) {
      if (used >= opts.maxMotifCallouts) break;
      const key = m.motifKey;
      const tmpl = MOTIF_TEMPLATES[key];
      if (!tmpl) continue;
      const id = `${key}:${m.ply}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const t = tForPly(m.ply);
      captions.push({
        tStart: t + 0.2,
        tEnd: t + opts.perMoveSecondsAt1x * 1.2,
        ply: m.ply,
        kind: "move",
        text: pick(tmpl),
      });
      used++;
    }
  } catch {
    /* ignore — motifs are best-effort */
  }

  /* --------------------- 5. Outro card narration --------------------- */
  const result = (game.result ?? "*") as keyof typeof RESULT_OUTRO;
  const outroText = RESULT_OUTRO[result]
    ? pick(RESULT_OUTRO[result])
    : "The game ends.";
  captions.push({
    tStart: opts.introHoldS + opts.perMoveSecondsAt1x * Math.max(0, plyCount),
    tEnd: totalDurationS,
    ply: plyCount,
    kind: "outro",
    text: outroText,
  });

  /* --------------------- 6. Sort + dedupe overlapping tStart --------- */
  captions.sort((a, b) => a.tStart - b.tStart);
  const dedup: NarrationCaption[] = [];
  for (const c of captions) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.tStart - c.tStart) < 0.4) {
      // Concatenate close captions so we don't try to speak two things
      // on top of each other.
      last.text = `${last.text} ${c.text}`;
      last.tEnd = Math.max(last.tEnd, c.tEnd);
      if (c.kind === "key") last.kind = "key";
      continue;
    }
    dedup.push(c);
  }

  /* --------------------- 7. Optional LLM polish ---------------------- */
  let final = dedup;
  const provider = resolveNarrationProvider(
    opts.llmPolish ? process.env.NARRATION_PROVIDER ?? "openai" : undefined,
  );
  if (provider) {
    try {
      final = await provider.polish(final, {
        game,
        opening: game.opening ?? null,
      });
    } catch (err) {
      console.warn(
        `[narration] provider "${provider.id}" failed, using rules output: ${(err as Error).message}`,
      );
    }
  }

  return {
    captions: final,
    plyCount,
    totalDurationS,
    criticalPlies,
  };
}

/* ---------------------------------------------------------------------- */
/* Internals                                                              */
/* ---------------------------------------------------------------------- */

interface CriticalMove {
  ply: number;
  san: string;
  kind: "blunder" | "brilliancy" | "mate";
  cpSwing: number;
}

async function scanCriticalMoves(
  history: { from: string; to: string; promotion?: string; san: string }[],
  depth: number,
): Promise<CriticalMove[]> {
  // Cap the scan — full evaluation of every ply at depth-10 is fast
  // but pointless for our purposes; we want narrative beats, not a
  // full analysis.
  const STEP = 2; // every full move
  const MAX_PLY = Math.min(history.length, 60);

  const replay = new Chess();
  const evals: { ply: number; cp: number; mate: number | null }[] = [];

  for (let i = 0; i < MAX_PLY; i++) {
    const m = history[i];
    try {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      break;
    }
    if (i % STEP !== 0 && i !== MAX_PLY - 1) continue;
    try {
      const res = await stockfish.evaluate(replay.fen(), depth, 4000);
      const cp = res.evaluation;
      evals.push({ ply: i + 1, cp, mate: res.mateIn });
    } catch {
      break;
    }
  }

  const critical: CriticalMove[] = [];
  for (let k = 1; k < evals.length; k++) {
    const prev = evals[k - 1];
    const cur = evals[k];
    const swing = Math.abs(cur.cp - prev.cp);
    const ply = cur.ply;
    const san = history[ply - 1]?.san ?? "";
    if (cur.mate != null && Math.abs(cur.mate) <= 6 && prev.mate == null) {
      critical.push({ ply, san, kind: "mate", cpSwing: 100000 });
    } else if (swing > 200) {
      const sideJustMoved: "w" | "b" = ply % 2 === 1 ? "w" : "b";
      // A swing favoring the side that just moved = brilliancy; against = blunder.
      const swingForMover =
        sideJustMoved === "w" ? cur.cp - prev.cp : prev.cp - cur.cp;
      critical.push({
        ply,
        san,
        kind: swingForMover > 0 ? "brilliancy" : "blunder",
        cpSwing: swing,
      });
    }
  }
  critical.sort((a, b) => b.cpSwing - a.cpSwing);
  return critical;
}

function firstEndgamePly(
  history: { from: string; to: string; promotion?: string; san: string }[],
): number | null {
  const replay = new Chess();
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    try {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      return null;
    }
    if (i < 20) continue;
    const value = boardMaterial(replay);
    // Threshold ≈ each side has only ~14 points left (1 queen-equivalent
    // plus minor + pawns).
    if (value <= 28) return i + 1;
  }
  return null;
}

function boardMaterial(c: Chess): number {
  const board = c.board();
  let total = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const v: Record<string, number> = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
        k: 0,
      };
      total += v[cell.type] ?? 0;
    }
  }
  return total;
}

function asPlayer(name: string | null | undefined): string {
  return name && name.trim() ? name : "an anonymous player";
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
