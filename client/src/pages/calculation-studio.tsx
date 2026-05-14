import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { CheckCircle2, Eye, EyeOff, ChevronRight, RotateCcw } from "lucide-react";

interface CalcProblem {
  id: string;
  fen: string;
  sideToMove: "white" | "black";
  solution: string[];
  explanation: string;
  difficulty: number;
  theme: string;
}

type Status = "playing" | "wrong" | "solved";

export default function CalculationStudio() {
  const problems = useQuery<CalcProblem[]>({
    queryKey: ["training", "calculation-studio"],
    queryFn: () => api<CalcProblem[]>("/api/training/calculation-studio"),
  });

  const [idx, setIdx] = React.useState(0);
  const list = problems.data ?? [];
  const current = list[idx];

  // The user's progress through current.solution (user plies = even indices).
  const [playedCount, setPlayedCount] = React.useState(0);
  const [input, setInput] = React.useState("");
  const [status, setStatus] = React.useState<Status>("playing");
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    setPlayedCount(0);
    setInput("");
    setStatus("playing");
    setRevealed(false);
  }, [current?.id]);

  // Imagined FEN at the current ply — used for "Peek" mode only. Must run before
  // any early return so hook order is stable while the query is loading.
  const imaginedFen = React.useMemo(() => {
    if (!current) return "";
    try {
      const c = new Chess(current.fen);
      for (let i = 0; i < playedCount; i++) c.move(current.solution[i]!);
      return c.fen();
    } catch {
      return current.fen;
    }
  }, [current, playedCount]);

  if (problems.isLoading || !problems.data) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!current) {
    return <div className="p-4 text-sm text-muted-foreground">No calculation puzzles available.</div>;
  }

  const userPlyTargets = current.solution.filter((_, i) => i % 2 === 0);
  const nextExpected = current.solution[playedCount];

  const submit = () => {
    const guess = input.trim();
    if (!guess || status !== "playing") return;
    // Normalise: accept both SAN with/without check/mate suffix.
    const norm = (s: string) => s.replace(/[+#?!]/g, "").trim();
    if (nextExpected && norm(guess) === norm(nextExpected)) {
      const next = playedCount + 1;
      // Auto-play forced opponent reply if any.
      const advance = next + (next < current.solution.length ? 1 : 0);
      setPlayedCount(advance);
      setInput("");
      if (advance >= current.solution.length) {
        setStatus("solved");
        toast({ title: "Sequence found!", variant: "success" });
      }
    } else {
      setStatus("wrong");
      toast({ title: "Not the forcing move", description: `Looking for the only move that keeps the attack alive.` });
    }
  };

  const reset = () => {
    setPlayedCount(0);
    setInput("");
    setStatus("playing");
    setRevealed(false);
  };

  const next = () => {
    setIdx((i) => (i + 1) % list.length);
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Calculation Studio</h1>
        <Link href="/training" className="text-sm text-accent underline">
          ← Hub
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Puzzle {idx + 1} / {list.length}
            <Badge variant="secondary" className="font-mono text-xs">
              {current.theme}
            </Badge>
            <Badge variant="outline" className="text-xs">
              difficulty {current.difficulty}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {current.sideToMove} to play
            </Badge>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={next} data-testid="btn-next-puzzle">
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4">
            <div className="board-aspect max-w-sm">
              <Chessboard
                fen={revealed ? imaginedFen : current.fen}
                orientation={current.sideToMove}
                interactive={false}
              />
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Calculate the forcing line move-by-move. Enter each of your moves in SAN — the board does <span className="font-medium">not</span> update unless you peek.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={revealed ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRevealed((r) => !r)}
                >
                  {revealed ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide imagined
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Peek current position
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder={status === "solved" ? "Solved!" : "Enter SAN move…"}
                  disabled={status === "solved"}
                  data-testid="input-san-move"
                />
                <Button onClick={submit} disabled={status === "solved" || !input.trim()}>
                  Play
                </Button>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Move </span>
                <span className="font-mono">{Math.floor(playedCount / 2) + 1}</span>
                <span className="text-muted-foreground"> ({Math.min(userPlyTargets.length, Math.floor(playedCount / 2) + (playedCount % 2 === 0 ? 1 : 0))} of {userPlyTargets.length} your moves)</span>
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {current.solution.slice(0, playedCount).map((m, i) => (
                  <span key={i}>{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}{m} </span>
                ))}
              </div>
              {status === "solved" && (
                <Card className="bg-green-500/10 border-green-500">
                  <CardContent className="p-3 flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                    <div>
                      <p className="font-medium">Sequence complete</p>
                      <p className="text-muted-foreground">{current.explanation}</p>
                    </div>
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
