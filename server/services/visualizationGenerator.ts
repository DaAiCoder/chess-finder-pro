/**
 * Visualization training problem generator.
 *
 * For "Remember Position" mode: shows a position briefly, then quizzes the
 * user on facts about it (pawn count, piece locations, whose turn, king square).
 *
 * For "Blind Tactics" mode: pairs an existing tactics problem with a hide-N-plies
 * count derived from difficulty.
 */

import { Chess, type Square } from "chess.js";
import type { TrainingProblem, InsertTrainingProblem } from "../../shared/schema.js";

export interface VisualizationQuestion {
  type: "pawn-count" | "piece-square" | "side-to-move" | "king-square";
  prompt: string;
  options: string[];
  answer: string;
}

export function buildVisualizationQuestions(fen: string): VisualizationQuestion[] {
  const c = new Chess(fen);
  const board = c.board();
  const questions: VisualizationQuestion[] = [];

  let whitePawns = 0,
    blackPawns = 0;
  let whiteKing: Square | null = null,
    blackKing: Square | null = null;
  const pieces: { square: Square; piece: string; color: "w" | "b" }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      pieces.push({ square: cell.square as Square, piece: cell.type, color: cell.color });
      if (cell.type === "p" && cell.color === "w") whitePawns++;
      if (cell.type === "p" && cell.color === "b") blackPawns++;
      if (cell.type === "k" && cell.color === "w") whiteKing = cell.square as Square;
      if (cell.type === "k" && cell.color === "b") blackKing = cell.square as Square;
    }
  }

  questions.push({
    type: "pawn-count",
    prompt: "How many white pawns are on the board?",
    options: [String(whitePawns - 1), String(whitePawns), String(whitePawns + 1), String(whitePawns + 2)]
      .filter((v) => Number(v) >= 0)
      .slice(0, 4),
    answer: String(whitePawns),
  });
  questions.push({
    type: "pawn-count",
    prompt: "How many black pawns are on the board?",
    options: [String(blackPawns - 1), String(blackPawns), String(blackPawns + 1), String(blackPawns + 2)]
      .filter((v) => Number(v) >= 0)
      .slice(0, 4),
    answer: String(blackPawns),
  });
  questions.push({
    type: "side-to-move",
    prompt: "Whose turn is it?",
    options: ["White", "Black"],
    answer: c.turn() === "w" ? "White" : "Black",
  });
  if (whiteKing) {
    questions.push({
      type: "king-square",
      prompt: "Which square is the white king on?",
      options: shuffle([whiteKing, neighbour(whiteKing, 1, 0), neighbour(whiteKing, -1, 0), neighbour(whiteKing, 0, 1)].filter(Boolean) as string[]).slice(0, 4),
      answer: whiteKing,
    });
  }
  if (blackKing) {
    questions.push({
      type: "king-square",
      prompt: "Which square is the black king on?",
      options: shuffle([blackKing, neighbour(blackKing, 1, 0), neighbour(blackKing, -1, 0), neighbour(blackKing, 0, 1)].filter(Boolean) as string[]).slice(0, 4),
      answer: blackKing,
    });
  }

  return questions;
}

/* ---------------------------------------------------------------------- */
/* Blindfold mode (Phase 3.4)                                              */
/* ---------------------------------------------------------------------- */

export interface BlindfoldQuestion {
  /** FEN before any blindfold moves are played. */
  startFen: string;
  /** SAN moves the user must visualize being played. */
  moves: string[];
  /** Question to answer about the position AFTER `moves` are applied. */
  question: VisualizationQuestion;
  /** FEN at the end (kept server-side for grading, not shown to UI). */
  endFen: string;
}

/**
 * Builds a blindfold puzzle: starting from `startFen`, the user
 * mentally plays 4-8 SAN moves and answers a multiple-choice question
 * about the resulting position.
 *
 * The board is hidden in the UI — only the move list is shown.
 */
export function buildBlindfoldQuestion(startFen: string, moveCount = 4): BlindfoldQuestion {
  const c = new Chess(startFen);
  const played: string[] = [];
  // Play `moveCount` random legal-ish moves so we always end up in a
  // legal position. We pick the engine's "best" move heuristically by
  // taking the first legal move from chess.js (the order is
  // deterministic which keeps reloads stable when the seed FEN is
  // fixed) — good enough for a training drill.
  for (let i = 0; i < moveCount; i++) {
    const legal = c.moves();
    if (legal.length === 0) break;
    const choice = legal[Math.floor(Math.random() * legal.length)];
    c.move(choice);
    played.push(choice);
  }
  const endFen = c.fen();
  const candidateQuestions = buildVisualizationQuestions(endFen);
  const question =
    candidateQuestions[Math.floor(Math.random() * candidateQuestions.length)];
  return { startFen, moves: played, question, endFen };
}

export function buildBlindTacticsFromProblem(problem: TrainingProblem): InsertTrainingProblem {
  const hidePlies = Math.max(1, Math.min(4, 6 - problem.difficulty));
  return {
    module: "visualization",
    fen: problem.fen,
    solution: problem.solution as string[],
    difficulty: problem.difficulty,
    themes: ["blind-tactics", ...((problem.themes as string[] | null) ?? [])],
    tacticType: "blind-tactics",
    explanation: problem.explanation,
    source: "derived",
    sourceGameId: problem.sourceGameId,
    metadata: { hidePlies, baseProblemId: problem.id },
  };
}

function neighbour(sq: string, df: number, dr: number): string | null {
  const f = sq.charCodeAt(0) - 97 + df;
  const r = Number(sq[1]) - 1 + dr;
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return String.fromCharCode(97 + f) + (r + 1);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
