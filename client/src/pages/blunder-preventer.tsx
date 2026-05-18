import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import {
  useAnalyticsContext,
  usePrioritizeQuerySuffix,
  WeaknessBanner,
} from "@/components/training/WeaknessBanner";
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

export default function BlunderPreventer() {
  const ctx = useAnalyticsContext();
  const prioritize = usePrioritizeQuerySuffix(ctx);
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "blunder-preventer", ctx.fromAnalytics, prioritize],
    queryFn: () => api(`/api/training/problems?module=blunder-preventer${prioritize}`),
  });
  const [idx, setIdx] = React.useState(0);
  const [answered, setAnswered] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState(Date.now());

  const problem = all.data?.[idx];

  React.useEffect(() => {
    setAnswered(null);
    setStartedAt(Date.now());
  }, [problem?.id]);

  const attempt = useMutation({
    mutationFn: (solved: boolean) =>
      api("/api/training/attempt", {
        method: "POST",
        body: JSON.stringify({
          problemId: problem!.id,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        }),
      }),
  });

  if (!problem) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading or no problems available.</CardContent></Card>
      </div>
    );
  }

  const choices = ((problem.metadata as { choices?: string[] } | null)?.choices ?? (problem.solution as string[]) ?? []);
  const correct = (problem.solution as string[])[0];
  const sideToMove = problem.fen.split(" ")[1] === "b" ? "black" : "white";

  const choose = (c: string) => {
    if (answered) return;
    setAnswered(c);
    const ok = c === correct;
    attempt.mutate(ok);
    toast({ title: ok ? "Correct" : "Wrong", description: ok ? undefined : `Best was ${correct}`, variant: ok ? "success" : "destructive" });
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div>
        <h1 className="text-2xl font-bold">Blunder Prevention</h1>
        <p className="text-muted-foreground text-sm">Pick the safest move from the candidates.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="max-w-[640px]">
          <Chessboard fen={problem.fen} orientation={sideToMove} />
        </div>
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Choose the best move</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {choices.map((c) => {
                const state =
                  answered == null ? "idle" : c === correct ? "correct" : c === answered ? "wrong" : "idle";
                return (
                  <Button
                    key={c}
                    variant={state === "correct" ? "accent" : state === "wrong" ? "destructive" : "outline"}
                    className="w-full justify-between"
                    onClick={() => choose(c)}
                    disabled={!!answered}
                  >
                    <span className="font-mono">{c}</span>
                    {state === "correct" && <CheckCircle2 className="w-4 h-4" />}
                    {state === "wrong" && <XCircle className="w-4 h-4" />}
                  </Button>
                );
              })}
              {answered && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs text-muted-foreground">{problem.explanation}</p>
                  <Button onClick={() => setIdx((i) => (i + 1) % all.data!.length)} className="w-full">
                    <ChevronRight className="w-4 h-4 mr-2" /> Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
