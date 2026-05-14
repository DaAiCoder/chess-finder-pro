import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  Eye,
  Globe,
  Library,
  Loader2,
  Play,
  Quote,
  Search,
  Sparkles,
  Sword,
  Target,
  TrendingUp,
} from "lucide-react";

type Era = "romantic" | "classical" | "hypermodern" | "soviet" | "modern" | "current";
type Style = string;

interface FamousGame {
  name: string;
  opponent: string;
  year: number;
  pgn: string;
  significance?: string;
}

interface Champion {
  id: string;
  fullName: string;
  displayName: string;
  countryCode: string;
  countryEmoji: string;
  born: number;
  died?: number;
  era: Era;
  peakRating: number;
  worldChampionYears?: [number, number];
  championship?: string;
  style: Style[];
  bio: string;
  quote?: string;
  signatureOpeningsWhite: string[];
  signatureOpeningsBlack: string[];
  wikipediaUrl: string;
  chessgamesUrl?: string;
  lichessUsername?: string;
  chesscomUsername?: string;
  photoUrl?: string;
  famousGames?: FamousGame[];
  /** True when the server has a bundled PGN Mentor library for this champion. */
  hasLibrary?: boolean;
}

interface LibraryGameHeaders {
  white: string;
  black: string;
  date: string;
  result: string;
  event: string;
  eco: string;
  whiteElo: number | null;
  blackElo: number | null;
}
interface LibraryGameSummary {
  index: number;
  headers: LibraryGameHeaders;
}
interface LibraryGamesPage {
  total: number;
  matched: number;
  page: number;
  limit: number;
  games: LibraryGameSummary[];
}
interface LibraryGameFull extends LibraryGameSummary {
  pgn: string;
}

const ERA_COLOR: Record<Era, string> = {
  romantic: "#a855f7",
  classical: "#3b82f6",
  hypermodern: "#14b8a6",
  soviet: "#ef4444",
  modern: "#f59e0b",
  current: "#22c55e",
};

const STYLE_COLOR: Record<string, string> = {
  attacker: "#ef4444",
  positional: "#3b82f6",
  tactician: "#a855f7",
  endgame: "#f59e0b",
  universal: "#22c55e",
  theorist: "#14b8a6",
  intuitive: "#ec4899",
  prophylactic: "#6366f1",
};

export default function ChampionDetail() {
  const [, params] = useRoute<{ id: string }>("/champions/:id");
  const id = params?.id;

  const q = useQuery<Champion>({
    queryKey: ["champion", id],
    queryFn: () => api(`/api/champions/${id}`),
    enabled: !!id,
  });

  if (!id) return null;
  if (q.isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading champion…</CardContent>
        </Card>
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">Could not load champion.</CardContent>
        </Card>
      </div>
    );
  }
  return <ChampionView champion={q.data} />;
}

