/**
 * Deterministic bulk training rows: unique basic-mate positions (KQvK / KRvK
 * mate-in-one) plus a curated set of forced mate sequences (mate in 2–7 by
 * the side to move). Used by `seed-training.ts` via backfill so upgrades
 * pick up volume without wiping user-generated tactics.
 */

import { Chess } from "chess.js";
import type { InsertTrainingProblem } from "../../shared/schema.js";
import { MATE_N_SEQUENCE_SEEDS } from "../data/mateNSequenceSeeds.js";

function kingAdjacent(f1: number, r1: number, f2: number, r2: number): boolean {
  return Math.max(Math.abs(f1 - f2), Math.abs(r1 - r2)) <= 1;
}

type Piece = { sym: string; f: number; r: number };

function buildFen(pieces: Piece[], stm: "w" | "b"): string {
  const grid: (string | null)[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null),
  );
  for (const p of pieces) {
    const row = 8 - p.r;
    grid[row][p.f] = p.sym;
  }
  const ranks = grid.map((row) => {
    let s = "";
    let empty = 0;
    for (const c of row) {
      if (!c) empty++;
      else {
        if (empty) {
          s += empty;
          empty = 0;
        }
        s += c;
      }
    }
    if (empty) s += empty;
    return s || "8";
  });
  return `${ranks.join("/")} ${stm} - - 0 1`;
}

function matingSansForSideToMove(ch: Chess): string[] {
  const fen0 = ch.fen();
  const out: string[] = [];
  const moves = ch.moves({ verbose: true });
  for (const m of moves) {
    ch.load(fen0);
    ch.move(m);
    if (ch.isCheckmate()) out.push(m.san);
  }
  ch.load(fen0);
  return out;
}

function edgeDifficulty(bkf: number, bkr: number): number {
  const df = Math.min(bkf, 7 - bkf);
  const dr = Math.min(bkr - 1, 8 - bkr);
  const m = Math.min(df, dr);
  if (m <= 0) return 1;
  if (m === 1) return 2;
  if (m === 2) return 3;
  return 4 + (m >= 4 ? 1 : 0);
}

/**
 * Enumerate K+Q+K vs k positions (white to move) and keep those with exactly
 * one mating move — fast enough for ~1k rows on boot (~26k placements).
 */
function scanKQkUniqueMate1(
  limit: number,
  seen: Set<string>,
  maxInspect = 55_000,
): { fen: string; san: string }[] {
  const out: { fen: string; san: string }[] = [];
  const ch = new Chess();
  const sq = (f: number, r: number) => `${f},${r}`;
  let inspected = 0;
  outer: for (let bkf = 0; bkf < 8; bkf++) {
    for (let bkr = 1; bkr <= 8; bkr++) {
      for (let wkf = 0; wkf < 8; wkf++) {
        for (let wkr = 1; wkr <= 8; wkr++) {
          for (let qf = 0; qf < 8; qf++) {
            for (let qr = 1; qr <= 8; qr++) {
              if (out.length >= limit || inspected++ > maxInspect) break outer;
              const set = new Set([sq(bkf, bkr), sq(wkf, wkr), sq(qf, qr)]);
              if (set.size !== 3) continue;
              if (kingAdjacent(bkf, bkr, wkf, wkr)) continue;
              if (kingAdjacent(bkf, bkr, qf, qr)) continue;
              if (kingAdjacent(wkf, wkr, qf, qr)) continue;

              const fen = buildFen(
                [
                  { sym: "k", f: bkf, r: bkr },
                  { sym: "K", f: wkf, r: wkr },
                  { sym: "Q", f: qf, r: qr },
                ],
                "w",
              );
              if (seen.has(fen)) continue;
              try {
                ch.load(fen);
              } catch {
                continue;
              }
              if (ch.isGameOver()) continue;
              if (ch.turn() !== "w") continue;
              const mates = matingSansForSideToMove(ch);
              if (mates.length !== 1) continue;
              seen.add(fen);
              out.push({ fen, san: mates[0]! });
            }
          }
        }
      }
    }
  }
  return out;
}

/** Same idea for K+R+K vs k (mate-in-one with a unique rook move). */
function scanKRkUniqueMate1(
  limit: number,
  seen: Set<string>,
  maxInspect = 42_000,
): { fen: string; san: string }[] {
  const out: { fen: string; san: string }[] = [];
  const ch = new Chess();
  const sq = (f: number, r: number) => `${f},${r}`;
  let inspected = 0;
  outer: for (let bkf = 0; bkf < 8; bkf++) {
    for (let bkr = 1; bkr <= 8; bkr++) {
      for (let wkf = 0; wkf < 8; wkf++) {
        for (let wkr = 1; wkr <= 8; wkr++) {
          for (let rf = 0; rf < 8; rf++) {
            for (let rr = 1; rr <= 8; rr++) {
              if (out.length >= limit || inspected++ > maxInspect) break outer;
              const set = new Set([sq(bkf, bkr), sq(wkf, wkr), sq(rf, rr)]);
              if (set.size !== 3) continue;
              if (kingAdjacent(bkf, bkr, wkf, wkr)) continue;
              if (kingAdjacent(bkf, bkr, rf, rr)) continue;
              if (kingAdjacent(wkf, wkr, rf, rr)) continue;

              const fen = buildFen(
                [
                  { sym: "k", f: bkf, r: bkr },
                  { sym: "K", f: wkf, r: wkr },
                  { sym: "R", f: rf, r: rr },
                ],
                "w",
              );
              if (seen.has(fen)) continue;
              try {
                ch.load(fen);
              } catch {
                continue;
              }
              if (ch.isGameOver()) continue;
              if (ch.turn() !== "w") continue;
              const mates = matingSansForSideToMove(ch);
              if (mates.length !== 1) continue;
              seen.add(fen);
              out.push({ fen, san: mates[0]! });
            }
          }
        }
      }
    }
  }
  return out;
}

