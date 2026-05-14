/**
 * Stockfish UCI wrapper.
 *
 * Binary resolution order:
 *   1. `STOCKFISH_PATH` — full path to the Stockfish executable (recommended on Windows)
 *   2. `stockfish` npm optional package path (often broken / missing on Windows)
 *   3. `"stockfish"` on PATH
 *
 * If nothing launches, falls back to a shallow material alpha-beta search so the
 * UI keeps producing meaningful evals while you install a real binary.
 *
 * Supports MultiPV via `evaluateAllMoves()` so the analysis page can grab every
 * legal move's evaluation in a single search.
 *
 * https://stockfishchess.org/download/
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Chess, type Move } from "chess.js";

export interface UciEval {
  fen: string;
  depth: number;
  evaluation: number;
  bestMove: string | null;
  pv: string[];
  mateIn: number | null;
}

/** One entry in a MultiPV result, normalized to white's POV. */
export interface PerMoveEval {
  uci: string;
  /** Centipawns from white's POV. ±100000 indicates mate (use mateIn for distance). */
  cp: number;
  /** Signed plies until mate (positive = white mates), or null. */
  mateIn: number | null;
  pv: string[];
}

export type EngineMode = "uci" | "mock";

interface MultiPVLine {
  cp: number; // raw, side-to-move POV
  mateIn: number | null; // raw, side-to-move POV
  pv: string[];
}

interface PendingRequest {
  fen: string;
  /** Depth passed to `go depth N`. */
  targetDepth: number;
  /** Latest depth reported on `info` lines (for the client). */
  reportedDepth: number;
  /** MultiPV — number of best lines to retrieve (1 = single best). */
  multiPV: number;
  /** Accumulated lines keyed by `multipv` index. */
  lines: Map<number, MultiPVLine>;
  resolve: (result: { best: UciEval; lines: PerMoveEval[] }) => void;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

class StockfishEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private current: PendingRequest | null = null;
  private queue: PendingRequest[] = [];
  private mode: EngineMode = "mock";
  private resolvedBinary: string | null = null;
  private uciAttempted = false;

  getEngineMode(): EngineMode {
    return this.mode;
  }

  getResolvedBinary(): string | null {
    return this.resolvedBinary;
  }

