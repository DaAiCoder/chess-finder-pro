import * as React from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key, Color, Dests } from "chessground/types";
import { Chess, type Square } from "chess.js";
import { cn } from "@/lib/utils";

export interface ChessboardProps {
  fen: string;
  orientation?: "white" | "black";
  /**
   * Board palette. "green" matches chess.com defaults; "wood" / "brown"
   * are the Lichess-style sets; "blue" and "gray" are alternates. The
   * user's preferred theme lives on `users.preferences.boardTheme` and
   * is propagated by `useBoardTheme`.
   */
  theme?: "green" | "wood" | "brown" | "blue" | "gray";
  /** Allow pieces to be moved by the user. Defaults to false (view-only). */
  interactive?: boolean;
  /** Restrict legal moves to one color. */
  movableColor?: "white" | "black" | "both";
  /** Optional last move to highlight (e.g. ["e2","e4"]). */
  lastMove?: [string, string];
  onMove?: (from: string, to: string, promotion?: string) => void;
  /** Render arrows: pairs of squares with optional brush color. */
  arrows?: { orig: string; dest: string; brush?: "green" | "red" | "blue" | "yellow" }[];
  className?: string;
}

export function Chessboard({
  fen,
  orientation = "white",
  theme = "green",
  interactive = false,
  movableColor = "both",
  lastMove,
  onMove,
  arrows,
  className,
}: ChessboardProps) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const apiRef = React.useRef<Api | null>(null);

  // Chessground's `events.after` is only installed at mount time; calling
  // `set()` later does NOT replace event handlers. We route the callback
  // through refs that we keep in sync each render so the handler always sees
  // the latest `onMove` and `fen` — otherwise the second user move would
  // re-enter the original render's stale closure.
  const onMoveRef = React.useRef(onMove);
  const fenRef = React.useRef(fen);
  React.useEffect(() => {
    onMoveRef.current = onMove;
    fenRef.current = fen;
  });

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const dests = interactive ? legalDests(fen) : new Map<Key, Key[]>();
    const turnColor = sideToMove(fen);
    const config: Config = {
      fen,
      orientation,
      turnColor,
      lastMove: lastMove as Key[] | undefined,
      coordinates: true,
      drawable: { enabled: true, visible: true, autoShapes: shapesFromArrows(arrows) },
      movable: {
        free: false,
        color: interactive
          ? movableColor === "both"
            ? turnColor
            : (movableColor as Color)
          : undefined,
        dests,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const curFen = fenRef.current;
            const resolved = resolveCastleKingDest(curFen, orig, dest);
            const destOut = resolved ?? dest;
            // Auto-promote to queen for now; surface a UI later if needed.
            const promo = needsPromotion(curFen, orig, destOut) ? "q" : undefined;
            onMoveRef.current?.(orig, destOut, promo);
          },
        },
      },
      premovable: { enabled: false },
      animation: { enabled: true, duration: 150 },
      highlight: { lastMove: true, check: true },
    };
    apiRef.current = Chessground(wrapRef.current, config);
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!apiRef.current) return;
    const dests = interactive ? legalDests(fen) : new Map<Key, Key[]>();
    const turnColor = sideToMove(fen);
    apiRef.current.set({
      fen,
      orientation,
      turnColor,
      lastMove: lastMove as Key[] | undefined,
      drawable: { autoShapes: shapesFromArrows(arrows) },
      movable: {
        free: false,
        color: interactive
          ? movableColor === "both"
            ? turnColor
            : (movableColor as Color)
          : undefined,
        dests,
        showDests: true,
      },
    });
  }, [fen, orientation, interactive, movableColor, arrows, lastMove]);

  return (
    <div className={cn("board-aspect", className)}>
      <div ref={wrapRef} className={cn("cg-wrap", themeClass(theme))} />
    </div>
  );
}

function themeClass(theme: ChessboardProps["theme"]): string {
  switch (theme) {
    case "wood":
      return "app-wood";
    case "brown":
      return "app-brown";
    case "blue":
      return "app-blue";
    case "gray":
      return "app-gray";
    case "green":
    default:
      return "app-green";
  }
}

function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

function legalDests(fen: string): Dests {
  const dests = new Map<Key, Key[]>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return dests;
  }
  for (const m of chess.moves({ verbose: true })) {
    const arr = dests.get(m.from as Key) ?? [];
    arr.push(m.to as Key);
    dests.set(m.from as Key, arr);
  }
  // Castling: also allow dropping the king on the castling rook (Lichess-style),
  // and show that square in the green dots so castle is easier to spot.
  for (const { kingFrom, rookSq, kingTo } of castleRookShortcuts(chess)) {
    const arr = dests.get(kingFrom) ?? [];
    if (!arr.includes(rookSq)) arr.push(rookSq);
    dests.set(kingFrom, arr);
  }
  return dests;
}

/** King-from, rook-square (king may be dropped here), canonical king landing. */
function castleRookShortcuts(chess: Chess): { kingFrom: Key; rookSq: Key; kingTo: Key }[] {
  const out: { kingFrom: Key; rookSq: Key; kingTo: Key }[] = [];
  for (const m of chess.moves({ verbose: true })) {
    if (!m.isKingsideCastle() && !m.isQueensideCastle()) continue;
    const rookSq = rookSquareForCastle(chess, m.from as Square, m.to as Square);
    if (!rookSq) continue;
    out.push({ kingFrom: m.from as Key, rookSq: rookSq as Key, kingTo: m.to as Key });
  }
  return out;
}

/**
 * From the king's start and castle landing, find the castling rook's square
 * (first own rook along the ray from the king toward the castle side).
 */
function rookSquareForCastle(chess: Chess, kingFrom: Square, kingTo: Square): Square | null {
  const files = "abcdefgh";
  const f0 = files.indexOf(kingFrom[0]!);
  const f1 = files.indexOf(kingTo[0]!);
  if (f0 < 0 || f1 < 0) return null;
  const dir = f1 > f0 ? 1 : -1;
  const rank = kingFrom[1];
  let f = f0 + dir;
  while (f >= 0 && f <= 7) {
    const sq = `${files[f]}${rank}` as Square;
    const p = chess.get(sq);
    if (!p) {
      f += dir;
      continue;
    }
    if (p.type === "r" && p.color === chess.turn()) return sq;
    return null;
  }
  return null;
}

/** If the user dropped the king on the castling rook, return the real king `to` square. */
function resolveCastleKingDest(fen: string, orig: Key, dest: Key): Key | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  for (const { kingFrom, rookSq, kingTo } of castleRookShortcuts(chess)) {
    if (orig === kingFrom && dest === rookSq) return kingTo;
  }
  return null;
}

function needsPromotion(fen: string, from: string, to: string): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from as Square);
    if (!piece || piece.type !== "p") return false;
    const rank = to[1];
    return rank === "1" || rank === "8";
  } catch {
    return false;
  }
}

function shapesFromArrows(
  arrows: ChessboardProps["arrows"],
): { orig: Key; dest: Key; brush: string }[] {
  if (!arrows) return [];
  return arrows.map((a) => ({
    orig: a.orig as Key,
    dest: a.dest as Key,
    brush: a.brush ?? "green",
  }));
}
