/**
 * Time-Pressure Simulator. Pulls a position the user blundered under
 * the clock and gives them a real 30-second ticking timer to find the
 * right move. After the attempt, the engine's best move is shown along
 * with a synthesized explanation of *why* it's best (the move's tactical
 * character, eval gap vs the runner-up, and the principal-variation
 * continuation).
 */

import * as React from "react";
import { Chess } from "chess.js";
import { useQuery } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { api } from "@/lib/queryClient";
import { Clock, RefreshCw, Sparkles, Target, BookOpen } from "lucide-react";

interface TimePressureProblem {
  fen: string;
  preface: string[];
  solution: string[];
  clockSeconds: number;
  source: { kind: "game"; gameId: number } | { kind: "problem"; problemId: number };
  context: string;
  bestMoveSan: string | null;
  engineLine: string[];
  evalAfterBest: number | null;
  mateIn: number | null;
  evalGap: number | null;
  explanation: string;
}

interface Resp {
  problem: TimePressureProblem | null;
}

function stripDecor(san: string) {
  return san.replace(/[+#?!]/g, "");
}

export default function TimePressure() {
  const q = useQuery<Resp>({
    queryKey: ["time-pressure"],
    queryFn: () => api("/api/training/time-pressure"),
  });

  const problem = q.data?.problem;
  const [remaining, setRemaining] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [boardFen, setBoardFen] = React.useState("");
  const [verdict, setVerdict] = React.useState<"timeout" | "solved" | "wrong" | null>(null);
  const [userPlayed, setUserPlayed] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!problem) return;
    setBoardFen(problem.fen);
    setRemaining(problem.clockSeconds);
    setRunning(true);
    setVerdict(null);
    setUserPlayed(null);
  }, [problem?.fen]);

  React.useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      setRunning(false);
      setVerdict("timeout");
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);

  // Must run unconditionally — never place hooks after an early return.
  const lastMove: [string, string] | undefined = React.useMemo(() => {
    if (!problem) return undefined;
    if (userPlayed) {
      try {
        const ch = new Chess(problem.fen);
        const mv = ch.move(userPlayed);
        return mv ? [mv.from, mv.to] : undefined;
      } catch {
        return undefined;
      }
    }
    if (verdict === "timeout" && problem.bestMoveSan) {
      try {
        const ch = new Chess(problem.fen);
        const mv = ch.move(problem.bestMoveSan);
        return mv ? [mv.from, mv.to] : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [problem, userPlayed, verdict]);

  const arrows = React.useMemo(() => {
    if (!problem || verdict === null) return undefined;
    if (!problem.bestMoveSan) return undefined;
    try {
      const ch = new Chess(problem.fen);
      const mv = ch.move(problem.bestMoveSan);
      return mv ? [{ orig: mv.from, dest: mv.to, brush: "green" as const }] : undefined;
    } catch {
      return undefined;
    }
  }, [problem, verdict]);

  function onMove(from: string, to: string, promotion?: string) {
    if (!problem || !running) return;
    const probe = new Chess(boardFen);
    let played: string | null = null;
    try {
      played = probe.move({ from, to, promotion })?.san ?? null;
    } catch {
      return;
    }
    if (!played) return;
    // Grade against the engine's best move first (more current than a
    // stored solution[0]), falling back to the curated solution if the
    // engine couldn't resolve in time.
    const target = problem.bestMoveSan ?? problem.solution[0] ?? null;
    const ok = target ? stripDecor(played) === stripDecor(target) : true;
    setBoardFen(probe.fen());
    setRunning(false);
    setUserPlayed(played);
    setVerdict(ok ? "solved" : "wrong");
  }

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!problem)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No time-pressure problem available. Import some blitz games first.
      </div>
    );

  const sideToMove = problem.fen.split(" ")[1] === "b" ? "black" : "white";
  const pct = (remaining / problem.clockSeconds) * 100;
  const isCritical = remaining <= 10;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Time-Pressure Simulator</h1>
          <p className="text-sm text-muted-foreground">{problem.context}</p>
        </div>
        <Badge variant={isCritical ? "destructive" : "secondary"} className="text-base font-mono">
          <Clock className="w-4 h-4 mr-1" /> {remaining}s
        </Badge>
      </div>

      <Progress value={pct} className={`w-full ${isCritical ? "[&>div]:bg-rose-500" : ""}`} />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm capitalize">{sideToMove} to move — find the best</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Chessboard
            fen={boardFen}
            orientation={sideToMove === "white" ? "white" : "black"}
            theme="wood"
            interactive={running}
            movableColor={sideToMove}
            onMove={onMove}
            lastMove={lastMove}
            arrows={arrows}
          />

          {verdict === "timeout" && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm">
              Time's up — that's exactly what happened in the game.
            </div>
          )}
          {verdict === "solved" && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
              Found it under pressure. {userPlayed && (
                <>You played <strong className="font-mono">{userPlayed}</strong>.</>
              )}
            </div>
          )}
          {verdict === "wrong" && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm">
              You played <strong className="font-mono">{userPlayed}</strong>. The engine wanted{" "}
              <strong className="font-mono">{problem.bestMoveSan ?? problem.solution[0] ?? "—"}</strong>.
            </div>
          )}

          {verdict !== null && (
            <EngineExplanation problem={problem} />
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => q.refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Renders the engine's reasoning panel after an attempt finishes:
 *   - best move SAN (with mate / eval badge)
 *   - generated "why this is best" prose
 *   - principal variation, side-numbered
 */
function EngineExplanation({ problem }: { problem: TimePressureProblem }) {
  if (!problem.bestMoveSan && !problem.explanation) return null;

  const evalBadge = problem.mateIn
    ? `#${Math.abs(problem.mateIn)}`
    : problem.evalAfterBest != null
    ? formatCp(problem.evalAfterBest)
    : null;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="font-semibold">Why this is best</span>
        {problem.bestMoveSan && (
          <Badge variant="outline" className="font-mono">
            <Target className="w-3 h-3 mr-1" /> {problem.bestMoveSan}
          </Badge>
        )}
        {evalBadge && (
          <Badge variant="outline" className="font-mono">
            {evalBadge}
          </Badge>
        )}
        {problem.evalGap != null && problem.evalGap >= 60 && (
          <Badge variant="outline" className="font-mono text-xs">
            +{(problem.evalGap / 100).toFixed(2)} vs #2
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
        {problem.explanation}
      </p>
      {problem.engineLine.length > 1 && (
        <div className="rounded border border-border/60 bg-card/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Engine line
          </div>
          <div className="font-mono text-xs mt-0.5">
            {formatEngineLine(problem.fen, problem.engineLine)}
          </div>
        </div>
      )}
    </div>
  );
}

function formatCp(cp: number): string {
  const v = cp / 100;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

/** Render a SAN line like "27.Qxh6+ gxh6 28.Rg3+ Kh8 29.Rg7" using the FEN's
 *  full-move counter and side-to-move for proper numbering. */
function formatEngineLine(fen: string, sans: string[]): string {
  const parts = fen.split(" ");
  const stmIsWhite = parts[1] === "w";
  const startNumber = Number(parts[parts.length - 1] ?? "1") || 1;
  const out: string[] = [];
  let n = startNumber;
  let i = 0;
  if (!stmIsWhite && sans.length > 0) {
    out.push(`${n}...${sans[0]}`);
    n += 1;
    i = 1;
  }
  while (i < sans.length) {
    const w = sans[i];
    const b = sans[i + 1];
    if (b) out.push(`${n}.${w} ${b}`);
    else out.push(`${n}.${w}`);
    n += 1;
    i += 2;
  }
  return out.join(" ");
}
