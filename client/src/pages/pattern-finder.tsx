/**
 * Unified Pattern Finder.
 *
 * Single page that combines:
 *   - **Discovered Lines** — engine-driven opening continuations that
 *     satisfy a predicate (equal after N moves, white wins a queen,
 *     fork on move 12, …).
 *   - **Game motifs** — pre-detected motifs in the user's imported games.
 *
 * Layout (mirrors the planning mockup):
 *   - Top: NL query + Analyze button, suggestion chips, compact filters.
 *   - Left column: the Discovered Lines list (scrollable, click to load).
 *   - Right column: side-to-move card, eval bar + chess board, controls.
 */

import * as React from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Chess } from "chess.js";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Flag,
  RefreshCw,
  RotateCcw,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import {
  MOTIF_CATEGORIES,
  type DiscoveredLine,
  type LineQuery,
  type MaterialPiece,
  type MotifCategory,
  type MotifDefinition,
  type MotifInstanceData,
} from "@shared/schema";
import { api } from "@/lib/queryClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Chessboard } from "@/components/chess/Chessboard";
import { EvalBar } from "@/components/chess/EvalBar";
import { FinderToolbar, LineQAndA, decodeQueryFromUrl } from "@/components/finder/FinderPolish";

/* ---------------------------------------------------------------------- */
/* Types                                                                    */
/* ---------------------------------------------------------------------- */

interface MotifGameRow {
  id: number;
  motifKey: string;
  ply: number | null;
  fen: string | null;
  data: MotifInstanceData;
  gameId: number | null;
  game: {
    id: number;
    white: string | null;
    black: string | null;
    result: string | null;
    eco: string | null;
    opening: string | null;
  } | null;
}

interface FinderResponse {
  raw?: string;
  query: LineQuery;
  opening: { id: string; name: string; eco?: string } | null;
  games: MotifGameRow[];
  lines: DiscoveredLine[];
}

interface MetricsResponse {
  metrics: Array<{
    motifKey: string;
    attempts: number;
    correct: number;
    accuracy: number;
  }>;
  counts: Array<{ motifKey: string; total: number; missed: number }>;
}

interface OpeningOption {
  id: string;
  name: string;
  eco?: string;
}

interface SetupOption {
  id: string;
  name: string;
  side: "white" | "black";
  description: string;
}

/* ---------------------------------------------------------------------- */
/* Static config                                                            */
/* ---------------------------------------------------------------------- */

const EXAMPLES: string[] = [
  "find a Hedgehog setup for black that is equal after 10 moves regardless of white's moves",
  "London System for white vs any black response",
  "King's Indian Attack vs anything",
  "show me a line in the Blackmar-Diemer Gambit where white wins a queen with common moves from black",
  "find lines in the Torre Attack where white is equal after 12 moves",
  "Sicilian Najdorf — find a line where black is winning by move 15",
  "Italian Game where white can fork the queen",
];

const QUICK_CHIPS: Array<{ label: string; query: string }> = [
  { label: "Hedgehog vs anything", query: "Hedgehog setup for black against any white opening" },
  { label: "London vs anything", query: "London System for white vs any black response" },
  { label: "KIA vs anything", query: "King's Indian Attack vs anything" },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "All categories" },
  { value: MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS, label: "Forks & double attacks" },
  { value: MOTIF_CATEGORIES.PINS_SKEWERS, label: "Pins & skewers" },
  { value: MOTIF_CATEGORIES.DISCOVERED_IDEAS, label: "Discovered ideas" },
  { value: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD, label: "Deflection / overload" },
  { value: MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE, label: "Clearance / interference" },
  { value: MOTIF_CATEGORIES.TRAPPING, label: "Trapping & hanging" },
  { value: MOTIF_CATEGORIES.MATING_NETS, label: "Mating nets" },
  { value: MOTIF_CATEGORIES.PROMOTION, label: "Promotion" },
  { value: MOTIF_CATEGORIES.ENDGAME, label: "Endgame" },
];