function ChampionView({ champion }: { champion: Champion }) {
  const isVintage = champion.era === "romantic" || champion.era === "classical" || champion.era === "hypermodern";
  const eraColor = ERA_COLOR[champion.era];

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <Link
        href="/champions"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All champions
      </Link>

      {/* Hero card */}
      <Card
        className={cn(
          "overflow-hidden",
          champion.worldChampionYears && "border-amber-500/40",
        )}
      >
        <div
          className="relative"
          style={{
            background: `linear-gradient(135deg, ${eraColor}33, ${eraColor}11 60%, transparent)`,
          }}
        >
          <div className="grid md:grid-cols-[280px_1fr] gap-4 p-4 md:p-6">
            {/* Photo */}
            <div className="relative">
              {champion.photoUrl ? (
                <img
                  src={champion.photoUrl}
                  alt={champion.displayName}
                  className={cn(
                    "w-full aspect-[3/4] object-cover object-center rounded-lg border-2 shadow-lg",
                    isVintage && "sepia-[0.35] contrast-[1.05]",
                  )}
                  style={{ borderColor: champion.worldChampionYears ? "#fbbf24" : eraColor }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  className="w-full aspect-[3/4] rounded-lg border-2 flex items-center justify-center text-7xl"
                  style={{ borderColor: eraColor, backgroundColor: `${eraColor}22` }}
                >
                  {champion.countryEmoji}
                </div>
              )}
              {champion.worldChampionYears && (
                <div className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-[11px] font-bold text-black shadow-md">
                  <Crown className="w-3 h-3" /> World Champion
                </div>
              )}
            </div>

            {/* Bio + meta */}
            <div className="space-y-3 min-w-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: eraColor }}
                  >
                    {champion.era}
                  </span>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Globe className="w-3 h-3" /> {champion.countryEmoji} {champion.countryCode}
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  {champion.displayName}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {champion.fullName} · {champion.born}{champion.died ? ` – ${champion.died}` : ` – present`}
                </p>
                {champion.championship && (
                  <p className="text-sm text-amber-300 font-semibold mt-1">{champion.championship}</p>
                )}
              </div>

              {/* Stat bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatPill label="Peak Rating" value={champion.peakRating} accent="#f59e0b" />
                {champion.worldChampionYears && (
                  <StatPill
                    label="WC Reign"
                    value={`${champion.worldChampionYears[0]}–${champion.worldChampionYears[1]}`}
                    accent="#fbbf24"
                  />
                )}
                <StatPill
                  label="Era"
                  value={champion.era[0].toUpperCase() + champion.era.slice(1)}
                  accent={eraColor}
                />
                <StatPill
                  label="Style"
                  value={champion.style[0]}
                  accent={STYLE_COLOR[champion.style[0]] ?? "#cbd5e1"}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {champion.style.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="text-[10px] uppercase tracking-wide"
                    style={{
                      borderColor: `${STYLE_COLOR[s] ?? "#64748b"}88`,
                      color: STYLE_COLOR[s] ?? "#cbd5e1",
                      backgroundColor: `${STYLE_COLOR[s] ?? "#64748b"}11`,
                    }}
                  >
                    {s}
                  </Badge>
                ))}
              </div>

              {/* WC tenure visualization */}
              {champion.worldChampionYears && (
                <WCTenureBar
                  start={champion.worldChampionYears[0]}
                  end={champion.worldChampionYears[1]}
                  born={champion.born}
                  died={champion.died}
                />
              )}

              <p className="text-sm leading-relaxed text-foreground/90">{champion.bio}</p>

              {champion.quote && (
                <blockquote className="border-l-2 border-amber-400 pl-3 text-sm italic text-amber-100/90">
                  <Quote className="w-3 h-3 inline mr-1 -mt-1 text-amber-400" />
                  {champion.quote}
                </blockquote>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                {champion.lichessUsername && (
                  <Link href={`/opponent-prep`}>
                    <Button
                      size="sm"
                      onClick={() => prefillScout(champion.lichessUsername!, "lichess")}
                    >
                      <Sword className="w-3.5 h-3.5 mr-1.5" />
                      Scout live (lichess)
                    </Button>
                  </Link>
                )}
                {champion.chesscomUsername && (
                  <Link href={`/opponent-prep`}>
                    <Button
                      size="sm"
                      variant={champion.lichessUsername ? "outline" : "default"}
                      onClick={() => prefillScout(champion.chesscomUsername!, "chess.com")}
                    >
                      <Sword className="w-3.5 h-3.5 mr-1.5" />
                      Scout live (chess.com)
                    </Button>
                  </Link>
                )}
                <a href={champion.wikipediaUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Wikipedia
                  </Button>
                </a>
                {champion.chessgamesUrl && (
                  <a href={champion.chessgamesUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> chessgames.com
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Repertoire grid */}
      <div className="grid md:grid-cols-2 gap-3">
        <RepertoireCard
          title="Plays as White"
          icon="♔"
          openings={champion.signatureOpeningsWhite}
          accent="#fff"
        />
        <RepertoireCard
          title="Plays as Black"
          icon="♚"
          openings={champion.signatureOpeningsBlack}
          accent="#1f2937"
        />
      </div>

      {/* Famous games (curated) */}
      {champion.famousGames && champion.famousGames.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Famous games
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {champion.famousGames.map((g) => (
              <FamousGameViewer key={g.name} game={g} championName={champion.displayName} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Bulk PGN Mentor library (only when bundled on the server) */}
      {champion.hasLibrary && (
        <GamesLibrary championId={champion.id} championName={champion.displayName} />
      )}

      {/* Study suggestions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" /> Continue studying
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-2">
          <Link href="/openings">
            <SuggestCard
              icon={BookOpen}
              title="Opening trainer"
              subtitle="Drill the lines they made famous"
            />
          </Link>
          <Link href="/endgames">
            <SuggestCard
              icon={TrendingUp}
              title="Endgame lessons"
              subtitle={
                champion.style.includes("endgame")
                  ? `${champion.displayName} dominated endgames — practice the same patterns`
                  : "Build the technical foundation every great player has"
              }
            />
          </Link>
          <Link href="/training/visualization">
            <SuggestCard
              icon={Eye}
              title="Visualization"
              subtitle="Train calculation like the masters"
            />
          </Link>
          <Link href="/champions">
            <SuggestCard
              icon={Crown}
              title="More champions"
              subtitle="Compare styles across eras"
            />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================================================================== */
/*  Sub-components                                                         */
/* ====================================================================== */

function StatPill({ label, value, accent }: { label: string; value: React.ReactNode; accent: string }) {
  return (
    <div
      className="rounded-md border bg-card/50 px-2 py-1.5"
      style={{ borderColor: `${accent}44` }}
    >
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-base font-bold font-mono leading-tight" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function WCTenureBar({
  start,
  end,
  born,
  died,
}: {
  start: number;
  end: number;
  born: number;
  died?: number;
}) {
  const lifeStart = born;
  const lifeEnd = died ?? new Date().getFullYear();
  const total = lifeEnd - lifeStart;
  if (total <= 0) return null;
  const pctStart = ((start - lifeStart) / total) * 100;
  const pctWidth = ((end - start) / total) * 100;
  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-1">
        World Champion: <span className="font-semibold text-amber-300">{start}–{end}</span>
        <span className="text-muted-foreground"> ({end - start} year{end - start === 1 ? "" : "s"})</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-card border border-border overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-amber-400 to-amber-600"
          style={{ left: `${pctStart}%`, width: `${pctWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
        <span>{lifeStart}</span>
        <span>{lifeEnd}</span>
      </div>
    </div>
  );
}

function RepertoireCard({
  title,
  icon,
  openings,
  accent,
}: {
  title: string;
  icon: string;
  openings: string[];
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded text-base"
            style={{
              color: accent === "#fff" ? "#1f2937" : "#fff",
              backgroundColor: accent,
            }}
          >
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {openings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No signature openings recorded.</p>
        ) : (
          openings.map((o) => (
            <div
              key={o}
              className="flex items-center gap-2 text-sm rounded border border-border bg-card/30 px-2 py-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{o}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SuggestCard({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-md border border-border p-3 hover:border-primary/60 hover:bg-secondary/30 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/* ====================================================================== */
/*  Famous game viewer (collapsible per game)                              */
/* ====================================================================== */

function FamousGameViewer({ game, championName }: { game: FamousGame; championName: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-3 text-left hover:bg-secondary/40 transition-colors flex items-start gap-3"
      >
        <div className="text-xl" aria-hidden>
          {open ? "♛" : "♕"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">
            {game.name}{" "}
            <span className="text-muted-foreground font-normal text-xs">
              vs {game.opponent} · {game.year}
            </span>
          </div>
          {game.significance && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {game.significance}
            </div>
          )}
        </div>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform mt-0.5",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <ChampionGameViewer pgn={game.pgn} championName={championName} />}
    </div>
  );
}

/**
 * Shared interactive PGN player used by both curated famous games and the
 * bulk PGN Mentor library. Auto-orients the board to the champion's side
 * and exposes a "Play from here" Link to `/play?fen=…`.
 */
function ChampionGameViewer({ pgn, championName }: { pgn: string; championName: string }) {
  const moves = React.useMemo(() => {
    try {
      const c = new Chess();
      c.loadPgn(pgn);
      return c.history({ verbose: true });
    } catch {
      return [];
    }
  }, [pgn]);

  const orientation: "white" | "black" = React.useMemo(() => {
    const m = pgn.match(/\[White\s+"([^"]+)"\]/);
    if (!m) return "white";
    const lowerWhite = m[1].toLowerCase();
    return lowerWhite.includes(championName.split(" ").pop()?.toLowerCase() ?? "")
      ? "white"
      : "black";
  }, [pgn, championName]);

  const [moveIdx, setMoveIdx] = React.useState(0);
  React.useEffect(() => setMoveIdx(0), [pgn]);

  const fen = React.useMemo(() => {
    const c = new Chess();
    for (let i = 0; i < Math.min(moveIdx, moves.length); i++) {
      try {
        c.move({ from: moves[i].from, to: moves[i].to, promotion: moves[i].promotion });
      } catch {
        break;
      }
    }
    return c.fen();
  }, [moves, moveIdx]);

  const lastMove =
    moveIdx > 0 ? ([moves[moveIdx - 1].from, moves[moveIdx - 1].to] as [string, string]) : undefined;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setMoveIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setMoveIdx((i) => Math.min(moves.length, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moves.length]);

  if (moves.length === 0) {
    return (
      <div className="p-3 text-xs text-destructive">
        Could not parse PGN.
      </div>
    );
  }

  const playHref = `/play?fen=${encodeURIComponent(fen)}&orientation=${orientation}`;

  return (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_220px] gap-3 p-3 bg-card/30 border-t border-border">
      <div>
        <div className="max-w-[420px] mx-auto sm:mx-0">
          <Chessboard fen={fen} orientation={orientation} lastMove={lastMove} />
          <div className="flex items-center gap-1 mt-2">
            <Button size="icon" variant="outline" onClick={() => setMoveIdx(0)}>⏮</Button>
            <Button size="icon" variant="outline" onClick={() => setMoveIdx((i) => Math.max(0, i - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setMoveIdx((i) => Math.min(moves.length, i + 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setMoveIdx(moves.length)}>⏭</Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Move {moveIdx} / {moves.length}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px] text-muted-foreground">
              Use ← → arrow keys to step.
            </p>
            <Link href={playHref}>
              <Button size="sm" className="h-7 text-xs">
                <Play className="w-3 h-3 mr-1" /> Play from here
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <div className="text-xs">
        <div className="font-semibold mb-1">Moves</div>
        <div className="border border-border rounded-md p-2 max-h-[280px] overflow-y-auto grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 font-mono tabular-nums">
          {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
            const w = moves[i * 2];
            const b = moves[i * 2 + 1];
            return (
              <React.Fragment key={i}>
                <span className="text-muted-foreground">{i + 1}.</span>
                <button
                  className={cn(
                    "px-1 text-left rounded hover:bg-secondary",
                    moveIdx === i * 2 + 1 && "bg-primary/20",
                  )}
                  onClick={() => setMoveIdx(i * 2 + 1)}
                >
                  {w?.san ?? ""}
                </button>
                <button
                  className={cn(
                    "px-1 text-left rounded hover:bg-secondary",
                    moveIdx === i * 2 + 2 && "bg-primary/20",
                  )}
                  onClick={() => b && setMoveIdx(i * 2 + 2)}
                >
                  {b?.san ?? ""}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  PGN Mentor library (paginated, searchable)                             */
/* ====================================================================== */

function GamesLibrary({ championId, championName }: { championId: string; championName: string }) {
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const limit = 25;

  const list = useQuery<LibraryGamesPage>({
    queryKey: ["champion-games", championId, page, q],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set("q", q);
      return api(`/api/champions/${championId}/games?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.matched / limit)) : 1;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchInput.trim());
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Library className="w-4 h-4 text-primary" /> Games library
          {list.data && (
            <span className="ml-1 text-xs text-muted-foreground font-normal">
              {list.data.matched.toLocaleString()}
              {q && list.data.matched !== list.data.total && (
                <> of {list.data.total.toLocaleString()}</>
              )} games
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by opponent, event, ECO, or year"
              className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Button type="submit" size="sm" className="h-8 text-xs">Search</Button>
          {q && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                setSearchInput("");
                setQ("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {list.isLoading && !list.data && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading library…
          </div>
        )}

        {list.data && list.data.matched === 0 && (
          <p className="text-xs text-muted-foreground p-2">
            No games match {q ? `"${q}"` : "this filter"}.
          </p>
        )}

        {list.data && list.data.matched > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-[2fr_2fr_1fr_60px_60px_24px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-card/40">
              <div>White</div>
              <div>Black</div>
              <div>Event</div>
              <div>Year</div>
              <div>Result</div>
              <div></div>
            </div>
            <div className="divide-y divide-border">
              {list.data.games.map((g) => (
                <LibraryRow
                  key={g.index}
                  championId={championId}
                  championName={championName}
                  summary={g}
                />
              ))}
            </div>
          </div>
        )}

        {list.data && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={page === 1 || list.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3 h-3 mr-1" /> Prev
            </Button>
            <span className="text-muted-foreground">
              Page {page} / {totalPages}
              {list.isFetching && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={page >= totalPages || list.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LibraryRow({
  championId,
  championName,
  summary,
}: {
  championId: string;
  championName: string;
  summary: LibraryGameSummary;
}) {
  const [open, setOpen] = React.useState(false);
  const game = useQuery<LibraryGameFull>({
    queryKey: ["champion-game", championId, summary.index],
    queryFn: () => api(`/api/champions/${championId}/games/${summary.index}`),
    enabled: open,
  });

  const h = summary.headers;
  const year = h.date?.slice(0, 4).replace(/\?/g, "·") || "—";
  const resultColor =
    h.result === "1-0"
      ? "text-emerald-400"
      : h.result === "0-1"
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full grid grid-cols-[2fr_2fr_1fr_60px_60px_24px] gap-2 px-3 py-1.5 text-xs items-center text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="truncate" title={h.white}>
          {h.white}
          {h.whiteElo ? <span className="text-muted-foreground"> ({h.whiteElo})</span> : null}
        </span>
        <span className="truncate" title={h.black}>
          {h.black}
          {h.blackElo ? <span className="text-muted-foreground"> ({h.blackElo})</span> : null}
        </span>
        <span className="truncate text-muted-foreground" title={h.event}>
          {h.event || "—"}
        </span>
        <span className="text-muted-foreground tabular-nums">{year}</span>
        <span className={cn("font-mono tabular-nums", resultColor)}>{h.result}</span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform justify-self-end",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border">
          {game.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading game…
            </div>
          )}
          {game.error && (
            <div className="p-3 text-xs text-destructive">Failed to load PGN.</div>
          )}
          {game.data && (
            <ChampionGameViewer pgn={game.data.pgn} championName={championName} />
          )}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */

function prefillScout(username: string, platform: "lichess" | "chess.com") {
  // Drop a hint into sessionStorage; opponent-prep can pick it up if it
  // listens — kept lightweight to avoid coupling.
  try {
    sessionStorage.setItem(
      "scout-prefill",
      JSON.stringify({ username, platform, ts: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

void ArrowRight; // keep imports stable