function blackKingSquare(fenBoard: string): { f: number; r: number } {
  const ranks = fenBoard.split("/");
  for (let ri = 0; ri < 8; ri++) {
    const row = ranks[ri] ?? "";
    let file = 0;
    for (const chc of row) {
      if (chc >= "1" && chc <= "8") file += Number(chc);
      else {
        const rank = 8 - ri;
        if (chc === "k") return { f: file, r: rank };
        file++;
      }
    }
  }
  return { f: 4, r: 4 };
}

function rowFromBasicMate(
  fen: string,
  san: string,
  module: string,
  kind: "KQK" | "KRK",
  idx: number,
): InsertTrainingProblem {
  const boardPart = fen.split(" ")[0] ?? "";
  const { f: bkf, r: bkr } = blackKingSquare(boardPart);
  const diff = Math.min(5, Math.max(1, edgeDifficulty(bkf, bkr) + (kind === "KRK" ? 1 : 0)));

  const meta = {
    bulkKey: `${kind}-m1-${idx}`,
    mateUserPlies: 1,
    mateKind: kind,
    estEloMin: kind === "KQK" ? 600 + diff * 120 : 700 + diff * 130,
    estEloMax: kind === "KQK" ? 900 + diff * 220 : 1000 + diff * 220,
  };

  return {
    module,
    fen,
    solution: [san],
    difficulty: diff,
    themes: ["mate", "endgame-mate", kind.toLowerCase()],
    tacticType: kind === "KQK" ? "Queen Mate" : "Rook Mate",
    explanation:
      kind === "KQK"
        ? "White forces immediate mate with the queen — basic king + queen coordination."
        : "White forces immediate mate with the rook — basic king + rook coordination.",
    source: "bulk-basic-mate",
    metadata: meta,
  };
}

/** Cached so boot does not re-run large searches. */
let cache: InsertTrainingProblem[] | null = null;

/**
 * All bulk rows to backfill (tactics, checkmate-patterns, endgame). Safe to
 * call repeatedly; dedupe is by `module|fen` in seed-training.
 */
export function getBulkTrainingProblemRows(): InsertTrainingProblem[] {
  if (cache) return cache;

  const rows: InsertTrainingProblem[] = [];

  const kqkNeeded = 450 + 280 + 200;
  const kqkPool = scanKQkUniqueMate1(kqkNeeded, new Set());
  let kqkOff = 0;
  const takeKqk = (n: number) => {
    const chunk = kqkPool.slice(kqkOff, kqkOff + n);
    kqkOff += n;
    return chunk;
  };

  let i = 0;
  for (const h of takeKqk(450)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "tactics", "KQK", i++));
  }

  const krkNeeded = 300 + 210 + 130;
  const krkPool = scanKRkUniqueMate1(krkNeeded, new Set());
  let krkOff = 0;
  const takeKrk = (n: number) => {
    const chunk = krkPool.slice(krkOff, krkOff + n);
    krkOff += n;
    return chunk;
  };

  for (const h of takeKrk(300)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "tactics", "KRK", i++));
  }

  let j = 0;
  for (const h of takeKqk(280)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "checkmate-patterns", "KQK", j++));
  }

  for (const h of takeKrk(210)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "checkmate-patterns", "KRK", j++));
  }

  let k = 0;
  for (const h of takeKqk(200)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "endgame", "KQK", k++));
  }
  for (const h of takeKrk(130)) {
    rows.push(rowFromBasicMate(h.fen, h.san, "endgame", "KRK", k++));
  }

  for (const s of MATE_N_SEQUENCE_SEEDS) {
    rows.push({
      module: "tactics",
      fen: s.fen,
      solution: s.solution,
      difficulty: s.difficulty,
      themes: s.themes,
      tacticType: s.tacticType,
      explanation: s.explanation,
      source: "bulk-mate-sequence",
      metadata: {
        bulkKey: s.id,
        mateUserPlies: s.mateUserPlies,
        mateKind: s.mateKind,
        estEloMin: s.estEloMin,
        estEloMax: s.estEloMax,
      },
    });
  }

  cache = rows;
  return rows;
}
