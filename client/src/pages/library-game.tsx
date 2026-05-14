/**
 * Single library game viewer. Renders the board with arrow keys / move
 * list navigation and a side panel of opening / event / rating headers.
 * Acts as the "drill into a master game" experience surfaced from the
 * library explorer's sample games table.
 */
import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
} from "lucide-react";

interface LibraryGame {
  id: number;
  source: string;
  tier: string;
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  result: string | null;
  eco: string | null;
  opening: string | null;
  event: string | null;
  site: string | null;
  playedAt: string | null;
  timeControl: string | null;
  pgn: string;
  plyCount: number;
}

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function LibraryGamePage() {
  const [, params] = useRoute<{ id: string }>("/library/games/:id");
  const id = Number(params?.id);

  const game = useQuery({
    queryKey: ["library-game", id],
    queryFn: () => api<{ game: LibraryGame }>(`/api/library/games/${id}`),
    enabled: Number.isFinite(id),
  });

  const [ply, setPly] = React.useState(0);
  React.useEffect(() => {
    setPly(0);
  }, [id]);

  const positions = React.useMemo(() => {
    if (!game.data?.game.pgn) return [{ fen: STARTING_FEN, san: "" }];
    try {
      const c = new Chess();
      c.loadPgn(game.data.game.pgn, { strict: false });
      const history: Move[] = c.history({ verbose: true });
      const replay = new Chess();
      const out: { fen: string; san: string }[] = [
        { fen: replay.fen(), san: "" },
      ];
      for (const m of history) {
        replay.move(m);
        out.push({ fen: replay.fen(), san: m.san });
      }
      return out;
    } catch {
      return [{ fen: STARTING_FEN, san: "" }];
    }
  }, [game.data?.game.pgn]);

  const fen = positions[Math.min(ply, positions.length - 1)]?.fen ?? STARTING_FEN;
  const lastMove =
    ply > 0 && positions[ply]?.san ? ([positions[ply].san] as unknown as undefined) : undefined;
  void lastMove;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight")
        setPly((p) => Math.min(positions.length - 1, p + 1));
      else if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      else if (e.key === "Home") setPly(0);
      else if (e.key === "End") setPly(positions.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [positions.length]);

  if (game.isLoading) {
    return <div className="text-sm text-muted-foreground p-6">Loading…</div>;
  }
  if (!game.data) {
    return <div className="text-sm text-muted-foreground p-6">Not found.</div>;
  }

  const g = game.data.game;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/library"
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to library
          </Link>
          <h1 className="text-xl font-bold mt-1">
            {g.whitePlayer ?? "?"}
            {g.whiteRating != null && (
              <span className="text-muted-foreground"> ({g.whiteRating})</span>
            )}
            <span className="mx-2 text-muted-foreground">vs</span>
            {g.blackPlayer ?? "?"}
            {g.blackRating != null && (
              <span className="text-muted-foreground"> ({g.blackRating})</span>
            )}
          </h1>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            {g.event && <span>{g.event}</span>}
            {g.playedAt && (
              <span>· {new Date(g.playedAt).toISOString().slice(0, 10)}</span>
            )}
            {g.eco && <span>· ECO {g.eco}</span>}
            {g.opening && <span>· {g.opening}</span>}
            <Badge variant="outline" className="text-[10px]">
              {g.tier}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {g.source}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              {g.result ?? "*"}
            </Badge>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/training?fromLibrary=${g.id}`}>
            <Sparkles className="h-4 w-4 mr-2" /> Generate training from this game
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="aspect-square w-full max-w-[560px] mx-auto">
              <Chessboard fen={fen} />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPly(0)}
                disabled={ply === 0}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPly((p) => Math.max(0, p - 1))}
                disabled={ply === 0}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums w-20 text-center">
                {ply} / {positions.length - 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPly((p) => Math.min(positions.length - 1, p + 1))
                }
                disabled={ply >= positions.length - 1}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPly(positions.length - 1)}
                disabled={ply >= positions.length - 1}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Tip: arrow keys navigate moves.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Move list</h3>
            <div className="max-h-[560px] overflow-y-auto text-sm font-mono leading-7">
              {positions.slice(1).map((p, i) => {
                const fullMove = Math.floor(i / 2) + 1;
                const isWhite = i % 2 === 0;
                const isCurrent = i + 1 === ply;
                return (
                  <React.Fragment key={i}>
                    {isWhite && (
                      <span className="text-muted-foreground mr-1">
                        {fullMove}.
                      </span>
                    )}
                    <button
                      onClick={() => setPly(i + 1)}
                      className={`mr-2 rounded px-1 ${
                        isCurrent ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      {p.san}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Raw PGN
              </summary>
              <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/30 p-2 rounded">
                {g.pgn}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