const EVAL_BAND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Any" },
  { value: "equal", label: "Equal (±0.4)" },
  { value: "slight", label: "Slight edge" },
  { value: "advantage", label: "Clear advantage" },
  { value: "winning", label: "Winning" },
];

const MATERIAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "No material constraint" },
  { value: "pawn", label: "Win a pawn" },
  { value: "knight", label: "Win a knight" },
  { value: "bishop", label: "Win a bishop" },
  { value: "minor", label: "Win a minor piece" },
  { value: "rook", label: "Win a rook" },
  { value: "queen", label: "Win a queen" },
];

const PLY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "8", label: "4 moves" },
  { value: "16", label: "8 moves" },
  { value: "24", label: "12 moves" },
  { value: "32", label: "16 moves" },
  { value: "40", label: "20 moves" },
];

const EVAL_BAND_PRESETS: Record<string, LineQuery["evalBand"]> = {
  equal:     { cpMin: -40,  cpMax: 40,      label: "equal" },
  slight:    { cpMin: 25,   cpMax: 80,      label: "slight" },
  advantage: { cpMin: 80,   cpMax: 250,     label: "advantage" },
  winning:   { cpMin: 250,  cpMax: 100_000, label: "winning" },
};

const START_FEN = new Chess().fen();

/* ---------------------------------------------------------------------- */
/* Page                                                                     */
/* ---------------------------------------------------------------------- */

