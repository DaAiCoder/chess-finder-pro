import * as React from "react";
import { Chess } from "chess.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { CheckCircle2, ChevronRight, Lightbulb, XCircle } from "lucide-react";
import { ProblemSourceBadge } from "@/components/training/ProblemSourceBadge";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import {
  indexForProblemId,
  readDeckProblemId,
  writeDeckProblemId,
} from "@/lib/trainingDeckCursor";
import type { TrainingProblem } from "@shared/schema";
import { TrainingLimitBanner } from "@/components/training/TrainingLimitBanner";
import { trackTrainerAttempt, trackTrainerView } from "@/lib/analytics";

export interface PuzzlePlayerProps {
  problems: TrainingProblem[];
  /** Allow the user to advance (after correct/incorrect) — usually true. */
  showNext?: boolean;
  onSolved?: (problem: TrainingProblem) => void;
  /**
   * When set, the current puzzle id is saved to localStorage under this key
   * so revisiting the trainer resumes the same position in the deck.
   */
  deckPersistenceKey?: string;
  /** After a correct solve, advance to the next puzzle automatically (default true). */
  autoAdvanceOnSolve?: boolean;
}

/**
 * Reusable puzzle player.
 *
 * - Shows the current problem's FEN, lets the user play moves on the board.
 * - Validates against the solution[] (each entry is a SAN).
 * - Auto-plays the opponent's reply (if any) after each correct user move.
 * - Records an attempt at the end and emits a toast.
 */
