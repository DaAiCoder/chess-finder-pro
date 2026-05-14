/**
 * Calculation Ladder — drill where the user must announce a full
 * forcing sequence move-by-move. Successful streaks raise the rung,
 * misses drop it. SRS-aware: every attempt schedules the underlying
 * problem for spaced repetition.
 */

import * as React from "react";
import { Chess } from "chess.js";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { CoachExplanation } from "@/components/training/CoachExplanation";
import { api } from "@/lib/queryClient";
import { ChevronUp, ChevronDown, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

interface Resp {
  rung: number;
  problem: { problem: TrainingProblem; rung: number; plies: number } | null;
}

function stripDecor(san: string) {
  return san.replace(/[+#?!]/g, "");
}

export default function CalculationLadder() {
  const [rung, setRung] = React.useState(1);
  const [streak, setStreak] = React.useState(0);

  const q = useQuery<Resp>({
    queryKey: ["ladder", rung],
    queryFn: () => api(`/api/training/calculation-ladder?rung=${rung}`),
  });

  const problem = q.data?.problem;

  // Mutable working state for the active puzzle.
  const [stepIdx, setStepIdx] = React.useState(0);
  const [boardFen, setBoardFen] = React.useState("");
  const [verdict, setVerdict] = React.useState<"solved" | "wrong" | null>(null);
  const [wrongMove, setWrongMove] = React.useState<{ fen: string; san: string } | null>(null);
  const [startedAt, setStartedAt] = React.useState(Date.now());

  React.useEffect(() => {
    if (!problem) return;
    setBoardFen(problem.problem.fen);
    setStepIdx(0);
    setVerdict(null);
    setWrongMove(null);
    setStartedAt(Date.now());
  }, [problem?.problem.id]);

  const solution = (problem?.problem.solution as string[] | undefined) ?? [];

  const recordAttempt = useMutation({
    mutationFn: ({ solved }: { solved: boolean }) =>
      Promise.all([
        api("/api/training/attempt", {
          method: "POST",
          body: JSON.stringify({
            problemId: problem?.problem.id ?? 0,
            solved,
            timeSpent: Math.round((Date.now() - startedAt) / 1000),
          }),
        }),
        api("/api/srs/review", {
          method: "POST",
          body: JSON.stringify({
            problemId: problem?.problem.id ?? 0,
            quality: solved ? "pass" : "fail",
          }),
        }),
      ]),
  });

  function applyOpponentReply(probe: Chess, idx: number): { fen: string; appliedTo: number } {
    let i = idx;
    while (i < solution.length) {
      const san = solution[i];
      // Heuristic: every other entry in `solution` is the opponent's
      // forced reply. We apply it automatically so the user only types
      // their own moves.
      if (i % 2 === 1) {
        try {
          probe.move(san);
          i++;
        } catch {
          break;
        }
        return { fen: probe.fen(), appliedTo: i };
      } else {
        return { fen: probe.fen(), appliedTo: i };
      }
    }
    return { fen: probe.fen(), appliedTo: i };
  }

  function onMove(from: string, to: string, promotion?: string) {
    if (!problem || verdict !== null) return;
    const expected = solution[stepIdx];
    if (!expected) return;
    const probe = new Chess(boardFen);
    let played: string | null = null;
    try {
      played = probe.move({ from, to, promotion })?.san ?? null;
    } catch {
      return;
    }
    if (!played) return;
    const ok = stripDecor(played) === stripDecor(expected);
    if (!ok) {
      setVerdict("wrong");
      setWrongMove({ fen: boardFen, san: played });
      setStreak(0);
      setRung((r) => Math.max(1, r - 1));
      recordAttempt.mutate({ solved: false });
      return;
    }
    // Apply opponent reply (if any) and advance.
    const { fen: postReplyFen, appliedTo } = applyOpponentReply(probe, stepIdx + 1);
    setBoardFen(postReplyFen);
    setStepIdx(appliedTo);
    if (appliedTo >= solution.length) {
      setVerdict("solved");
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak >= 2) setRung((r) => Math.min(10, r + 1));
      recordAttempt.mutate({ solved: true });
    }
  }

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!problem)
    return <div className="p-6 text-sm text-muted-foreground">No suitable problem found for rung {rung}.</div>;

  const sideToMove = problem.problem.fen.split(" ")[1] === "b" ? "black" : "white";

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Calculation Ladder</h1>
          <p className="text-sm text-muted-foreground">
            Find every move of the sequence. Two in a row climbs a rung.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Rung {rung}</Badge>
          <Badge variant="outline">Streak {streak}</Badge>
          <Badge>{problem.plies}-ply</Badge>
        </div>
      </div>

      <Progress value={rung * 10} className="w-full" />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Move {Math.floor(stepIdx / 2) + 1} — {sideToMove} to play</CardTitle>
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
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Sequence
              found. Rung up on your next solve.
            </div>
          )}
          {verdict === "wrong" && wrongMove && (
            <>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" /> Wrong move.
                Dropped a rung.
              </div>
              <CoachExplanation
                fen={wrongMove.fen}
                userMove={wrongMove.san}
                correctMove={solution[stepIdx]}
              />
            </>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRung((r) => Math.max(1, r - 1))}
            >
              <ChevronDown className="w-4 h-4 mr-1" /> Easier
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRung((r) => Math.min(10, r + 1))}
            >
              <ChevronUp className="w-4 h-4 mr-1" /> Harder
            </Button>
            <div className="ml-auto">
              <Button size="sm" onClick={() => q.refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Next puzzle
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
