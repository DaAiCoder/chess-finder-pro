/**
 * Step-through chess board for a finished SAN line.
 *
 * Given a list of SAN moves from the initial position, renders a board
 * with prev/next/start/end controls and a clickable move list. The
 * `prefixPlies` boundary is rendered subtly so the user can see where
 * the opening prefix ends and the discovered continuation begins.
 */

import * as React from "react";
import { Chess } from "chess.js";
import { Chessboard } from "./Chessboard";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LinePlaybackProps {
  /** Full SAN move list from the start position. */
  moves: string[];
  /** Number of half-moves that belong to the opening prefix. */
  prefixPlies?: number;
  /** Orientation of the board ("white" by default). */
  orientation?: "white" | "black";
  /** Initial ply to show (defaults to the end of the line). */
  initialPly?: number;
  className?: string;
}

export function LinePlayback({
  moves,
  prefixPlies = 0,
  orientation = "white",
  initialPly,
  className,
}: LinePlaybackProps) {
  // Pre-compute the FEN after each ply so navigation is instant.
  const fens = React.useMemo(() => {
    const list: string[] = [new Chess().fen()];
    const c = new Chess();
    for (const san of moves) {
      try {
        c.move(san);
        list.push(c.fen());
      } catch {
        break;
      }
    }
    return list;
  }, [moves]);

  const total = fens.length - 1;
  const [ply, setPly] = React.useState<number>(initialPly ?? total);

  // Re-clamp when the moves list changes (new line selected).
  React.useEffect(() => {
    setPly(initialPly ?? fens.length - 1);
  }, [moves, initialPly, fens.length]);

  const fen = fens[Math.max(0, Math.min(ply, total))];
  const lastMove: [string, string] | undefined = React.useMemo(() => {
    if (ply <= 0) return undefined;
    // Re-derive the from/to squares for the last move played.
    const c = new Chess();
    for (let i = 0; i < ply - 1; i++) c.move(moves[i]);
    try {
      const m = c.move(moves[ply - 1]);
      if (m) return [m.from, m.to];
    } catch {
      /* ignore */
    }
    return undefined;
  }, [ply, moves]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Chessboard
        fen={fen}
        orientation={orientation}
        interactive={false}
        lastMove={lastMove}
      />

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => setPly(0)} aria-label="Go to start">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPly((p) => Math.max(0, p - 1))}
          aria-label="Previous move"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center text-sm tabular-nums text-muted-foreground">
          Move {Math.ceil(ply / 2)} / {Math.ceil(total / 2)}
          {ply > prefixPlies ? (
            <span className="ml-2 text-xs uppercase tracking-wide text-primary">
              discovered
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPly((p) => Math.min(total, p + 1))}
          aria-label="Next move"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPly(total)}
          aria-label="Go to end"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 text-sm leading-tight">
        {moves.map((san, idx) => {
          const isWhiteMove = idx % 2 === 0;
          const moveNo = Math.floor(idx / 2) + 1;
          const isPrefix = idx < prefixPlies;
          const isCurrent = idx + 1 === ply;
          return (
            <React.Fragment key={`${idx}-${san}`}>
              {isWhiteMove ? (
                <span className="font-medium tabular-nums text-muted-foreground pr-1">
                  {moveNo}.
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setPly(idx + 1)}
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isPrefix
                      ? "text-muted-foreground hover:bg-muted"
                      : "hover:bg-muted",
                )}
              >
                {san}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