  async ensure(): Promise<void> {
    if (this.proc && this.mode === "uci") return;
    if (this.uciAttempted) return;
    this.uciAttempted = true;

    const candidates = await resolveStockfishBinary();

    for (const binary of candidates) {
      try {
        const proc = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });

        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => {
            try {
              proc.kill();
            } catch {
              /* ignore */
            }
            reject(new Error("spawn handshake timeout"));
          }, 4000);
          proc.once("error", () => {
            clearTimeout(t);
            reject(new Error("spawn error"));
          });
          proc.once("spawn", () => {
            clearTimeout(t);
            resolve();
          });
        });

        proc.stdout.setEncoding("utf-8");
        proc.stdout.on("data", (chunk: string) => this.onData(chunk));

        proc.on("error", () => {
          this.proc = null;
        });
        proc.on("exit", () => {
          this.proc = null;
        });

        this.proc = proc;
        this.resolvedBinary = binary;
        this.mode = "uci";

        this.send("uci");
        this.send("setoption name Threads value 2");
        this.send("setoption name Hash value 128");
        this.send("isready");

        // eslint-disable-next-line no-console
        console.log(`[stockfish] Using UCI engine: ${binary}`);
        return;
      } catch {
        /* try next */
      }
    }

    this.mode = "mock";
    // eslint-disable-next-line no-console
    console.warn(
      "[stockfish] No binary could be started — using material minimax fallback.\n" +
        "  Install Stockfish and either add it to PATH or set STOCKFISH_PATH to the .exe full path.",
    );
  }

  private send(line: string) {
    if (!this.proc) return;
    this.proc.stdin.write(`${line}\n`);
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let nl = this.buffer.indexOf("\n");
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      this.handleLine(line);
      nl = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string) {
    if (!this.current) return;

    if (line.startsWith("info ")) {
      const cpMatch = /score cp (-?\d+)/.exec(line);
      const mateMatch = /score mate (-?\d+)/.exec(line);
      const pvMatch = /\bpv (.+?)(?:\s+(?:bmc|tbhits|hashfull|nodes)\s|$)/.exec(line);
      const depthMatch = /\bdepth (\d+)/.exec(line);
      const multipvMatch = /\bmultipv (\d+)/.exec(line);

      if (depthMatch) this.current.reportedDepth = Number(depthMatch[1]);
      if (cpMatch || mateMatch) {
        const idx = multipvMatch ? Number(multipvMatch[1]) : 1;
        const existing = this.current.lines.get(idx);
        const cp = cpMatch ? Number(cpMatch[1]) : (existing?.cp ?? 0);
        const mateIn = mateMatch ? Number(mateMatch[1]) : (existing?.mateIn ?? null);
        const pv = pvMatch ? pvMatch[1].split(/\s+/) : (existing?.pv ?? []);
        this.current.lines.set(idx, { cp, mateIn, pv });
      }
    } else if (line.startsWith("bestmove")) {
      const parts = line.split(/\s+/);
      const bestMoveUci = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
      const cur = this.current;
      this.current = null;
      if (cur.timer) clearTimeout(cur.timer);
      cur.timer = null;

      const stm = sideToMove(cur.fen);
      const flip = stm === "w" ? 1 : -1;

      const linesArray: PerMoveEval[] = [];
      const sortedKeys = Array.from(cur.lines.keys()).sort((a, b) => a - b);
      for (const k of sortedKeys) {
        const l = cur.lines.get(k)!;
        const cpW = l.cp * flip;
        const mateW = l.mateIn == null ? null : l.mateIn * flip;
        linesArray.push({
          uci: l.pv[0] ?? "",
          cp: mateW != null ? (mateW > 0 ? 100000 : -100000) : cpW,
          mateIn: mateW,
          pv: l.pv,
        });
      }

      const head = cur.lines.get(1) ?? cur.lines.get(sortedKeys[0] ?? 1);
      const cpHeadW = head ? head.cp * flip : 0;
      const mateHeadW = head?.mateIn == null ? null : (head!.mateIn as number) * flip;

      const best: UciEval = {
        fen: cur.fen,
        depth: cur.reportedDepth || cur.targetDepth,
        evaluation: mateHeadW != null ? (mateHeadW > 0 ? 100000 : -100000) : cpHeadW,
        bestMove: bestMoveUci,
        pv: head?.pv ?? [],
        mateIn: mateHeadW,
      };

      cur.resolve({ best, lines: linesArray });
      this.runNext();
    }
  }

  private runNext() {
    if (this.current || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.current = next;

    if (!this.proc || this.mode !== "uci") {
      this.current = null;
      next.resolve(mockMultiPV(next.fen, next.targetDepth, next.multiPV));
      this.runNext();
      return;
    }

    this.send(`setoption name MultiPV value ${next.multiPV}`);
    this.send("ucinewgame");
    this.send(`position fen ${next.fen}`);
    this.send(`go depth ${next.targetDepth}`);

    next.timer = setTimeout(() => {
      if (this.current !== next) return;
      if (next.timer) clearTimeout(next.timer);
      next.timer = null;
      this.current = null;
      // eslint-disable-next-line no-console
      console.warn(
        `[stockfish] Timed out after ${next.timeoutMs}ms — mock fallback for this request`,
      );
      next.resolve(mockMultiPV(next.fen, next.targetDepth, next.multiPV));
      this.runNext();
    }, next.timeoutMs);
  }

  /**
   * Single best move + eval (UCI MultiPV=1 in real engine, otherwise mock).
   */
  async evaluate(fen: string, depth = 8, timeoutMs?: number): Promise<UciEval> {
    const { best } = await this.run(fen, depth, 1, timeoutMs);
    return best;
  }

  /**
   * Get evaluations for **every legal move** in a single search via MultiPV.
   * Returned `cp`/`mateIn` are normalized to white's POV.
   */
  async evaluateAllMoves(
    fen: string,
    depth = 10,
    timeoutMs?: number,
  ): Promise<{ best: UciEval; lines: PerMoveEval[] }> {
    let n = 50;
    try {
      const c = new Chess(fen);
      n = Math.max(1, c.moves().length);
    } catch {
      /* ignore — fall back to a generous cap */
    }
    return this.run(fen, depth, n, timeoutMs);
  }

  private async run(
    fen: string,
    depth: number,
    multiPV: number,
    timeoutMs?: number,
  ): Promise<{ best: UciEval; lines: PerMoveEval[] }> {
    await this.ensure();

    const ms =
      timeoutMs ?? Math.min(120000, Math.max(8000, 2000 + depth * 3500 + multiPV * 200));

    if (this.mode === "mock") return mockMultiPV(fen, depth, multiPV);

    return new Promise<{ best: UciEval; lines: PerMoveEval[] }>((resolve) => {
      const req: PendingRequest = {
        fen,
        targetDepth: depth,
        reportedDepth: 0,
        multiPV,
        lines: new Map(),
        resolve,
        timeoutMs: ms,
        timer: null,
      };
      this.queue.push(req);
      this.runNext();
    });
  }

  shutdown() {
    if (this.proc) {
      try {
        this.send("quit");
      } catch {
        /* ignore */
      }
      this.proc.kill();
      this.proc = null;
    }
  }
}

async function resolveStockfishBinary(): Promise<string[]> {
  const out: string[] = [];

  const envPath = process.env.STOCKFISH_PATH?.trim();
  if (envPath) out.push(envPath);

  try {
    // @ts-expect-error optional dep without types
    const stockfishMod = await import("stockfish").catch(() => null);
    const npmPath: string | undefined =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stockfishMod as any)?.default?.path ?? (stockfishMod as any)?.path;
    if (npmPath && !out.includes(npmPath)) out.push(npmPath);
  } catch {
    /* ignore */
  }

  if (!out.includes("stockfish")) out.push("stockfish");

  return out;
}

