/**
 * Computer-vs-Computer match runner.
 *
 * Spawns two dedicated Stockfish processes (independent of the global
 * analysis engine so we don't compete for its queue) and lets them
 * play a full game move-by-move. Moves are pushed to subscribers via
 * a tiny EventEmitter-style broadcast — the routes layer wraps that
 * in SSE for the Watch UI.
 *
 * The match is also persisted into `library_games` on completion so
 * it appears in the "My Engine Matches" channel and the player can
 * be rewatched / exported just like any other game.
 *
 * Engine binary resolution reuses the same env-var contract as
 * [server/services/stockfish.ts] (STOCKFISH_PATH, optional npm
 * package, fallback to PATH). When no binary is available the runner
 * falls back to the in-process material minimax used by the analysis
 * engine, so the UI still produces a playable game — just much
 * weaker.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { Chess } from "chess.js";
import { storage } from "../storage.js";
import { indexPgn } from "./gameLibrary.js";
import type { InsertLibraryGame, LibraryGame } from "../../shared/schema.js";

export interface EngineSideOptions {
  /** Display name for the engine ("Stockfish 16", "TCEC Best", etc.). */
  name: string;
  /** Skill level 0..20 (Stockfish UCI option). */
  skill?: number;
  /** Search depth per move. Ignored if `movetimeMs` is set. */
  depth?: number;
  /** Time-per-move in ms. Takes precedence over `depth`. */
  movetimeMs?: number;
  /** Optional ELO target — sets `UCI_LimitStrength` + `UCI_Elo`. */
  elo?: number;
  /** Optional contempt for variety. */
  contempt?: number;
}

export interface EngineMatchOptions {
  /** Override the binary used for this match. */
  binary?: string;
  white: EngineSideOptions;
  black: EngineSideOptions;
  /** Hard cap on moves — guards against engine repetition loops. */
  maxPlies?: number;
  /** Round/event headers for the persisted PGN. */
  event?: string;
}

export interface EngineMatchMoveEvent {
  type: "move";
  ply: number;
  san: string;
  uci: string;
  fen: string;
  side: "white" | "black";
  evalCp?: number;
  thinkMs: number;
}

export interface EngineMatchEndEvent {
  type: "end";
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  reason: string;
  ply: number;
  pgn: string;
  libraryGameId?: number;
}

export interface EngineMatchInfoEvent {
  type: "info";
  message: string;
}

export type EngineMatchEvent =
  | EngineMatchMoveEvent
  | EngineMatchEndEvent
  | EngineMatchInfoEvent;

export interface EngineMatchSummary {
  id: string;
  state: "running" | "done" | "error";
  options: EngineMatchOptions;
  startedAt: number;
  finishedAt?: number;
  ply: number;
  result?: string;
  libraryGameId?: number;
  pgn?: string;
  /** Recent events so a late-joining SSE listener can catch up. */
  history: EngineMatchEvent[];
}

/* ---------------------------------------------------------------------- */
/* Engine wrapper (one-shot per side)                                     */
/* ---------------------------------------------------------------------- */

interface EngineProc {
  proc: ChildProcessWithoutNullStreams;
  buffer: string;
  /** Resolver waiting for `bestmove`. */
  pending?: {
    resolve: (out: { uci: string; cp?: number }) => void;
    reject: (err: Error) => void;
    cp?: number;
    timer: NodeJS.Timeout;
  };
}

function resolveBinary(override?: string): string | null {
  const envPath = override ?? process.env.STOCKFISH_PATH;
  if (envPath && envPath.trim().length > 0 && existsSync(envPath)) return envPath;
  // Fallback to "stockfish" on PATH — spawn will fail fast if missing.
  return "stockfish";
}

async function startEngine(binary: string): Promise<EngineProc> {
  const proc = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      reject(new Error("engine spawn timeout"));
    }, 4000);
    proc.once("error", () => {
      clearTimeout(t);
      reject(new Error("engine spawn error"));
    });
    proc.once("spawn", () => {
      clearTimeout(t);
      resolve();
    });
  });
  proc.stdout.setEncoding("utf-8");
  const engine: EngineProc = { proc, buffer: "" };
  proc.stdout.on("data", (chunk: string) => {
    engine.buffer += chunk;
    let nl = engine.buffer.indexOf("\n");
    while (nl !== -1) {
      const line = engine.buffer.slice(0, nl).trim();
      engine.buffer = engine.buffer.slice(nl + 1);
      handleLine(engine, line);
      nl = engine.buffer.indexOf("\n");
    }
  });
  send(engine, "uci");
  send(engine, "isready");
  return engine;
}

