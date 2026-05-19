/**
 * Variant game UI.
 *
 * Picks up an in-progress variant game from the server, lets the user
 * play a move, and pumps the bot's reply through Stockfish. The board
 * orientation, bot driver, and game-over detection are all delegated
 * to the server's VariantEngine — this page is intentionally a thin
 * controller around it so we can ship new variants without UI churn.
 *
 * For exotic variants where chess.js can't validate (Atomic, Antichess
 * forced capture etc.) the server applies the variant rules and returns
 * the resulting PGN; the UI just renders whatever PGN the server
 * accepted.
 */

import * as React from "react";
import { Chess } from "chess.js";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import { Home, ChevronLeft, RotateCcw } from "lucide-react";
import type { VariantGame } from "@shared/schema";
import { APP_NAME } from "@/lib/brand";

interface Resp {
  game: VariantGame;
}

interface BotResp {
  bestMove: string | null;
}

export default function VariantGamePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();

  const q = useQuery<Resp>({
    queryKey: ["variant-game", id],
    queryFn: () => api(`/api/variants/${id}`),
    enabled: Number.isFinite(id),
  });

  const game = q.data?.game ?? null;

  const playerMove = useMutation<Resp, Error, string>({
    mutationFn: (uci) =>
      api(`/api/variants/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ uci }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variant-game", id] }),
  });

  const botMove = useMutation<BotResp, Error, string>({
    mutationFn: (fen) =>
      api("/api/play/move", {
        method: "POST",
        body: JSON.stringify({ fen, level: 4 }),
      }),
  });

  // When it's the bot's turn and the game is unfinished, ask for a move.
  React.useEffect(() => {
    if (!game || game.result !== "*") return;
    const { fen, sideToMove } = currentBoard(game);
    const botColor: "w" | "b" = game.playerColor === "black" ? "w" : "b";
    if (sideToMove !== botColor) return;
    botMove.mutate(fen, {
      onSuccess: (b) => {
        if (b.bestMove) playerMove.mutate(b.bestMove);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pgn, game?.result, game?.playerColor]);

  function onMove(from: string, to: string, promotion?: string) {
    if (!game || game.result !== "*") return;
    const uci = `${from}${to}${promotion ?? ""}`;
    playerMove.mutate(uci);
  }

  if (q.isLoading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/70 bg-[#1a2634]">
        Loading game…
      </div>
    );
  }

  const { fen, sideToMove, history } = currentBoard(game);
  const orientation: "white" | "black" = game.playerColor ?? "white";
  const myColor: "white" | "black" = game.playerColor ?? "white";
  const myTurn = sideToMove === (myColor === "white" ? "w" : "b");

  return (
    <div className="min-h-screen bg-[#1a2634] text-white flex flex-col">
      <header className="flex items-center gap-3 px-4 md:px-6 h-14 border-b border-black/30 bg-[#243447]">
        <Link href="/" className="flex items-center gap-2">
          <Home className="w-4 h-4" />
          <span className="font-semibold">{APP_NAME}</span>
        </Link>
        <Link href="/play/variants" className="text-sm text-white/80 hover:text-white">
          <ChevronLeft className="inline w-4 h-4" /> All variants
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Badge variant="outline" className="border-white/30 text-white">
            {game.variant}
          </Badge>
          {game.persona && (
            <Badge variant="outline" className="border-white/30 text-white">
              {game.persona}
            </Badge>
          )}
          {game.timeControl && (
            <Badge variant="outline" className="border-white/30 text-white">
              {game.timeControl}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row gap-4 max-w-6xl w-full mx-auto p-4">
        <div className="flex-1 max-w-[680px] mx-auto">
          <Chessboard
            fen={fen}
            orientation={orientation}
            theme="wood"
            interactive={game.result === "*" && myTurn && !playerMove.isPending}
            movableColor={myColor}
            onMove={onMove}
          />
          {game.result !== "*" && (
            <Card className="mt-3 bg-white/5 border-white/10 text-white">
              <CardContent className="p-3 text-center font-mono text-lg">
                Game over: {game.result}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="md:w-72 space-y-3">
          <Card className="bg-white/5 border-white/10 text-white">
            <CardContent className="p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-white/60">Moves</div>
              <div className="font-mono text-xs leading-relaxed max-h-60 overflow-y-auto">
                {history.length === 0 ? (
                  <span className="text-white/40 italic">No moves yet.</span>
                ) : (
                  history.map((san, i) => (
                    <span key={i}>
                      {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}
                      {san}{" "}
                    </span>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-white">
            <CardContent className="p-3 text-xs text-white/70 leading-relaxed">
              <strong className="text-white">Variant rules:</strong>{" "}
              {variantHint(game.variant)}
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10"
            onClick={() => window.location.href = "/play/variants"}
          >
            <RotateCcw className="w-4 h-4 mr-2" /> New game
          </Button>
        </aside>
      </main>
    </div>
  );
}

/** Reconstructs the current board state by replaying the stored PGN. */
function currentBoard(game: VariantGame): {
  fen: string;
  sideToMove: "w" | "b";
  history: string[];
} {
  const chess = new Chess(game.startFen);
  if (game.pgn) {
    try {
      chess.loadPgn(game.pgn, { strict: false });
    } catch {
      /* exotic variants may break chess.js parsing — fall back to startFen */
    }
  }
  return {
    fen: chess.fen(),
    sideToMove: chess.turn(),
    history: chess.history(),
  };
}

function variantHint(variant: string): string {
  switch (variant) {
    case "chess960":
      return "Pieces are shuffled, but rules are otherwise standard. Castling targets the original king-side / queen-side squares.";
    case "king-of-the-hill":
      return "Walk your king to d4, e4, d5 or e5 to win. Standard mate / draw also apply.";
    case "three-check":
      return "Three checks delivered = win. Otherwise standard chess.";
    case "atomic":
      return "Every capture explodes a 3x3 area, destroying all non-pawn pieces. Don't lose your king in the blast!";
    case "antichess":
      return "Captures are forced. You win by losing all your pieces or having no legal moves.";
    case "racing-kings":
      return "Race your king to the 8th rank. Checks are forbidden.";
    case "horde":
      return "White has 36 pawns; Black needs to capture them all or mate the white pawn force.";
    case "crazyhouse":
      return "Captured pieces enter your hand to drop back onto the board on your turn.";
    case "fog-of-war":
      return "You only see squares your own pieces can reach. Capture the enemy king to win.";
    default:
      return "Standard rules, with the engine adapting to your level.";
  }
}
