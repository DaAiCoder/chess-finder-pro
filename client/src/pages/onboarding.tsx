/**
 * 10-puzzle onboarding calibration.
 *
 * Walks new users through 10 progressively-difficult puzzles, classifies
 * each by motif, and submits the outcome to the server which fits a
 * per-motif skill rating and recommends 3 modules to work on.
 *
 * The page is purposefully chrome-light — no sidebar — so a brand-new
 * visitor's first 90 seconds is "click, play, see your weak spots".
 */

import * as React from "react";
import { Chess } from "chess.js";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { api } from "@/lib/queryClient";
import { track, Events } from "@/lib/analytics";
import { CheckCircle2, ChevronRight, XCircle, Sparkles } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

interface OnboardingPuzzle {
  problem: TrainingProblem;
  motifKey: string;
  index: number;
}

interface PuzzlesResponse {
  puzzles: OnboardingPuzzle[];
}

interface Recommendation {
  module: string;
  href: string;
  motifKey: string;
  rating: number;
  accuracyPct: number | null;
  reason: string;
}

interface SubmitResponse {
  recommendations: Recommendation[];
}

function stripDecor(san: string): string {
  return san.replace(/[+#?!]/g, "");
}

export default function Onboarding() {
  const list = useQuery<PuzzlesResponse>({
    queryKey: ["onboarding", "puzzles"],
    queryFn: () => api("/api/onboarding/puzzles"),
  });

  const [idx, setIdx] = React.useState(0);
  const [results, setResults] = React.useState<
    { motifKey: string; difficulty: number; success: boolean }[]
  >([]);
  const [verdict, setVerdict] = React.useState<"solved" | "wrong" | null>(null);
  const [boardFen, setBoardFen] = React.useState("");
  const [recs, setRecs] = React.useState<Recommendation[] | null>(null);

  const puzzles = list.data?.puzzles ?? [];
  const current = puzzles[idx];

  React.useEffect(() => {
    setBoardFen(current?.problem.fen ?? "");
    setVerdict(null);
  }, [current?.problem.id]);

  const submit = useMutation<SubmitResponse, Error, typeof results>({
    mutationFn: (payload) =>
      api("/api/onboarding/submit", {
        method: "POST",
        body: JSON.stringify({ results: payload }),
      }),
    onSuccess: (resp) => {
      setRecs(resp.recommendations);
      track(Events.OnboardingComplete, {
        solved: results.filter((r) => r.success).length,
        total: results.length,
      });
    },
  });

  React.useEffect(() => {
    track(Events.OnboardingStart);
  }, []);

  function recordOutcome(success: boolean) {
    if (!current) return;
    const row = {
      motifKey: current.motifKey,
      difficulty: current.problem.difficulty,
      success,
    };
    const newResults = [...results, row];
    setResults(newResults);
    setVerdict(success ? "solved" : "wrong");
    if (idx + 1 >= puzzles.length) {
      submit.mutate(newResults);
    }
  }

  function nextPuzzle() {
    if (idx + 1 < puzzles.length) setIdx(idx + 1);
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!current || verdict !== null) return;
    const probe = new Chess(boardFen);
    let played: string | null = null;
    try {
      const m = probe.move({ from, to, promotion });
      played = m?.san ?? null;
    } catch {
      return;
    }
    if (!played) return;
    const expected = (current.problem.solution as string[] | undefined)?.[0] ?? "";
    const ok = stripDecor(played) === stripDecor(expected);
    setBoardFen(probe.fen());
    recordOutcome(ok);
  }

  if (list.isLoading) {
    return <CenteredMessage>Loading calibration puzzles…</CenteredMessage>;
  }
  if (!current && !recs) {
    return (
      <CenteredMessage>
        No calibration puzzles available — try refreshing or import some games first.
      </CenteredMessage>
    );
  }

  if (recs) {
    return <ResultsCard recs={recs} stats={results} />;
  }

  const progress = (idx / Math.max(1, puzzles.length)) * 100;
  const sideToMove = current.problem.fen.split(" ")[1] === "b" ? "black" : "white";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Quick calibration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            10 puzzles tell us where to start your training.
          </p>
        </div>

        <Progress value={progress} className="w-full" />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="text-sm font-medium">
              Puzzle {idx + 1} of {puzzles.length}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{current.motifKey}</Badge>
              <Badge variant="secondary">difficulty {current.problem.difficulty}</Badge>
              <Badge>{sideToMove} to move</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Chessboard
              fen={boardFen}
              orientation={sideToMove === "white" ? "white" : "black"}
              theme="wood"
              interactive={verdict === null}
              movableColor={sideToMove}
              onMove={onMove}
            />

            {verdict === "solved" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Nice — moving on.
              </div>
            )}
            {verdict === "wrong" && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" />
                Not quite — that's useful information.
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => recordOutcome(false)}
                disabled={verdict !== null}
              >
                Skip / I don't see it
              </Button>
              <div className="ml-auto">
                {verdict !== null && idx + 1 < puzzles.length && (
                  <Button onClick={nextPuzzle}>
                    Next puzzle <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
                {verdict !== null && idx + 1 >= puzzles.length && (
                  <span className="text-sm text-muted-foreground">
                    Finishing up…
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultsCard({
  recs,
  stats,
}: {
  recs: Recommendation[];
  stats: { success: boolean }[];
}) {
  const solved = stats.filter((s) => s.success).length;
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Your calibration profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              You solved <strong>{solved}/{stats.length}</strong>. Based on
              which themes tripped you up, here are the modules that will
              move your rating fastest:
            </div>
            <div className="space-y-2">
              {recs.length === 0 && (
                <div className="text-sm text-muted-foreground italic">
                  Not enough signal to recommend yet — solve a few more
                  puzzles in any trainer and we'll start tracking weak spots.
                </div>
              )}
              {recs.map((r) => (
                <Link key={r.motifKey} href={r.href}>
                  <a className="block">
                    <div className="rounded-lg border bg-card hover:bg-accent transition px-4 py-3 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">{r.module}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.reason}
                        </div>
                      </div>
                      <Badge variant="outline">{r.rating}</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </a>
                </Link>
              ))}
            </div>
            <div className="pt-2 flex flex-wrap gap-2">
              <Link href="/training">
                <a>
                  <Button variant="default">Go to training dashboard</Button>
                </a>
              </Link>
              <Link href="/training/retry">
                <a>
                  <Button variant="outline">Open daily review</Button>
                </a>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6 text-center">
      {children}
    </div>
  );
}
