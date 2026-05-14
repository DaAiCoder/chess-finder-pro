import * as React from "react";
import { Chess } from "chess.js";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { WeaknessBanner } from "@/components/training/WeaknessBanner";
import { ProblemSourceBadge } from "@/components/training/ProblemSourceBadge";
import { Eye, ChevronRight, CheckCircle2, XCircle, Brain } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

interface IntuitionMeta {
  sequence: string[];
  badIdx: number;
  fenStart: string;
}

function metaOf(p?: TrainingProblem): IntuitionMeta | null {
  if (!p) return null;
  const m = p.metadata as IntuitionMeta | null | undefined;
  if (!m || !Array.isArray(m.sequence) || typeof m.badIdx !== "number") return null;
  return m;
}

/**
 * Replay the first `n` plies of `sequence` against `fenStart` and return
 * the resulting FEN. Returns the start FEN if anything goes wrong.
 */
function fenAfter(fenStart: string, sequence: string[], n: number): string {
  try {
    const c = new Chess(fenStart);
    for (let i = 0; i < Math.min(n, sequence.length); i++) {
      c.move(sequence[i]);
    }
    return c.fen();
  } catch {
    return fenStart;
  }
}

export default function IntuitionTrainer() {
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "intuition"],
    queryFn: () => api(`/api/training/problems?module=intuition`),
  });

  const deck = all.data ?? [];
  const [idx, setIdx] = React.useState(0);
  const [hoverPly, setHoverPly] = React.useState<number | null>(null);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(Date.now());

  const problem = deck[idx];
  const meta = metaOf(problem);

  React.useEffect(() => {
    setHoverPly(null);
    setPicked(null);
    setRevealed(false);
    setStartedAt(Date.now());
  }, [problem]);

  const recordAttempt = useMutation({
    mutationFn: (solved: boolean) =>
      api("/api/training/attempt", {
        method: "POST",
        body: JSON.stringify({
          problemId: problem?.id ?? 0,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        }),
      }),
  });

  function pick(i: number) {
    if (!meta || picked !== null) return;
    setPicked(i);
    setRevealed(true);
    const correct = i === meta.badIdx;
    recordAttempt.mutate(correct);
    if (correct) {
      toast({ title: "Spotted the mistake!", variant: "success" });
    } else {
      toast({
        title: "Not the move that lost",
        description: `It was ${meta.sequence[meta.badIdx] ?? "—"} (move ${meta.badIdx + 1}).`,
        variant: "destructive",
      });
    }
  }

  function next() {
    setIdx((i) => (deck.length === 0 ? 0 : (i + 1) % deck.length));
  }

  // Board shows the position right BEFORE the move the user is hovering.
  // After they pick, lock to the bad move's "before" position so they can
  // study why it lost.
  const showPly =
    revealed && meta ? meta.badIdx : hoverPly ?? 0;
  const boardFen = meta ? fenAfter(meta.fenStart, meta.sequence, showPly) : "";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> Intuition Trainer
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spot the mistake. Hover any move to see the position before it; click
            the move you think turned the game.
          </p>
        </div>
      </div>

      {all.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : !problem || !meta ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No intuition puzzles yet — analyze some games to populate this trainer.
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <div className="max-w-[640px]">
            <Chessboard fen={boardFen} interactive={false} />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {revealed
                ? `Position before ${meta.sequence[meta.badIdx]} (the mistake)`
                : hoverPly == null
                  ? "Starting position — hover a move to step through"
                  : `After ${meta.sequence.slice(0, hoverPly).join(" ")}`}
            </p>
          </div>
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Pick the mistake</span>
                  <Badge variant="outline">★ {problem.difficulty}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ProblemSourceBadge problem={problem} />
                <div className="grid grid-cols-1 gap-2">
                  {meta.sequence.map((san, i) => {
                    const isPicked = picked === i;
                    const isCorrect = revealed && i === meta.badIdx;
                    const isWrongPick = revealed && isPicked && !isCorrect;
                    return (
                      <button
                        key={i}
                        type="button"
                        onMouseEnter={() => setHoverPly(i)}
                        onMouseLeave={() => setHoverPly(null)}
                        onClick={() => pick(i)}
                        disabled={picked !== null}
                        className={
                          "px-3 py-2 rounded border text-left text-sm font-mono transition-colors " +
                          (isCorrect
                            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                            : isWrongPick
                              ? "border-red-500/60 bg-red-500/10 text-red-300"
                              : "border-border hover:bg-muted/40 disabled:opacity-60 disabled:cursor-not-allowed")
                        }
                      >
                        <span className="text-muted-foreground mr-2">
                          {Math.floor(i / 2) + 1}
                          {i % 2 === 0 ? "." : "..."}
                        </span>
                        {san}
                      </button>
                    );
                  })}
                </div>
                {revealed && (
                  <div className="border-t border-border pt-2 mt-2 text-xs space-y-1">
                    {picked === meta.badIdx ? (
                      <div className="flex items-center text-accent gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Correct!
                      </div>
                    ) : (
                      <div className="flex items-center text-destructive gap-2">
                        <XCircle className="w-4 h-4" /> Off — the lemon was{" "}
                        <span className="font-mono">{meta.sequence[meta.badIdx]}</span>
                      </div>
                    )}
                    {problem.explanation && (
                      <p className="text-muted-foreground">{problem.explanation}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setRevealed((r) => !r)}
                  disabled={picked !== null}
                >
                  <Eye className="w-4 h-4 mr-2" /> {revealed ? "Hide" : "Reveal"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={next}
                >
                  <ChevronRight className="w-4 h-4 mr-2" /> Next puzzle
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
