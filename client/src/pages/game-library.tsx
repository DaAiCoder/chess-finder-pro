/**
 * Game Library — the giant database explorer.
 *
 * Three-pane layout:
 *  - Left: interactive chessboard. Clicking a move in the right pane
 *    advances the position; you can also play moves manually with the
 *    board.
 *  - Middle: per-tier explorer card. Switch tabs between Masters,
 *    Lichess 2500+, Lichess 2000-2499, Lichess 1600-1999, Lichess <1600,
 *    and "My Library" (locally ingested games). Each tier shows the
 *    most-played continuations with WDL bars, play rate, and average
 *    rating per move.
 *  - Bottom: sample games reaching the current position. Click into one
 *    to view the full game.
 *
 * Also exposes admin tools (import Lichess/Chess.com user, upload PGN
 * blob) so the library can grow on demand.
 */
import * as React from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { api } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Download,
  RotateCcw,
  Search,
  Upload,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------- */
/* Types mirroring the server's ExplorerResult                             */
/* ---------------------------------------------------------------------- */

type ExplorerTier =
  | "masters"
  | "lichess-2500"
  | "lichess-2000"
  | "lichess-1600"
  | "lichess-1200"
  | "local";

interface ExplorerMove {
  san: string;
  uci: string;
  whiteWins: number;
  draws: number;
  blackWins: number;
  games: number;
  rate: number;
  whiteScore: number;
  avgRating: number | null;
}

interface ExplorerSampleGame {
  libraryGameId?: number;
  lichessGameId?: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  year?: number;
}

interface ExplorerResult {
  tier: ExplorerTier;
  label: string;
  epd: string;
  totalGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgRating: number | null;
  moves: ExplorerMove[];
  sampleGames: ExplorerSampleGame[];
  cached: boolean;
  refreshedAt: string;
}

interface ExploreResponse {
  fen: string;
  epd: string;
  tiers: ExplorerResult[];
}

