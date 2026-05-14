import * as React from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { EvalBar } from "@/components/chess/EvalBar";
import { EvalGraph } from "@/components/chess/EvalGraph";
import { EvalTimeline, type EvalTimelineMarker } from "@/components/analysis/EvalTimeline";
import { CoachExplanation } from "@/components/training/CoachExplanation";
import { MoveList } from "@/components/chess/MoveList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { api } from "@/lib/queryClient";
import { QUALITY_META } from "@/lib/moveQuality";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import type { Game, GameAnalysis as GA, MoveAnalysis, MoveQuality, PhaseGrades } from "@shared/schema";

export default function GameAnalysisPage() {
  const [, params] = useRoute("/game-analysis/:id");
  const id = Number(params?.id);
  const game = useQuery<Game>({ queryKey: ["games", id], queryFn: () => api(`/api/games/${id}`) });
  const analysis = useQuery<GA>({ queryKey: ["games", id, "analysis"], queryFn: () => api(`/api/games/${id}/analysis`) });

  const [ply, setPly] = React.useState(0);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPly((p) => p + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (game.isLoading || analysis.isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!game.data) {
    return <div className="p-6">Game not found.</div>;
  }

  const moves = (analysis.data?.moveAnalysis as MoveAnalysis[] | null) ?? [];
  const evalGraph = (analysis.data?.evalGraph as { ply: number; cp: number }[] | null) ?? [];
  const fen = ply === 0
    ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    : moves[ply - 1]?.fenAfter ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const cp = ply === 0 ? 0 : moves[ply - 1]?.evalAfter ?? 0;
  const lastMove: [string, string] | undefined =
    ply > 0 && moves[ply - 1]?.uci
      ? [moves[ply - 1].uci.slice(0, 2), moves[ply - 1].uci.slice(2, 4)]
      : undefined;

  return (
    <div className="p-4 md:p-6 grid lg:grid-cols-[2fr_1fr] gap-4 lg:gap-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/import" className="text-muted-foreground hover:underline">← Games</Link>
          <span className="font-semibold">{game.data.whitePlayer ?? "?"}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="font-semibold">{game.data.blackPlayer ?? "?"}</span>
          <Badge variant="outline">{game.data.result ?? "*"}</Badge>
          {game.data.opening && <span className="text-muted-foreground text-xs">{game.data.opening}</span>}
        </div>

        <div className="flex gap-3">
          <div className="w-6">
            <EvalBar cp={cp} />
          </div>
          <div className="flex-1 max-w-[640px]">
            <Chessboard fen={fen} lastMove={lastMove} />
            <div className="flex items-center gap-2 mt-3">
              <Button variant="outline" size="icon" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPly((p) => Math.min(moves.length, p + 1))} disabled={ply >= moves.length}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">Ply {ply} / {moves.length}</span>
            </div>
            <div className="mt-3">
              <EvalGraph data={evalGraph} currentPly={ply} onSelect={(p) => setPly(p)} width={640} />
            </div>
            <TimelineSection
              gameId={id}
              moves={moves}
              evalGraph={evalGraph}
              currentPly={ply}
              onSelectPly={setPly}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <PlayerCard
            name={game.data.whitePlayer ?? "White"}
            color="white"
            accuracy={analysis.data?.whiteAccuracy ?? 0}
            phaseGrades={(analysis.data?.whitePhaseGrades as PhaseGrades | null) ?? { opening: 0, middlegame: 0, endgame: 0 }}
            moves={moves.filter((m) => m.isWhite)}
          />
          <PlayerCard
            name={game.data.blackPlayer ?? "Black"}
            color="black"
            accuracy={analysis.data?.blackAccuracy ?? 0}
            phaseGrades={(analysis.data?.blackPhaseGrades as PhaseGrades | null) ?? { opening: 0, middlegame: 0, endgame: 0 }}
            moves={moves.filter((m) => !m.isWhite)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Moves</CardTitle></CardHeader>
          <CardContent className="p-0">
            <MoveList moves={moves} currentPly={ply} onSelect={setPly} />
          </CardContent>
        </Card>

        <Tabs defaultValue="blunders">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="blunders">Blunders</TabsTrigger>
            <TabsTrigger value="opening">Opening</TabsTrigger>
            <TabsTrigger value="advantage">Advantage</TabsTrigger>
            <TabsTrigger value="endgame">Endgame</TabsTrigger>
          </TabsList>
          <TabsContent value="blunders"><GenerateButton id={id} module="tactics" label="Generate tactics" /></TabsContent>
          <TabsContent value="opening"><GenerateButton id={id} module="opening-improver" label="Generate opening drills" /></TabsContent>
          <TabsContent value="advantage"><GenerateButton id={id} module="advantage-capitalization" label="Generate advantage problems" /></TabsContent>
          <TabsContent value="endgame"><GenerateButton id={id} module="endgame" label="Generate endgame problems" /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PlayerCard({
  name, color, accuracy, phaseGrades, moves,
}: {
  name: string; color: "white" | "black"; accuracy: number; phaseGrades: PhaseGrades; moves: MoveAnalysis[];
}) {
  const counts = countQuality(moves);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className={color === "white" ? "text-white" : "text-foreground/70"}>●</span>
          {name}
          <span className="ml-auto text-base font-mono">{accuracy.toFixed(1)}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-3 gap-1 text-center">
          <PhaseCell label="Opening" v={phaseGrades.opening} />
          <PhaseCell label="Middle" v={phaseGrades.middlegame} />
          <PhaseCell label="Endgame" v={phaseGrades.endgame} />
        </div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {Object.entries(counts).map(([q, n]) => {
            const meta = QUALITY_META[q as MoveQuality];
            return (
              <div key={q} className="rounded bg-secondary py-1">
                <div className="font-bold text-sm" style={{ color: meta.color }}>{n}</div>
                <div className="text-[10px] text-muted-foreground">{meta.label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PhaseCell({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded bg-secondary py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{v}</div>
    </div>
  );
}

function countQuality(moves: MoveAnalysis[]) {
  const c: Partial<Record<MoveQuality, number>> = {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0,
    book: 0, inaccuracy: 0, miss: 0, mistake: 0, blunder: 0,
  };
  for (const m of moves) c[m.quality] = (c[m.quality] ?? 0) + 1;
  return c as Record<MoveQuality, number>;
}

interface TimelineSectionProps {
  gameId: number;
  moves: MoveAnalysis[];
  evalGraph: { ply: number; cp: number }[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

/**
 * Builds the motif-marker list from the moveAnalysis array (large
 * eval swings + obvious quality drops) and wraps EvalTimeline with a
 * coach explanation that auto-opens when the user clicks a marker.
 */
function TimelineSection({ gameId, moves, evalGraph, currentPly, onSelectPly }: TimelineSectionProps) {
  const markers: EvalTimelineMarker[] = React.useMemo(() => {
    return moves
      .filter((m) =>
        m.quality === "blunder" || m.quality === "mistake" || m.quality === "miss",
      )
      .map((m) => ({
        ply: m.ply,
        motif: m.quality,
        cpDelta: m.evalAfter - m.evalBefore,
        hint: `${m.san} (CPL ${m.cpl})`,
      }));
  }, [moves]);

  const [selectedPly, setSelectedPly] = React.useState<number | null>(null);
  const selected = selectedPly == null ? null : moves.find((m) => m.ply === selectedPly);

  const addToReview = useMutation({
    mutationFn: () =>
      api("/api/srs/review", {
        method: "POST",
        body: JSON.stringify({
          problemId: -gameId, // negative ids are reserved for ad-hoc one-off review cards
          quality: "fail",
        }),
      }),
    onSuccess: () => toast({ title: "Added to Daily Review" }),
  });

  return (
    <div className="mt-3 space-y-2">
      <EvalTimeline
        data={evalGraph}
        markers={markers}
        currentPly={currentPly}
        width={640}
        onSelect={(ply, marker) => {
          onSelectPly(ply);
          setSelectedPly(marker ? ply : null);
        }}
      />
      {selected && selected.bestMove && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="text-muted-foreground">
              Ply {selected.ply} · played <span className="font-mono">{selected.san}</span> ·{" "}
              <Badge variant="outline" className="ml-1">{selected.quality}</Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addToReview.mutate()}
              disabled={addToReview.isPending}
            >
              + Add to Review
            </Button>
          </div>
          <CoachExplanation
            fen={selected.fenBefore}
            userMove={selected.san}
            correctMove={selected.bestMove}
            motif={selected.quality}
          />
        </div>
      )}
    </div>
  );
}

function GenerateButton({ id, module, label }: { id: number; module: string; label: string }) {
  const m = useMutation({
    mutationFn: () => api<{ created: number }>(`/api/games/${id}/generate/${module}`, { method: "POST" }),
    onSuccess: (data) => toast({ title: "Generated", description: `${data.created} new problems`, variant: "success" }),
  });
  return (
    <Card>
      <CardContent className="p-4">
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="w-full">
          <Sparkles className="w-4 h-4 mr-2" />
          {m.isPending ? "Working…" : label}
        </Button>
      </CardContent>
    </Card>
  );
}