export default function PatternFinder() {
  const [text, setText] = React.useState("");
  const [structured, setStructured] = React.useState<LineQuery>({ scope: "both" });
  const [active, setActive] = React.useState<MotifGameRow | null>(null);
  const [selectedLine, setSelectedLine] = React.useState<DiscoveredLine | null>(null);
  const [ply, setPly] = React.useState<number>(0);
  const [orientation, setOrientation] = React.useState<"white" | "black">("white");
  const [tab, setTab] = React.useState<"lines" | "games">("lines");

  const defs = useQuery<MotifDefinition[]>({
    queryKey: ["motifs", "definitions"],
    queryFn: () => api("/api/motifs/definitions"),
  });

  const openings = useQuery<OpeningOption[]>({
    queryKey: ["finder", "openings"],
    queryFn: () => api("/api/finder/openings"),
  });

  const setups = useQuery<SetupOption[]>({
    queryKey: ["finder", "setups"],
    queryFn: () => api("/api/finder/setups"),
  });

  const metrics = useQuery<MetricsResponse>({
    queryKey: ["motifs", "metrics"],
    queryFn: () => api("/api/motifs/metrics"),
  });

  const defByKey = React.useMemo(() => {
    const map = new Map<string, MotifDefinition>();
    for (const d of defs.data ?? []) map.set(d.key, d);
    return map;
  }, [defs.data]);

  const search = useMutation<FinderResponse, Error, { mode: "nl" | "structured" }>({
    mutationFn: async ({ mode }) => {
      if (mode === "nl" && text.trim()) {
        return api<FinderResponse>("/api/finder/query", {
          method: "POST",
          body: JSON.stringify({ query: text.trim() }),
        });
      }
      return api<FinderResponse>("/api/finder/search", {
        method: "POST",
        body: JSON.stringify({ ...structured, limit: structured.limit ?? 24 }),
      });
    },
    onSuccess: (data) => {
      const first = data.lines[0] ?? null;
      setSelectedLine(first);
      setPly(first ? first.moves.length : 0);
      if (data.lines.length > 0) setTab("lines");
      else if (data.games.length > 0) setTab("games");
    },
  });

  const detectAll = useMutation({
    mutationFn: () =>
      api<{ scanned: number; stored: number; totalGames: number }>(
        "/api/motifs/detect-all",
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: () => {
      void metrics.refetch();
      if (text.trim()) search.mutate({ mode: "nl" });
      else search.mutate({ mode: "structured" });
    },
  });

  function runStructured(patch?: Partial<LineQuery>) {
    if (patch) setStructured((s) => ({ ...s, ...patch }));
    setText("");
    setTimeout(() => search.mutate({ mode: "structured" }), 0);
  }

  // Hydrate from share-link `?q=...` on mount. Triggers an immediate
  // search so the recipient sees results without clicking Analyze.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeQueryFromUrl(window.location.search);
    if (decoded) {
      setStructured(decoded);
      setTimeout(() => search.mutate({ mode: "structured" }), 0);
    }
  }, []);

  function runNL(seed?: string) {
    if (seed) setText(seed);
    setTimeout(() => search.mutate({ mode: "nl" }), 0);
  }

  function pickLine(line: DiscoveredLine) {
    setSelectedLine(line);
    setPly(line.moves.length);
  }

  // Pre-compute FENs for the selected line so prev/next is instant.
  const fens = React.useMemo(() => {
    if (!selectedLine) return [START_FEN];
    const list: string[] = [START_FEN];
    const c = new Chess();
    for (const san of selectedLine.moves) {
      try {
        c.move(san);
        list.push(c.fen());
      } catch {
        break;
      }
    }
    return list;
  }, [selectedLine]);

  const total = fens.length - 1;
  const clampedPly = Math.max(0, Math.min(ply, total));
  const fen = fens[clampedPly];

  // Highlight last move on the board.
  const lastMove = React.useMemo<[string, string] | undefined>(() => {
    if (!selectedLine || clampedPly <= 0) return undefined;
    const c = new Chess();
    for (let i = 0; i < clampedPly - 1; i++) c.move(selectedLine.moves[i]);
    try {
      const m = c.move(selectedLine.moves[clampedPly - 1]);
      if (m) return [m.from, m.to];
    } catch {
      /* ignore */
    }
    return undefined;
  }, [selectedLine, clampedPly]);

  const sideToMove: "white" | "black" = fen.split(" ")[1] === "w" ? "white" : "black";
  const moveNumber = Math.floor(clampedPly / 2) + 1;
  const bestMove =
    selectedLine && clampedPly < selectedLine.moves.length
      ? selectedLine.moves[clampedPly]
      : null;

  const lines = search.data?.lines ?? [];
  const games = search.data?.games ?? [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SearchIcon className="w-6 h-6 text-primary" /> Discover Lines
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            One search across every named opening and every tactical motif. Ask in plain
            English, or build a structured filter — both run through the same engine.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => detectAll.mutate()}
            disabled={detectAll.isPending}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${detectAll.isPending ? "animate-spin" : ""}`}
            />
            {detectAll.isPending ? "Scanning…" : "Detect on all games"}
          </Button>
        </div>
      </header>

      {/* Compact query bar */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) runNL();
              else runStructured();
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Find lines in the Torre Attack where white is equal after 12 moves"
              className="flex-1"
            />
            <Button type="submit" disabled={search.isPending}>
              <SearchIcon className="w-4 h-4 mr-2" />
              {search.isPending ? "Analyzing…" : "Analyze"}
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map((c) => (
              <Chip key={c.label} onClick={() => runNL(c.query)}>
                <Sparkles className="w-3 h-3" />
                {c.label}
              </Chip>
            ))}
            {EXAMPLES.slice(0, 3).map((ex) => (
              <Chip key={ex} onClick={() => runNL(ex)} muted>
                {ex.length > 60 ? ex.slice(0, 60) + "…" : ex}
              </Chip>
            ))}
          </div>

          <FinderToolbar
            currentQuery={structured}
            onLoad={(q) => {
              setStructured(q);
              setText("");
              setTimeout(() => search.mutate({ mode: "structured" }), 0);
            }}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Search Filters
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FilterSlot label="Opening">
              <Select
                value={structured.openingId ?? "any"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    openingId: v === "any" ? undefined : v,
                    openingHint: undefined,
                    setupId: undefined,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any opening" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="any">Any opening</SelectItem>
                  {(openings.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.eco ? ` (${o.eco})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Universal setup">
              <Select
                value={structured.setupId ?? "any"}
                onValueChange={(v) => {
                  const found = (setups.data ?? []).find((s) => s.id === v);
                  setStructured((s) => ({
                    ...s,
                    setupId: v === "any" ? undefined : v,
                    side: found ? found.side : s.side,
                    openingId: v === "any" ? s.openingId : undefined,
                  }));
                  if (found) setOrientation(found.side);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="any">No setup</SelectItem>
                  {(setups.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} <span className="opacity-60">({o.side})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Evaluation range">
              <Select
                value={structured.evalBand?.label ?? "any"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    evalBand: v === "any" ? undefined : EVAL_BAND_PRESETS[v],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVAL_BAND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Move depth">
              <Select
                value={structured.plyTarget ? String(structured.plyTarget) : "auto"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    plyTarget: v === "auto" ? undefined : Number(v),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Side">
              <Select
                value={structured.side ?? "any"}
                onValueChange={(v) => {
                  const newSide = v === "any" ? undefined : (v as "white" | "black");
                  setStructured((s) => ({ ...s, side: newSide }));
                  if (newSide) setOrientation(newSide);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Either side</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                  <SelectItem value="black">Black</SelectItem>
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Category">
              <Select
                value={(structured as { category?: string }).category ?? "any"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    motifs:
                      v === "any"
                        ? s.motifs
                        : (defs.data ?? [])
                            .filter((d) => d.category === (v as MotifCategory))
                            .map((d) => d.key),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Motif">
              <Select
                value={structured.motifs?.[0] ?? "any"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    motifs: v === "any" ? undefined : [v],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="any">Any motif</SelectItem>
                  {(defs.data ?? []).map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Material gain">
              <Select
                value={structured.materialGain?.piece ?? "any"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    materialGain:
                      v === "any"
                        ? undefined
                        : {
                            piece: v as MaterialPiece,
                            side: s.materialGain?.side ?? s.side ?? "white",
                          },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSlot>

            <FilterSlot label="Reply style">
              <Select
                value={structured.replyMode ?? "common"}
                onValueChange={(v) =>
                  setStructured((s) => ({
                    ...s,
                    replyMode: v as "forcing" | "common",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="common">Common (masters)</SelectItem>
                  <SelectItem value="forcing">Forcing (best engine)</SelectItem>
                </SelectContent>
              </Select>
            </FilterSlot>
          </div>

          <div className="flex gap-2 mt-3">
            <Button onClick={() => runStructured()} disabled={search.isPending} size="sm">
              <Filter className="w-4 h-4 mr-2" /> Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("");
                setStructured({ scope: "both" });
                setSelectedLine(null);
                setPly(0);
                search.reset();
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parsed criteria preview */}
      {search.data?.query && (
        <CriteriaPreview raw={search.data.raw} query={search.data.query} />
      )}

      {search.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {(search.error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Main two-column layout */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* LEFT: Results list */}
        <section className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "lines" | "games")}>
            <TabsList className="w-full">
              <TabsTrigger value="lines" className="flex-1">
                Discovered Lines
                {lines.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {lines.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="games" className="flex-1">
                Game Motifs
                {games.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {games.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="mt-3">
              {search.isPending ? (
                <ListPlaceholder text="Searching engine + master games…" />
              ) : lines.length === 0 ? (
                <ListPlaceholder
                  text={
                    search.data
                      ? "No lines matched. Try widening the evaluation band or picking a different opening."
                      : "Ask a question or apply filters to discover lines."
                  }
                />
              ) : (
                <GroupedLineList
                  lines={lines}
                  selectedId={selectedLine?.id ?? null}
                  onSelect={pickLine}
                />
              )}
            </TabsContent>

            <TabsContent value="games" className="mt-3">
              {games.length === 0 ? (
                <ListPlaceholder
                  text={
                    search.data
                      ? "No motifs match in your imported games."
                      : "Click 'Detect on all games' then search."
                  }
                />
              ) : (
                <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                  {games.map((r) => (
                    <GameMotifRow
                      key={r.id}
                      row={r}
                      motifName={defByKey.get(r.motifKey)?.name ?? r.motifKey}
                      onOpen={() => setActive(r)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        {/* RIGHT: Board + controls */}
        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">Playing as:</div>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setOrientation("white")}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                  orientation === "white"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-secondary"
                }`}
              >
                White
              </button>
              <button
                onClick={() => setOrientation("black")}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                  orientation === "black"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-secondary"
                }`}
              >
                Black
              </button>
            </div>
          </div>

          <EngineCard
            line={selectedLine}
            sideToMove={sideToMove}
            moveNumber={moveNumber}
            bestMove={bestMove}
            ply={clampedPly}
            total={total}
            orientation={orientation}
          />

          <div className="flex gap-3 items-stretch">
            <div className="w-7 self-stretch">
              <EvalBar
                cp={selectedLine?.evalCp ?? 0}
                mateIn={selectedLine?.mateIn ?? null}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Chessboard
                fen={fen}
                orientation={orientation}
                lastMove={lastMove}
                interactive={false}
                theme="green"
              />
            </div>
          </div>

          <BoardControls
            onStart={() => setPly(0)}
            onPrev={() => setPly((p) => Math.max(0, p - 1))}
            onNext={() => setPly((p) => Math.min(total, p + 1))}
            onEnd={() => setPly(total)}
            onFlip={() =>
              setOrientation((o) => (o === "white" ? "black" : "white"))
            }
            ply={clampedPly}
            total={total}
            prefixPlies={selectedLine?.prefixPlies ?? 0}
          />

          {/* Move list inline */}
          {selectedLine && (
            <Card>
              <CardContent className="p-3">
                <MoveList
                  moves={selectedLine.moves}
                  prefixPlies={selectedLine.prefixPlies}
                  ply={clampedPly}
                  onPick={setPly}
                />
                {selectedLine.stats && (
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">
                    Masters: {selectedLine.stats.games.toLocaleString()} games · W{" "}
                    {percent(selectedLine.stats.white, selectedLine.stats.games)} · D{" "}
                    {percent(selectedLine.stats.draws, selectedLine.stats.games)} · B{" "}
                    {percent(selectedLine.stats.black, selectedLine.stats.games)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedLine && (
            <LineQAndA
              fen={selectedLine.leafFen}
              moves={selectedLine.moves}
              openingName={selectedLine.opening?.name}
            />
          )}
        </section>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        {active && <GameDialog row={active} defByKey={defByKey} />}
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sub-components                                                           */
/* ---------------------------------------------------------------------- */

function Chip({
  children,
  onClick,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border transition-colors inline-flex items-center gap-1 ${
        muted
          ? "border-border text-muted-foreground hover:bg-secondary"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
      }`}
    >
      {children}
    </button>
  );
}

function FilterSlot({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function CriteriaPreview({
  raw,
  query,
}: {
  raw: string | undefined;
  query: LineQuery;
}) {
  const chips: string[] = [];
  if (query.setupId) {
    chips.push(`setup: ${query.openingHint ?? query.setupId}`);
  } else if (query.openingHint || query.openingId) {
    chips.push(`opening: ${query.openingHint ?? query.openingId}`);
  }
  if (query.motifs?.length) chips.push(query.motifs.join(", "));
  if (query.side) chips.push(`as ${query.side}`);
  if (query.result) chips.push(`result: ${query.result}`);
  if (query.missed) chips.push("missed");
  if (query.evalBand) chips.push(`eval ${query.evalBand.label ?? "band"}`);
  if (query.materialGain) {
    chips.push(`${query.materialGain.side} wins ${query.materialGain.piece}`);
  }
  if (query.plyTarget) chips.push(`${query.plyTarget} plies`);
  if (query.replyMode) chips.push(`reply: ${query.replyMode}`);

  if (chips.length === 0 && !raw) return null;
  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-4 h-4 text-primary" />
        {raw && <span className="italic">"{raw}"</span>}
        <span className="opacity-60">→</span>
        {chips.length === 0 ? (
          <span>no constraints parsed</span>
        ) : (
          chips.map((c) => (
            <Badge key={c} variant="secondary" className="lowercase">
              {c}
            </Badge>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function GroupedLineList({
  lines,
  selectedId,
  onSelect,
}: {
  lines: DiscoveredLine[];
  selectedId: string | null;
  onSelect: (line: DiscoveredLine) => void;
}) {
  // Group by `against` so setup / any-opening sweeps render one section per
  // opponent first move. When no line has `against`, render a flat list.
  const grouped = React.useMemo(() => {
    const map = new Map<string, DiscoveredLine[]>();
    for (const ln of lines) {
      const key = ln.against ?? "";
      const arr = map.get(key) ?? [];
      arr.push(ln);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [lines]);

  const showGroupHeaders = grouped.some(([k]) => k.length > 0);

  return (
    <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
      {grouped.map(([against, group]) => (
        <div key={against || "_flat"} className="space-y-2">
          {showGroupHeaders && against ? (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1">
              {against}
            </div>
          ) : null}
          {group.map((ln) => (
            <LineCard
              key={ln.id}
              line={ln}
              active={selectedId === ln.id}
              onSelect={() => onSelect(ln)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LineCard({
  line,
  active,
  onSelect,
}: {
  line: DiscoveredLine;
  active: boolean;
  onSelect: () => void;
}) {
  const previewMoves = line.moves
    .slice(0, Math.min(line.moves.length, 8))
    .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m))
    .join(" ");
  const winPct = line.stats
    ? Math.round((line.stats.white / Math.max(1, line.stats.games)) * 100)
    : null;
  const drawPct = line.stats
    ? Math.round((line.stats.draws / Math.max(1, line.stats.games)) * 100)
    : null;
  const plies = line.moves.length - line.prefixPlies;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-secondary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-mono text-sm font-medium truncate flex-1">
          {previewMoves}
          {line.moves.length > 8 ? " …" : ""}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular-nums">{formatEval(line)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Depth {line.depth}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {line.opening.name}
        {line.opening.eco ? ` · ${line.opening.eco}` : ""}
      </div>
      <div className="flex items-center gap-3 text-[11px] mt-1.5">
        {winPct != null && (
          <span className="text-emerald-500">Win: {winPct}%</span>
        )}
        {drawPct != null && (
          <span className="text-muted-foreground">Draw: {drawPct}%</span>
        )}
        <span className="text-muted-foreground">
          Analyzed: {Math.floor(plies / 2)} moves
        </span>
      </div>
      {line.motifs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {line.motifs.map((m) => (
            <Badge key={m} variant="secondary" className="text-[10px]">
              {m}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

function GameMotifRow({
  row,
  motifName,
  onOpen,
}: {
  row: MotifGameRow;
  motifName: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-border bg-card hover:bg-secondary/40 transition-colors p-3"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold truncate">{motifName}</span>
        {row.data?.missed ? (
          <Badge variant="destructive">missed</Badge>
        ) : (
          <Badge variant="secondary">spotted</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        {row.data?.san && <span className="font-mono">{row.data.san}</span>}
        {row.ply != null && <span>ply {row.ply}</span>}
        {row.data?.side && <span className="capitalize">{row.data.side}</span>}
      </div>
      {row.game && (
        <div className="text-xs text-muted-foreground truncate mt-1">
          {row.game.white ?? "?"} vs {row.game.black ?? "?"}
          {row.game.result ? ` (${row.game.result})` : ""}
        </div>
      )}
    </button>
  );
}

function EngineCard({
  line,
  sideToMove,
  moveNumber,
  bestMove,
  ply,
  total,
  orientation,
}: {
  line: DiscoveredLine | null;
  sideToMove: "white" | "black";
  moveNumber: number;
  bestMove: string | null;
  ply: number;
  total: number;
  orientation: "white" | "black";
}) {
  const evalLabel = line ? formatEval(line) : "+0.0";
  const playingYou = orientation;
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
          <Flag className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {sideToMove === "white" ? "White to Move" : "Black to Move"}
            </span>
            <Badge variant="secondary" className="tabular-nums">
              {evalLabel}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Move {moveNumber} · Playing (You:{" "}
            <span className="capitalize">{playingYou}</span>)
            {bestMove ? (
              <>
                {" · "}Best: <span className="font-mono">{bestMove}</span>
              </>
            ) : line && ply >= total ? (
              <> · End of line</>
            ) : (
              <> · No line selected</>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BoardControls({
  onStart,
  onPrev,
  onNext,
  onEnd,
  onFlip,
  ply,
  total,
  prefixPlies,
}: {
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onFlip: () => void;
  ply: number;
  total: number;
  prefixPlies: number;
}) {
  return (
    <Card>
      <CardContent className="p-2 flex items-center gap-2">
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={onStart} title="Start">
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onPrev} title="Previous">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onNext} title="Next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onEnd} title="End">
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 text-center text-xs tabular-nums text-muted-foreground">
          {ply > 0 ? `Ply ${ply} of ${total}` : "Start position"}
          {ply > prefixPlies && prefixPlies > 0 ? (
            <span className="ml-2 uppercase text-[10px] tracking-wider text-primary">
              · discovered
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="icon" onClick={onFlip} title="Flip board">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function MoveList({
  moves,
  prefixPlies,
  ply,
  onPick,
}: {
  moves: string[];
  prefixPlies: number;
  ply: number;
  onPick: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 text-sm leading-tight">
      {moves.map((san, idx) => {
        const isWhiteMove = idx % 2 === 0;
        const moveNo = Math.floor(idx / 2) + 1;
        const isPrefix = idx < prefixPlies;
        const isCurrent = idx + 1 === ply;
        return (
          <React.Fragment key={`${idx}-${san}`}>
            {isWhiteMove && (
              <span className="font-medium tabular-nums text-muted-foreground pr-1">
                {moveNo}.
              </span>
            )}
            <button
              type="button"
              onClick={() => onPick(idx + 1)}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isPrefix
                    ? "text-muted-foreground hover:bg-muted"
                    : "hover:bg-muted"
              }`}
            >
              {san}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function GameDialog({
  row,
  defByKey,
}: {
  row: MotifGameRow;
  defByKey: Map<string, MotifDefinition>;
}) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{defByKey.get(row.motifKey)?.name ?? row.motifKey}</DialogTitle>
      </DialogHeader>
      {row.fen && (
        <div className="max-w-md mx-auto w-full">
          <Chessboard fen={row.fen} />
        </div>
      )}
      <div className="text-sm space-y-1">
        {row.data?.san && (
          <DetailLine label="Move">
            <span className="font-mono">{row.data.san}</span>
          </DetailLine>
        )}
        {row.ply != null && <DetailLine label="Ply">{row.ply}</DetailLine>}
        {row.data?.side && (
          <DetailLine label="Side">
            <span className="capitalize">{row.data.side}</span>
          </DetailLine>
        )}
        {row.data?.square && (
          <DetailLine label="Square">
            <span className="font-mono">{row.data.square}</span>
          </DetailLine>
        )}
        {row.game && (
          <DetailLine label="Game">
            {row.game.white ?? "?"} vs {row.game.black ?? "?"} (
            {row.game.result ?? "?"})
          </DetailLine>
        )}
        {row.game?.opening && <DetailLine label="Opening">{row.game.opening}</DetailLine>}
      </div>
      {row.gameId && (
        <Link
          href={`/game-analysis/${row.gameId}`}
          className="text-sm text-primary inline-flex items-center gap-1"
        >
          Open in game analysis <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </DialogContent>
  );
}

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-20 shrink-0 text-muted-foreground text-xs uppercase tracking-wider pt-0.5">
        {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ListPlaceholder({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground text-center">
        {text}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Utilities                                                                */
/* ---------------------------------------------------------------------- */

function formatEval(line: DiscoveredLine): string {
  if (line.mateIn != null && line.mateIn !== 0) {
    return `M${Math.abs(line.mateIn)}${line.mateIn > 0 ? "" : "↓"}`;
  }
  if (line.evalCp == null) return "?";
  const pawns = line.evalCp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