interface LibraryOverview {
  total: number;
  tiers: Array<{ tier: string; label: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}

interface LibraryGameSummary {
  id: number;
  source: string;
  tier: string;
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  avgRating: number | null;
  result: string | null;
  eco: string | null;
  opening: string | null;
  event: string | null;
  playedAt: string | null;
  plyCount: number;
  timeControl: string | null;
}

interface ListGamesResponse {
  total: number;
  offset: number;
  limit: number;
  games: LibraryGameSummary[];
}

const TIER_ORDER: ExplorerTier[] = [
  "masters",
  "lichess-2500",
  "lichess-2000",
  "lichess-1600",
  "lichess-1200",
  "local",
];

const TIER_SHORT_LABEL: Record<ExplorerTier, string> = {
  masters: "Masters",
  "lichess-2500": "2500+",
  "lichess-2000": "2000-2499",
  "lichess-1600": "1600-1999",
  "lichess-1200": "<1600",
  local: "My Library",
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* ---------------------------------------------------------------------- */
/* Page                                                                   */
/* ---------------------------------------------------------------------- */

export default function GameLibraryPage() {
  const [fen, setFen] = React.useState(STARTING_FEN);
  const [history, setHistory] = React.useState<{ fen: string; san: string }[]>([]);
  const [activeTier, setActiveTier] = React.useState<ExplorerTier>("masters");

  const explore = useQuery<ExploreResponse>({
    queryKey: ["library-explore", fen],
    queryFn: () =>
      api<ExploreResponse>("/api/library/explore", {
        method: "POST",
        body: JSON.stringify({ fen }),
      }),
    staleTime: 60_000,
  });

  const overview = useQuery<LibraryOverview>({
    queryKey: ["library-overview"],
    queryFn: () => api<LibraryOverview>("/api/library/overview"),
    staleTime: 30_000,
  });

  // Reset board to start.
  function reset() {
    setFen(STARTING_FEN);
    setHistory([]);
  }
  // Take back the most recent move.
  function undo() {
    if (history.length === 0) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setFen(next.length === 0 ? STARTING_FEN : next[next.length - 1].fen);
  }
  // Push a move (by SAN).
  function playSan(san: string) {
    try {
      const c = new Chess(fen);
      const m = c.move(san);
      if (!m) return;
      setFen(c.fen());
      setHistory((h) => [...h, { fen: c.fen(), san }]);
    } catch {
      /* invalid move */
    }
  }
  function onBoardMove(from: string, to: string, promotion?: string) {
    try {
      const c = new Chess(fen);
      const m = c.move({ from, to, promotion });
      if (!m) return;
      setFen(c.fen());
      setHistory((h) => [...h, { fen: c.fen(), san: m.san }]);
    } catch {
      /* ignore */
    }
  }

  const activeTierResult =
    explore.data?.tiers.find((t) => t.tier === activeTier) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Game Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Explore positions across millions of master, club, and amateur
            games. Filter by skill level to see how each population plays
            this move.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportPgnDialog />
          <ImportLichessDialog />
          <ImportChessComDialog />
          <Button asChild variant="outline" size="sm">
            <Link href="/training">
              <Sparkles className="h-4 w-4 mr-2" /> Train from library
            </Link>
          </Button>
        </div>
      </header>

      {overview.data && <LibrarySummary overview={overview.data} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* Left pane — board + move list */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="aspect-square w-full max-w-[480px] mx-auto">
              <Chessboard
                fen={fen}
                interactive
                onMove={onBoardMove}
                lastMove={
                  history.length > 0 && history[history.length - 1].san
                    ? undefined
                    : undefined
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={reset} disabled={history.length === 0}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {history.length} {history.length === 1 ? "ply" : "plies"} played
              </div>
            </div>
            {history.length > 0 && (
              <MoveList moves={history} />
            )}
          </CardContent>
        </Card>

        {/* Right pane — explorer */}
        <Card>
          <CardContent className="p-4">
            <Tabs value={activeTier} onValueChange={(v) => setActiveTier(v as ExplorerTier)}>
              <TabsList className="grid grid-cols-6 w-full">
                {TIER_ORDER.map((t) => (
                  <TabsTrigger key={t} value={t} className="text-[10px] px-1">
                    {TIER_SHORT_LABEL[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TIER_ORDER.map((t) => (
                <TabsContent key={t} value={t} className="mt-4">
                  <ExplorerCard
                    result={
                      explore.data?.tiers.find((r) => r.tier === t) ?? null
                    }
                    loading={explore.isFetching}
                    onPlayMove={playSan}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Sample games for the active tier */}
      <SampleGamesPanel
        result={activeTierResult}
        currentFen={fen}
      />

      {/* Recent library games table */}
      <RecentLibraryGames />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Library summary card                                                   */
/* ---------------------------------------------------------------------- */

function LibrarySummary({ overview }: { overview: LibraryOverview }) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Local games</div>
            <div className="text-lg font-semibold">{overview.total.toLocaleString()}</div>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        {overview.tiers
          .filter((t) => t.count > 0)
          .map((t) => (
            <Badge key={t.tier} variant="secondary">
              {t.label}: {t.count.toLocaleString()}
            </Badge>
          ))}
        {overview.total === 0 && (
          <p className="text-xs text-muted-foreground">
            Your local library is empty. The position explorer still pulls
            from Lichess masters and tier-banded amateur play. Import
            games below to seed the "My Library" tab.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Explorer card — per-tier moves table                                    */
/* ---------------------------------------------------------------------- */

function ExplorerCard({
  result,
  loading,
  onPlayMove,
}: {
  result: ExplorerResult | null;
  loading: boolean;
  onPlayMove: (san: string) => void;
}) {
  if (loading && !result) {
    return <div className="text-sm text-muted-foreground">Querying…</div>;
  }
  if (!result || result.totalGames === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No games in this tier reach the position yet.
        </p>
        <p className="text-xs text-muted-foreground">
          {result?.tier === "local" ? (
            <>
              Try the <strong>Masters</strong> tab — it falls back to the
              bundled champion games library when no local match exists.
              Or import more games via the buttons above.
            </>
          ) : result?.tier === "masters" ? (
            <>
              The bundled master games library is still seeding in the
              background — give it a few seconds and refresh, or play a
              move on the board to query a different position.
            </>
          ) : (
            <>
              Lichess open explorer didn&apos;t return data for this tier (the
              public API can rate-limit unauthenticated clients). After a server
              restart, bundled <strong>rated-band</strong> games (club Elo
              ranges) also hydrate this tab from your local library. Try the{" "}
              <strong>Masters</strong> tab for champion games, or refresh once
              seeding has finished.
            </>
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">
            {result.totalGames.toLocaleString()} games
          </div>
          {result.avgRating != null && (
            <div className="text-xs text-muted-foreground">
              Avg rating: {result.avgRating}
            </div>
          )}
        </div>
        <WdlBar
          white={result.whiteWins}
          draws={result.draws}
          black={result.blackWins}
          className="w-32"
        />
      </div>
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-2 py-1">Move</th>
              <th className="px-2 py-1 text-right">Games</th>
              <th className="px-2 py-1 text-right">Play %</th>
              <th className="px-2 py-1">WDL (white POV)</th>
              <th className="px-2 py-1 text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {result.moves.slice(0, 12).map((m) => (
              <tr
                key={m.uci}
                className="border-t border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onPlayMove(m.san)}
              >
                <td className="px-2 py-1 font-mono font-semibold">{m.san}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {m.games.toLocaleString()}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {(m.rate * 100).toFixed(1)}%
                </td>
                <td className="px-2 py-1">
                  <WdlBar
                    white={m.whiteWins}
                    draws={m.draws}
                    black={m.blackWins}
                    showText
                    className="w-full"
                  />
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {m.avgRating ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {result.cached ? "Cached" : "Fresh"} ·
        Last refreshed: {new Date(result.refreshedAt).toLocaleString()}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* WDL bar component                                                       */
/* ---------------------------------------------------------------------- */

function WdlBar({
  white,
  draws,
  black,
  showText = false,
  className,
}: {
  white: number;
  draws: number;
  black: number;
  showText?: boolean;
  className?: string;
}) {
  const total = white + draws + black || 1;
  const w = (white / total) * 100;
  const d = (draws / total) * 100;
  const b = (black / total) * 100;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex h-3 flex-1 rounded overflow-hidden border border-border">
        <div className="bg-white" style={{ width: `${w}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${d}%` }} />
        <div className="bg-black" style={{ width: `${b}%` }} />
      </div>
      {showText && (
        <div className="text-[10px] tabular-nums text-muted-foreground w-20 text-right">
          {w.toFixed(0)}/{d.toFixed(0)}/{b.toFixed(0)}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Move list                                                              */
/* ---------------------------------------------------------------------- */

function MoveList({ moves }: { moves: { fen: string; san: string }[] }) {
  return (
    <div className="text-xs font-mono leading-6 max-h-32 overflow-y-auto">
      {moves.map((m, i) => {
        const fullMove = Math.floor(i / 2) + 1;
        const isWhite = i % 2 === 0;
        return (
          <span key={i} className="mr-2">
            {isWhite && <span className="text-muted-foreground">{fullMove}. </span>}
            {m.san}{" "}
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sample games for current position                                       */
/* ---------------------------------------------------------------------- */

function SampleGamesPanel({
  result,
  currentFen,
}: {
  result: ExplorerResult | null;
  currentFen: string;
}) {
  if (!result || result.sampleGames.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-2">
          Sample games reaching this position
        </h3>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-2 py-1">White</th>
                <th className="px-2 py-1">Black</th>
                <th className="px-2 py-1">Result</th>
                <th className="px-2 py-1">Year</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {result.sampleGames.map((g, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-1">
                    {g.white}{" "}
                    {g.whiteRating != null && (
                      <span className="text-muted-foreground">({g.whiteRating})</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {g.black}{" "}
                    {g.blackRating != null && (
                      <span className="text-muted-foreground">({g.blackRating})</span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono">{g.result}</td>
                  <td className="px-2 py-1">{g.year ?? "—"}</td>
                  <td className="px-2 py-1 text-right">
                    {g.libraryGameId ? (
                      <Link
                        href={`/library/games/${g.libraryGameId}`}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    ) : g.lichessGameId ? (
                      <a
                        href={`https://lichess.org/${g.lichessGameId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Lichess →
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Position: <span className="font-mono">{currentFen}</span>
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Recent library games table                                              */
/* ---------------------------------------------------------------------- */

function RecentLibraryGames() {
  const [filter, setFilter] = React.useState({
    tier: "",
    player: "",
  });
  const [debouncedPlayer, setDebouncedPlayer] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedPlayer(filter.player), 300);
    return () => clearTimeout(t);
  }, [filter.player]);

  const games = useQuery<ListGamesResponse>({
    queryKey: ["library-games", filter.tier, debouncedPlayer],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filter.tier) p.set("tier", filter.tier);
      if (debouncedPlayer) p.set("player", debouncedPlayer);
      p.set("limit", "25");
      return api<ListGamesResponse>(`/api/library/games?${p.toString()}`);
    },
    staleTime: 15_000,
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold">Recently imported games</h3>
          <div className="flex items-center gap-2">
            <select
              className="text-xs bg-background border border-border rounded px-2 py-1"
              value={filter.tier}
              onChange={(e) => setFilter((f) => ({ ...f, tier: e.target.value }))}
            >
              <option value="">All tiers</option>
              <option value="masters">Masters (2400+)</option>
              <option value="titled">Titled (2200-2399)</option>
              <option value="expert">Expert (2000-2199)</option>
              <option value="intermediate">Club (1600-1999)</option>
              <option value="amateur">Amateur (&lt;1600)</option>
              <option value="broadcast">Broadcast</option>
            </select>
            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search player…"
                value={filter.player}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, player: e.target.value }))
                }
                className="pl-7 text-xs h-7 w-40"
              />
            </div>
          </div>
        </div>

        {games.isLoading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {games.data && games.data.games.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No games yet — import some from Lichess, Chess.com, or paste a
            PGN above.
          </div>
        )}
        {games.data && games.data.games.length > 0 && (
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-2 py-1">White</th>
                  <th className="px-2 py-1">Black</th>
                  <th className="px-2 py-1">ECO</th>
                  <th className="px-2 py-1">Result</th>
                  <th className="px-2 py-1">Tier</th>
                  <th className="px-2 py-1">Plies</th>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {games.data.games.map((g) => (
                  <tr key={g.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-2 py-1">
                      {g.whitePlayer ?? "?"}{" "}
                      {g.whiteRating != null && (
                        <span className="text-muted-foreground">({g.whiteRating})</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {g.blackPlayer ?? "?"}{" "}
                      {g.blackRating != null && (
                        <span className="text-muted-foreground">({g.blackRating})</span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono">{g.eco ?? ""}</td>
                    <td className="px-2 py-1 font-mono">{g.result ?? "*"}</td>
                    <td className="px-2 py-1">
                      <Badge variant="outline" className="text-[10px]">
                        {g.tier}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 tabular-nums">{g.plyCount}</td>
                    <td className="px-2 py-1">
                      {g.playedAt
                        ? new Date(g.playedAt).toISOString().slice(0, 10)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Link
                        href={`/library/games/${g.id}`}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {games.data && games.data.total > games.data.games.length && (
          <div className="text-xs text-muted-foreground">
            Showing {games.data.games.length} of {games.data.total.toLocaleString()}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Import dialogs                                                          */
/* ---------------------------------------------------------------------- */

function ImportPgnDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [pgn, setPgn] = React.useState("");
  const [tier, setTier] = React.useState<string>("");
  const m = useMutation({
    mutationFn: () =>
      api<{ summary: { inserted: number; duplicate: number; errors: number } }>(
        "/api/library/ingest/pgn",
        {
          method: "POST",
          body: JSON.stringify({
            pgn,
            tier: tier || undefined,
            source: "pgn",
          }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-overview"] });
      qc.invalidateQueries({ queryKey: ["library-games"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" /> Paste PGN
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import PGN into Library</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <select
            className="w-full text-sm bg-background border border-border rounded px-2 py-1"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="">Auto-classify by rating</option>
            <option value="masters">Masters (2400+)</option>
            <option value="titled">Titled (2200-2399)</option>
            <option value="expert">Expert (2000-2199)</option>
            <option value="intermediate">Club (1600-1999)</option>
            <option value="amateur">Amateur (&lt;1600)</option>
            <option value="broadcast">Broadcast</option>
          </select>
          <textarea
            className="w-full h-64 text-xs font-mono bg-background border border-border rounded p-2"
            placeholder="[Event ...]&#10;[White ...]&#10;1. e4 e5 ..."
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
          />
          {m.data?.summary && (
            <div className="text-xs text-muted-foreground">
              Inserted: {m.data.summary.inserted} · Duplicate:{" "}
              {m.data.summary.duplicate} · Errors: {m.data.summary.errors}
            </div>
          )}
          {m.isError && (
            <div className="text-xs text-red-500">
              {(m.error as Error).message}
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || pgn.trim().length === 0}
          >
            {m.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportLichessDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [maxGames, setMaxGames] = React.useState(200);
  const m = useMutation({
    mutationFn: () =>
      api<{ summary: { inserted: number; duplicate: number; errors: number } }>(
        "/api/library/ingest/lichess",
        {
          method: "POST",
          body: JSON.stringify({ username, max: maxGames }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-overview"] });
      qc.invalidateQueries({ queryKey: ["library-games"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" /> Lichess user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Lichess user games</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Lichess username (e.g. magnuscarlsen)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs">Max games</label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={maxGames}
              onChange={(e) => setMaxGames(Number(e.target.value) || 200)}
              className="w-24"
            />
          </div>
          {m.data?.summary && (
            <div className="text-xs text-muted-foreground">
              Inserted: {m.data.summary.inserted} · Duplicate:{" "}
              {m.data.summary.duplicate} · Errors: {m.data.summary.errors}
            </div>
          )}
          {m.isError && (
            <div className="text-xs text-red-500">{(m.error as Error).message}</div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || username.trim().length === 0}
          >
            {m.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportChessComDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [months, setMonths] = React.useState(3);
  const m = useMutation({
    mutationFn: () =>
      api<{ summary: { inserted: number; duplicate: number; errors: number } }>(
        "/api/library/ingest/chess-com",
        {
          method: "POST",
          body: JSON.stringify({ username, monthsBack: months }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-overview"] });
      qc.invalidateQueries({ queryKey: ["library-games"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" /> Chess.com user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Chess.com user games</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Chess.com username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs">Months back</label>
            <Input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 3)}
              className="w-24"
            />
          </div>
          {m.data?.summary && (
            <div className="text-xs text-muted-foreground">
              Inserted: {m.data.summary.inserted} · Duplicate:{" "}
              {m.data.summary.duplicate} · Errors: {m.data.summary.errors}
            </div>
          )}
          {m.isError && (
            <div className="text-xs text-red-500">{(m.error as Error).message}</div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || username.trim().length === 0}
          >
            {m.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Touch-import so tree-shaking keeps ArrowRight reachable if we use it later.
void ArrowRight;