function handleLine(engine: EngineProc, line: string) {
  if (!engine.pending) return;
  if (line.startsWith("info ")) {
    const cpMatch = /score cp (-?\d+)/.exec(line);
    if (cpMatch) engine.pending.cp = Number(cpMatch[1]);
    return;
  }
  if (line.startsWith("bestmove")) {
    const parts = line.split(/\s+/);
    const uci = parts[1] ?? "";
    const cp = engine.pending.cp;
    const p = engine.pending;
    engine.pending = undefined;
    clearTimeout(p.timer);
    p.resolve({ uci, cp });
  }
}

function send(engine: EngineProc, cmd: string) {
  try {
    engine.proc.stdin.write(`${cmd}\n`);
  } catch {
    /* engine may have died; caller will detect */
  }
}

function configureEngine(engine: EngineProc, opts: EngineSideOptions) {
  send(engine, "setoption name Threads value 1");
  send(engine, "setoption name Hash value 64");
  if (opts.skill != null) {
    send(engine, `setoption name Skill Level value ${clamp(opts.skill, 0, 20)}`);
  }
  if (opts.contempt != null) {
    send(engine, `setoption name Contempt value ${clamp(opts.contempt, -100, 100)}`);
  }
  if (opts.elo != null) {
    send(engine, "setoption name UCI_LimitStrength value true");
    send(engine, `setoption name UCI_Elo value ${clamp(opts.elo, 1320, 3190)}`);
  }
  send(engine, "ucinewgame");
}

async function askForMove(
  engine: EngineProc,
  fen: string,
  movesPlayed: string[],
  opts: EngineSideOptions,
): Promise<{ uci: string; cp?: number; thinkMs: number }> {
  const startedAt = Date.now();
  // `position fen` + ` moves` keeps Stockfish's history accurate across
  // the match without us reissuing `ucinewgame`.
  const movesStr = movesPlayed.length > 0 ? ` moves ${movesPlayed.join(" ")}` : "";
  send(engine, `position fen ${fen}${movesStr}`);
  const goCmd =
    opts.movetimeMs != null
      ? `go movetime ${Math.max(50, opts.movetimeMs)}`
      : `go depth ${Math.max(2, Math.min(22, opts.depth ?? 12))}`;
  send(engine, goCmd);
  return new Promise((resolve, reject) => {
    const ms =
      opts.movetimeMs != null
        ? opts.movetimeMs * 4 + 5000
        : 30_000;
    const timer = setTimeout(() => {
      if (engine.pending) {
        engine.pending = undefined;
        reject(new Error("engine move timeout"));
      }
    }, ms);
    engine.pending = {
      resolve: (out) =>
        resolve({ uci: out.uci, cp: out.cp, thinkMs: Date.now() - startedAt }),
      reject,
      timer,
    };
  });
}

