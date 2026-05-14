import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Chessboard } from "@/components/chess/Chessboard";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { api } from "@/lib/queryClient";
import type { TrainingProblem } from "@shared/schema";

interface PawnStructureDrill {
  fen: string;
  solution: string;
  explanation: string;
  difficulty: number;
}

interface PawnStructure {
  id: string;
  name: string;
  fen: string;
  overview: string;
  plans: string[];
  breaks: string[];
  drills: PawnStructureDrill[];
}

type Mode = "overview" | "quiz" | "drill";

export default function PawnStructureTrainer() {
  const structures = useQuery<PawnStructure[]>({
    queryKey: ["training", "pawn-structures"],
    queryFn: () => api<PawnStructure[]>("/api/training/pawn-structures"),
  });
  const drillProblems = useQuery<TrainingProblem[]>({
    queryKey: ["training", "problems", "pawn-structures"],
    queryFn: () => api<TrainingProblem[]>("/api/training/problems?module=pawn-structures"),
  });

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("overview");

  React.useEffect(() => {
    if (!activeId && structures.data && structures.data[0]) {
      setActiveId(structures.data[0].id);
    }
  }, [structures.data, activeId]);

  const active = structures.data?.find((s) => s.id === activeId);
  const drillsForActive = React.useMemo(() => {
    if (!active) return [];
    return (drillProblems.data ?? []).filter((p) => {
      const meta = (p.metadata as { structureId?: string } | null) ?? null;
      return meta?.structureId === active.id;
    });
  }, [active, drillProblems.data]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Pawn structures</h1>
        <Link href="/training" className="text-sm text-accent underline">
          ← Hub
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Structures</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            {structures.isLoading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
            {(structures.data ?? []).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveId(s.id);
                  setMode("overview");
                }}
                className={`w-full text-left text-sm px-3 py-2 rounded-md hover:bg-accent/10 ${
                  activeId === s.id ? "bg-accent/15 font-medium" : ""
                }`}
                data-testid={`btn-structure-${s.id}`}
              >
                {s.name}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {active && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{active.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={mode === "overview" ? "default" : "outline"}
                    onClick={() => setMode("overview")}
                  >
                    Overview
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === "quiz" ? "default" : "outline"}
                    onClick={() => setMode("quiz")}
                  >
                    Quiz
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === "drill" ? "default" : "outline"}
                    onClick={() => setMode("drill")}
                  >
                    Drill
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {mode === "overview" && <Overview structure={active} />}
                {mode === "quiz" && <Quiz structure={active} />}
                {mode === "drill" && (
                  drillsForActive.length > 0 ? (
                    <PuzzlePlayer
                      problems={drillsForActive}
                      deckPersistenceKey={`pawn-structures:${active.id}:drill`}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No drill positions seeded for this structure yet.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ structure }: { structure: PawnStructure }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4">
      <div className="board-aspect max-w-sm">
        <Chessboard fen={structure.fen} interactive={false} />
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{structure.overview}</p>
        <div>
          <h3 className="font-medium text-sm mb-1">Plans</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            {structure.plans.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium text-sm mb-1">Typical pawn breaks</h3>
          <div className="flex flex-wrap gap-1">
            {structure.breaks.map((b, i) => (
              <Badge key={i} variant="secondary" className="font-mono">
                {b}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Quiz({ structure }: { structure: PawnStructure }) {
  // Shuffle plans/distractors and ask the user to identify the *primary* plan.
  const [picked, setPicked] = React.useState<string | null>(null);
  const choices = React.useMemo(() => {
    const correct = structure.plans[0];
    if (!correct) return [];
    const distractors = ["Trade all the pieces immediately.", "Launch a kingside pawn storm regardless of structure.", "Move the queen to attack the opposing rook."];
    const arr = [correct, ...distractors];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }, [structure.id, structure.plans]);

  const correct = structure.plans[0];

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        What's the primary long-term plan in the <span className="font-medium">{structure.name}</span>?
      </p>
      <div className="space-y-2">
        {choices.map((c) => {
          const isPicked = picked === c;
          const isCorrect = c === correct;
          return (
            <button
              key={c}
              onClick={() => setPicked(c)}
              disabled={picked !== null}
              className={`w-full text-left p-3 rounded-md border ${
                picked === null
                  ? "border-border hover:bg-accent/10"
                  : isCorrect
                  ? "border-green-500 bg-green-500/10"
                  : isPicked
                  ? "border-destructive bg-destructive/10"
                  : "border-border opacity-60"
              }`}
              data-testid={`quiz-choice-${c.slice(0, 10)}`}
            >
              {c}
            </button>
          );
        })}
      </div>
      {picked && (
        <Button size="sm" onClick={() => setPicked(null)}>
          Try another quiz
        </Button>
      )}
    </div>
  );
}