function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

const PIECE_CP: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/**
 * Piece-square tables (white POV, a8..h1 row-major). Standard "Tomasz Michniewski"
 * simplified evaluation function values. Used so the mock fallback can distinguish
 * opening moves: e.g. 1.e4 (+20) vs 1.h4 (−20), or 1.Nf3 (+10..+20) vs 1.Na3 (−40).
 */
const PST: Record<string, number[]> = {
  p: [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-25,-25, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function pstValue(piece: { type: string; color: "w" | "b" }, fileIdx: number, rankIdx: number): number {
  const table = PST[piece.type];
  if (!table) return 0;
  const idx = piece.color === "w" ? rankIdx * 8 + fileIdx : (7 - rankIdx) * 8 + fileIdx;
  return table[idx] ?? 0;
}

function materialEval(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      const v = (PIECE_CP[cell.type] ?? 0) + pstValue(cell, f, r);
      score += cell.color === "w" ? v : -v;
    }
  }
  return score;
}

function captureValue(m: Move): number {
  if (!m.captured) return 0;
  return PIECE_CP[m.captured] ?? 0;
}

function orderedMoves(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true });
  const stm = chess.turn();
  return [...moves].sort((a, b) => {
    const ca = captureValue(a);
    const cb = captureValue(b);
    if (ca !== cb) return cb - ca;
    const scorePiece = (m: Move) =>
      m.piece === "n" || m.piece === "b"
        ? 1
        : m.piece === "p" && (stm === "w" ? m.from[1] === "2" : m.from[1] === "7")
          ? -1
          : 0;
    return scorePiece(b) - scorePiece(a);
  });
}

function minimax(chess: Chess, plyLeft: number, alpha: number, beta: number): number {
  if (plyLeft === 0) return materialEval(chess);

  const moves = orderedMoves(chess);
  if (moves.length === 0) {
    if (chess.isCheckmate()) return chess.turn() === "w" ? -1_000_000 : 1_000_000;
    return 0;
  }

  if (chess.turn() === "w") {
    let maxEval = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const ev = minimax(chess, plyLeft - 1, alpha, beta);
      chess.undo();
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const m of moves) {
    chess.move(m);
    const ev = minimax(chess, plyLeft - 1, alpha, beta);
    chess.undo();
    minEval = Math.min(minEval, ev);
    beta = Math.min(beta, ev);
    if (beta <= alpha) break;
  }
  return minEval;
}

/** Mock multi-PV: evaluates every legal root move with shallow material minimax. */
function mockMultiPV(
  fen: string,
  requestedDepth: number,
  multiPV: number,
): { best: UciEval; lines: PerMoveEval[] } {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    const empty: PerMoveEval[] = [];
    return {
      best: { fen, depth: 0, evaluation: 0, bestMove: null, pv: [], mateIn: null },
      lines: empty,
    };
  }

  const moves = orderedMoves(chess);
  if (moves.length === 0) {
    return {
      best: {
        fen,
        depth: 0,
        evaluation: materialEval(chess),
        bestMove: null,
        pv: [],
        mateIn: null,
      },
      lines: [],
    };
  }

  // Use odd depth so the side-to-move gets the last reply in each line — this
  // mirrors how real engines report symmetric openings near 0.0 instead of the
  // even-ply horizon making "every white move looks bad" because black always
  // gets the closing tempo.
  const branching = moves.length;
  const baseFromRequest = Math.max(3, Math.min(5, Math.floor(requestedDepth / 3) + 1));
  let searchPlies = branching <= 22 ? Math.max(baseFromRequest, 3) : 3;
  if (searchPlies % 2 === 0) searchPlies -= 1;

  const rootWhite = chess.turn() === "w";
  const scored: { move: Move; cpWhite: number }[] = [];

  for (const m of moves) {
    chess.move(m);
    const score = minimax(chess, searchPlies - 1, -1_000_000, 1_000_000);
    chess.undo();
    scored.push({ move: m, cpWhite: score });
  }

  scored.sort((a, b) =>
    rootWhite ? b.cpWhite - a.cpWhite : a.cpWhite - b.cpWhite,
  );

  const lines: PerMoveEval[] = scored.slice(0, multiPV).map((s) => ({
    uci: `${s.move.from}${s.move.to}${s.move.promotion ?? ""}`,
    cp: s.cpWhite,
    mateIn: null,
    pv: [`${s.move.from}${s.move.to}${s.move.promotion ?? ""}`],
  }));

  const top = scored[0];
  return {
    best: {
      fen,
      depth: searchPlies,
      evaluation: top.cpWhite,
      bestMove: `${top.move.from}${top.move.to}${top.move.promotion ?? ""}`,
      pv: [`${top.move.from}${top.move.to}${top.move.promotion ?? ""}`],
      mateIn: null,
    },
    lines,
  };
}

export const stockfish = new StockfishEngine();