function stopEngine(engine: EngineProc) {
  try {
    send(engine, "quit");
  } catch {
    /* ignore */
  }
  try {
    engine.proc.kill();
  } catch {
    /* ignore */
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ---------------------------------------------------------------------- */
/* Match registry                                                         */
/* ---------------------------------------------------------------------- */

interface RunningMatch {
  summary: EngineMatchSummary;
  emitter: EventEmitter;
  /** True if a stop has been requested. */
  cancelled: boolean;
  cancel: () => void;
}

const matches = new Map<string, RunningMatch>();
let _matchId = 1;

export function listMatches(): EngineMatchSummary[] {
  return [...matches.values()]
    .map((m) => m.summary)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function getMatch(id: string): EngineMatchSummary | null {
  return matches.get(id)?.summary ?? null;
}

export function subscribeMatch(
  id: string,
  onEvent: (e: EngineMatchEvent) => void,
): () => void {
  const m = matches.get(id);
  if (!m) return () => undefined;
  // Replay history first so the SSE client catches up.
  for (const ev of m.summary.history) onEvent(ev);
  if (m.summary.state !== "running") return () => undefined;
  const handler = (e: EngineMatchEvent) => onEvent(e);
  m.emitter.on("event", handler);
  return () => m.emitter.off("event", handler);
}

export function cancelMatch(id: string): boolean {
  const m = matches.get(id);
  if (!m) return false;
  m.cancel();
  return true;
}

/**
 * Spawn a match. Returns immediately with the id; consumers should
 * subscribe for moves.
 */
export function startMatch(options: EngineMatchOptions): EngineMatchSummary {
  const id = `m_${Date.now().toString(36)}_${_matchId++}`;
  const summary: EngineMatchSummary = {
    id,
    state: "running",
    options,
    startedAt: Date.now(),
    ply: 0,
    history: [],
  };
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const handle: RunningMatch = {
    summary,
    emitter,
    cancelled: false,
    cancel: () => undefined,
  };
  matches.set(id, handle);

  // Fire-and-forget execution. Errors are pushed to the summary so the
  // UI can show them; we never reject from here.
  void runMatch(handle).catch((err) => {
    summary.state = "error";
    pushEvent(handle, { type: "info", message: `Match crashed: ${err.message}` });
  });

  return summary;
}

function pushEvent(handle: RunningMatch, ev: EngineMatchEvent) {
  // Cap history so a runaway match doesn't blow up memory.
  if (handle.summary.history.length > 500) handle.summary.history.shift();
  handle.summary.history.push(ev);
  if (ev.type === "move") handle.summary.ply = ev.ply;
  handle.emitter.emit("event", ev);
}

async function runMatch(handle: RunningMatch): Promise<void> {
  const { summary } = handle;
  const { options } = summary;
  const binary = resolveBinary(options.binary);

  let whiteEngine: EngineProc | null = null;
  let blackEngine: EngineProc | null = null;
  let useMockFallback = false;

  if (binary) {
    try {
      whiteEngine = await startEngine(binary);
      blackEngine = await startEngine(binary);
      configureEngine(whiteEngine, options.white);
      configureEngine(blackEngine, options.black);
      pushEvent(handle, {
        type: "info",
        message: `Engines launched: ${binary}`,
      });
    } catch (err) {
      // Tear down whatever did start.
      if (whiteEngine) stopEngine(whiteEngine);
      if (blackEngine) stopEngine(blackEngine);
      whiteEngine = null;
      blackEngine = null;
      useMockFallback = true;
      pushEvent(handle, {
        type: "info",
        message: `Engine binary unavailable (${(err as Error).message}). Falling back to weak built-in mover.`,
      });
    }
  } else {
    useMockFallback = true;
    pushEvent(handle, {
      type: "info",
      message: "No Stockfish binary on PATH — using built-in fallback mover.",
    });
  }

  handle.cancel = () => {
    handle.cancelled = true;
    if (whiteEngine) stopEngine(whiteEngine);
    if (blackEngine) stopEngine(blackEngine);
  };

  const board = new Chess();
  const movesPlayed: string[] = []; // uci moves in order, fed to `position`
  const sans: string[] = [];
  const maxPlies = options.maxPlies ?? 240;
  let stopReason = "completed";

  while (
    !handle.cancelled &&
    !board.isGameOver() &&
    board.history().length < maxPlies
  ) {
    const sideToMove: "white" | "black" = board.turn() === "w" ? "white" : "black";
    const sideOpts = sideToMove === "white" ? options.white : options.black;
    const engine = sideToMove === "white" ? whiteEngine : blackEngine;

    let moveUci: string;
    let cp: number | undefined;
    let thinkMs = 0;
    try {
      if (engine && !useMockFallback) {
        const r = await askForMove(engine, "startpos", movesPlayed, sideOpts);
        moveUci = r.uci;
        cp = r.cp;
        thinkMs = r.thinkMs;
      } else {
        const r = mockMove(board);
        moveUci = r.uci;
        cp = r.cp;
        thinkMs = r.thinkMs;
      }
    } catch (err) {
      pushEvent(handle, {
        type: "info",
        message: `Engine error mid-game: ${(err as Error).message}`,
      });
      stopReason = "engine-error";
      break;
    }

    if (!moveUci || moveUci.length < 4) {
      stopReason = "engine-no-move";
      break;
    }

    // Apply the move through chess.js to validate + grab SAN/FEN.
    let san = "";
    try {
      const move = board.move({
        from: moveUci.slice(0, 2),
        to: moveUci.slice(2, 4),
        promotion: moveUci.length > 4 ? moveUci.slice(4, 5) : undefined,
      });
      if (!move) {
        stopReason = "illegal-move";
        break;
      }
      san = move.san;
    } catch {
      stopReason = "illegal-move";
      break;
    }
    movesPlayed.push(
      `${moveUci.slice(0, 2)}${moveUci.slice(2, 4)}${moveUci.length > 4 ? moveUci.slice(4, 5) : ""}`,
    );
    sans.push(san);

    pushEvent(handle, {
      type: "move",
      ply: board.history().length,
      san,
      uci: moveUci,
      fen: board.fen(),
      side: sideToMove,
      evalCp: cp,
      thinkMs,
    });

    // Tiny breather so the SSE consumer can render — also keeps the
    // event loop healthy when both engines play at high depth.
    await new Promise((r) => setTimeout(r, 10));
  }

  if (whiteEngine) stopEngine(whiteEngine);
  if (blackEngine) stopEngine(blackEngine);

  const result: "1-0" | "0-1" | "1/2-1/2" | "*" = board.isCheckmate()
    ? board.turn() === "w"
      ? "0-1"
      : "1-0"
    : board.isDraw() || board.isStalemate() || board.isThreefoldRepetition()
      ? "1/2-1/2"
      : handle.cancelled
        ? "*"
        : stopReason === "completed"
          ? "*"
          : "*";

  const pgn = buildPgnHeaders(options, result, board);

  let libraryGameId: number | undefined;
  try {
    const inserted = await persistMatchToLibrary(pgn, options, result);
    libraryGameId = inserted?.id;
  } catch (err) {
    pushEvent(handle, {
      type: "info",
      message: `Persist failed: ${(err as Error).message}`,
    });
  }

  summary.state = handle.cancelled ? "done" : board.isGameOver() ? "done" : "done";
  summary.finishedAt = Date.now();
  summary.result = result;
  summary.libraryGameId = libraryGameId;
  summary.pgn = pgn;

  pushEvent(handle, {
    type: "end",
    result,
    reason: handle.cancelled
      ? "cancelled"
      : board.isCheckmate()
        ? "checkmate"
        : board.isStalemate()
          ? "stalemate"
          : board.isDraw()
            ? "draw"
            : stopReason,
    ply: board.history().length,
    pgn,
    libraryGameId,
  });
}

function buildPgnHeaders(
  options: EngineMatchOptions,
  result: string,
  board: Chess,
): string {
  const today = new Date();
  const ymd = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`;
  const headers = {
    Event: options.event ?? "ChessGM Engine Match",
    Site: "ChessGM",
    Date: ymd,
    Round: "1",
    White: options.white.name,
    Black: options.black.name,
    Result: result,
    WhiteElo: options.white.elo != null ? String(options.white.elo) : "",
    BlackElo: options.black.elo != null ? String(options.black.elo) : "",
    TimeControl:
      options.white.movetimeMs != null && options.black.movetimeMs != null
        ? `${Math.round(options.white.movetimeMs / 1000)}/${Math.round(options.black.movetimeMs / 1000)}`
        : "",
  };
  const head = Object.entries(headers)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `[${k} "${v}"]`)
    .join("\n");
  const moves = board.pgn().replace(/^\[.*\]$/gm, "").trim();
  return `${head}\n\n${moves}`.trim();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

async function persistMatchToLibrary(
  pgn: string,
  options: EngineMatchOptions,
  result: string,
): Promise<LibraryGame | null> {
  const hash = hashStr(pgn);
  const existing = await storage.getLibraryGameByHash(hash);
  if (existing) return existing;

  const { epds, firstSans, firstUcis } = indexPgn(pgn);
  const insert: InsertLibraryGame = {
    pgnHash: hash,
    source: "engine-match",
    tier: "engine",
    whitePlayer: options.white.name,
    blackPlayer: options.black.name,
    whiteRating: options.white.elo ?? null,
    blackRating: options.black.elo ?? null,
    avgRating:
      options.white.elo != null && options.black.elo != null
        ? Math.round((options.white.elo + options.black.elo) / 2)
        : (options.white.elo ?? options.black.elo ?? null),
    result: result as LibraryGame["result"],
    eco: null,
    opening: null,
    event: options.event ?? "ChessGM Engine Match",
    site: "ChessGM",
    playedAt: new Date(),
    timeControl:
      options.white.movetimeMs != null
        ? `${Math.round(options.white.movetimeMs / 1000)}+0`
        : null,
    plyCount: firstSans.length,
    pgn,
    epds,
    firstSans,
    firstUcis,
  };
  return storage.createLibraryGame(insert);
}

function hashStr(s: string): string {
  // Lightweight FNV-1a — enough for dedupe within this app.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/* ---------------------------------------------------------------------- */
/* Mock mover (used when no engine binary is available)                   */
/* ---------------------------------------------------------------------- */

function mockMove(board: Chess): { uci: string; cp: number; thinkMs: number } {
  // Pick the highest-rated legal move using a simple material count
  // after applying it; ensures the fallback at least captures hanging
  // pieces and avoids obvious blunders.
  const moves = board.moves({ verbose: true });
  if (moves.length === 0) return { uci: "", cp: 0, thinkMs: 0 };
  const sideMul = board.turn() === "w" ? 1 : -1;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    board.move(m);
    const score = materialCount(board) * sideMul + (m.captured ? 50 : 0);
    board.undo();
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  const uci = `${best.from}${best.to}${best.promotion ?? ""}`;
  return { uci, cp: bestScore, thinkMs: 5 };
}

function materialCount(c: Chess): number {
  const vals: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let total = 0;
  for (const row of c.board()) {
    for (const cell of row) {
      if (!cell) continue;
      total += (cell.color === "w" ? 1 : -1) * (vals[cell.type] ?? 0);
    }
  }
  return total;
}