export function PuzzlePlayer({
  problems,
  showNext = true,
  onSolved,
  deckPersistenceKey,
  autoAdvanceOnSolve = true,
}: PuzzlePlayerProps) {
  const [idx, setIdx] = React.useState(0);
  const [chess, setChess] = React.useState(() => new Chess());
  const [fen, setFen] = React.useState("");
  const [solutionIdx, setSolutionIdx] = React.useState(0);
  const [status, setStatus] = React.useState<"idle" | "wrong" | "solved">("idle");
  const [startedAt, setStartedAt] = React.useState<number>(Date.now());
  const [hint, setHint] = React.useState(false);
  const { theme: boardTheme } = useBoardTheme();
  const qc = useQueryClient();

  const problemIdsKey = React.useMemo(
    () => problems.map((p) => p.id).join(","),
    [problems],
  );

  const problemsRef = React.useRef(problems);
  problemsRef.current = problems;

  React.useLayoutEffect(() => {
    if (!deckPersistenceKey) return;
    const list = problemsRef.current;
    if (list.length === 0) return;
    const saved = readDeckProblemId(deckPersistenceKey);
    setIdx(indexForProblemId(list, saved));
  }, [deckPersistenceKey, problemIdsKey]);

  React.useEffect(() => {
    if (!deckPersistenceKey) return;
    const list = problemsRef.current;
    if (list.length === 0) return;
    const p = list[idx];
    if (p) writeDeckProblemId(deckPersistenceKey, p.id);
  }, [deckPersistenceKey, idx, problemIdsKey]);

  const problem = problems[idx];

  React.useEffect(() => {
    if (!problem) return;
    trackTrainerView(problem.module);
    const c = new Chess(problem.fen);
    setChess(c);
    setFen(c.fen());
    setSolutionIdx(0);
    setStatus("idle");
    setHint(false);
    setStartedAt(Date.now());
  }, [problem]);

  React.useEffect(() => {
    if (status !== "solved" || !autoAdvanceOnSolve || problems.length <= 1) return;
    const t = window.setTimeout(() => {
      setIdx((i) => (i + 1) % problems.length);
    }, 750);
    return () => window.clearTimeout(t);
  }, [status, autoAdvanceOnSolve, problems.length]);

  const recordAttempt = useMutation({
    mutationFn: (solved: boolean) =>
      api<Record<string, unknown>>("/api/training/attempt", {
        method: "POST",
        body: JSON.stringify({
          problemId: problem.id,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        }),
      }),
    onSuccess: (data, solved) => {
      if (problem) {
        trackTrainerAttempt({
          module: problem.module,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        });
      }
      void qc.invalidateQueries({ queryKey: ["training", "usage"] });
      if (data.levelUp) {
        toast({
          title: "Level up!",
          description: `You reached level ${String(data.userLevel ?? "")}`,
          variant: "success",
        });
      }
    },
    onError: (err: Error) => {
      if (err.message.includes("training_daily_limit")) {
        toast({
          title: "Daily puzzle limit reached",
          description: "Subscribe for unlimited training at /pricing",
          variant: "destructive",
        });
        void qc.invalidateQueries({ queryKey: ["training", "usage"] });
        return;
      }
      if (err.message.includes("training_pro_required")) {
        toast({
          title: "Pro trainer",
          description: "Subscribe at /pricing to unlock this module",
          variant: "destructive",
        });
      }
    },
  });

  if (!problem) {
    return (
      <div className="space-y-3">
        <TrainingLimitBanner />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No problems in this set yet. Generate some from one of your reviewed games, or import games.
          </CardContent>
        </Card>
      </div>
    );
  }

  const solution = (problem.solution as string[]) ?? [];

  const onMove = (from: string, to: string, promotion?: string) => {
    if (status !== "idle") return;
    const probe = new Chess(fen);
    let san: string | null = null;
    try {
      const m = probe.move({ from, to, promotion });
      san = m?.san ?? null;
    } catch {
      return;
    }
    if (!san) return;

    const expected = solution[solutionIdx];
    if (!expected || stripDecor(san) !== stripDecor(expected)) {
      setStatus("wrong");
      recordAttempt.mutate(false);
      toast({ title: "Not the move", description: `Expected ${expected ?? "—"}`, variant: "destructive" });
      return;
    }

    chess.move({ from, to, promotion });
    let nextFen = chess.fen();
    let nextSolutionIdx = solutionIdx + 1;

    // Auto-play opponent's reply if there is one in the solution.
    if (nextSolutionIdx < solution.length) {
      setTimeout(() => {
        try {
          const reply = solution[nextSolutionIdx];
          chess.move(reply);
          nextSolutionIdx += 1;
          nextFen = chess.fen();
          setFen(nextFen);
          setSolutionIdx(nextSolutionIdx);
          if (nextSolutionIdx >= solution.length) {
            setStatus("solved");
            recordAttempt.mutate(true);
            onSolved?.(problem);
            toast({ title: "Solved!", variant: "success" });
          }
        } catch {
          // ignore
        }
      }, 500);
    } else {
      setStatus("solved");
      recordAttempt.mutate(true);
      onSolved?.(problem);
      toast({ title: "Solved!", variant: "success" });
    }
    setFen(nextFen);
    setSolutionIdx(nextSolutionIdx);
  };

  const next = () => setIdx((i) => (i + 1) % problems.length);

  const sideToMove = problem.fen.split(" ")[1] === "b" ? "black" : "white";

  return (
    <div className="space-y-3">
      <TrainingLimitBanner />
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="max-w-[640px]">
        <Chessboard
          fen={fen}
          orientation={sideToMove}
          theme={boardTheme}
          interactive={status === "idle"}
          movableColor={sideToMove}
          onMove={onMove}
          arrows={hint && solution[solutionIdx]
            ? sanArrow(fen, solution[solutionIdx])
            : []}
        />
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{problem.tacticType ?? problem.module}</span>
              <Badge variant="outline">★ {problem.difficulty}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground capitalize">{sideToMove} to move</p>
            <ProblemSourceBadge problem={problem} />
            {(() => {
              const themes = problem.themes as string[] | null | undefined;
              if (!themes || !Array.isArray(themes) || themes.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {themes.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground">
              Solution progress: {solutionIdx} / {solution.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setHint((h) => !h)}>
                <Lightbulb className="w-4 h-4 mr-2" /> {hint ? "Hide hint" : "Hint"}
              </Button>
              {showNext && (
                <Button variant="outline" size="sm" onClick={next}>
                  <ChevronRight className="w-4 h-4 mr-2" /> Next
                </Button>
              )}
            </div>
            {status === "solved" && (
              <div className="flex items-center text-accent text-xs gap-2">
                <CheckCircle2 className="w-4 h-4" /> Solved
              </div>
            )}
            {status === "wrong" && (
              <div className="flex items-center text-destructive text-xs gap-2">
                <XCircle className="w-4 h-4" /> Not the move — try the next puzzle
              </div>
            )}
            {problem.explanation && (status !== "idle" || hint) && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2">{problem.explanation}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}

function stripDecor(san: string): string {
  return san.replace(/[+#?!]/g, "");
}

function sanArrow(fen: string, san: string) {
  try {
    const c = new Chess(fen);
    const m = c.move(san);
    if (!m) return [];
    return [{ orig: m.from, dest: m.to, brush: "blue" as const }];
  } catch {
    return [];
  }
}
