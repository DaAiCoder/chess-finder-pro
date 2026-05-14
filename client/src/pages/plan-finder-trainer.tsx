import * as React from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { CheckCircle2, XCircle, ChevronRight } from "lucide-react";

interface PlanChoice {
  label: string;
  firstMove: string;
}
interface StrategicPlanProblem {
  id: string;
  fen: string;
  prompt: string;
  choices: PlanChoice[];
  correctIndex: number;
  canonicalLine: string[];
  explanation: string;
  difficulty: number;
  theme: string;
}

export default function PlanFinderTrainer() {
  const plans = useQuery<StrategicPlanProblem[]>({
    queryKey: ["training", "plans"],
    queryFn: () => api<StrategicPlanProblem[]>("/api/training/plans"),
  });
  const [idx, setIdx] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [startedAt, setStartedAt] = React.useState(() => Date.now());

  const recordAttempt = useMutation({
    mutationFn: ({ problemId, solved }: { problemId: number; solved: boolean }) =>
      api<{ levelUp?: boolean; userLevel?: number }>("/api/training/attempt", {
        method: "POST",
        body: JSON.stringify({
          problemId,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        }),
      }),
    onSuccess: (data) => {
      if (data?.levelUp) {
        toast({
          title: "Level up!",
          description: `You reached level ${String(data.userLevel ?? "")}`,
          variant: "success",
        });
      }
    },
  });

  // Optional: when we have a corresponding training_problem row, record attempts there too.
  const dbProblems = useQuery({
    queryKey: ["training", "problems", "plans"],
    queryFn: () => api<{ id: number; metadata?: { planId?: string } }[]>("/api/training/problems?module=plans"),
  });

  const current = plans.data?.[idx];

  React.useEffect(() => {
    setPicked(null);
    setStartedAt(Date.now());
  }, [idx, current?.id]);

  if (plans.isLoading || !plans.data) {
    return <div className="p-4 text-sm text-muted-foreground">Loading plans…</div>;
  }
  if (!current) {
    return <div className="p-4 text-sm text-muted-foreground">No plans available.</div>;
  }

  const orientation = startSideOf(current.fen);

  const submit = (choiceIdx: number) => {
    if (picked !== null) return;
    setPicked(choiceIdx);
    const solved = choiceIdx === current.correctIndex;
    const dbRow = (dbProblems.data ?? []).find(
      (r) => (r.metadata as { planId?: string } | undefined)?.planId === current.id,
    );
    if (dbRow) {
      recordAttempt.mutate({ problemId: dbRow.id, solved });
    } else if (solved) {
      toast({ title: "Correct!", variant: "success" });
    } else {
      toast({ title: "Not quite", description: current.explanation });
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Plan finder</h1>
        <Link href="/training" className="text-sm text-accent underline">
          ← Hub
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Plan #{idx + 1}
            <Badge variant="secondary" className="font-mono text-xs">
              {current.theme}
            </Badge>
            <Badge variant="outline" className="text-xs">
              difficulty {current.difficulty}
            </Badge>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIdx((i) => (i + 1) % (plans.data?.length ?? 1))}
            data-testid="btn-next-plan"
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4">
            <div className="board-aspect max-w-sm">
              <Chessboard fen={current.fen} orientation={orientation} interactive={false} />
            </div>
            <div className="space-y-3">
              <p className="text-sm">{current.prompt}</p>
              <div className="space-y-2">
                {current.choices.map((c, i) => {
                  const isPicked = picked === i;
                  const isCorrect = i === current.correctIndex;
                  const reveal = picked !== null;
                  return (
                    <button
                      key={i}
                      onClick={() => submit(i)}
                      disabled={reveal}
                      className={`w-full text-left p-3 rounded-md border text-sm ${
                        !reveal
                          ? "border-border hover:bg-accent/10"
                          : isCorrect
                          ? "border-green-500 bg-green-500/10"
                          : isPicked
                          ? "border-destructive bg-destructive/10"
                          : "border-border opacity-60"
                      }`}
                      data-testid={`plan-choice-${i}`}
                    >
                      <span className="flex items-start gap-2">
                        {reveal ? (
                          isCorrect ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                          ) : isPicked ? (
                            <XCircle className="w-4 h-4 mt-0.5 text-destructive" />
                          ) : null
                        ) : (
                          <span className="w-4 h-4 mt-0.5 inline-block rounded-full border border-border" />
                        )}
                        <span>
                          <span className="font-mono mr-1.5">{c.firstMove}</span> — {c.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <Card className="bg-secondary/30">
                  <CardContent className="p-3 space-y-2 text-sm">
                    <p className="font-medium">
                      {picked === current.correctIndex ? "Correct" : "Try the canonical plan"}
                    </p>
                    <p className="text-muted-foreground">{current.explanation}</p>
                    {current.canonicalLine.length > 0 && (
                      <p>
                        <span className="text-muted-foreground">Canonical move: </span>
                        <span className="font-mono">{current.canonicalLine.join(" ")}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function startSideOf(fen: string): "white" | "black" {
  try {
    return new Chess(fen).turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}
