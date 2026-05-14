import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Flag,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  Trophy,
  XCircle,
} from "lucide-react";

interface EndgameMove {
  san: string;
  comment?: string;
}

interface EndgameLesson {
  id: string;
  name: string;
  category: string;
  fen: string;
  userSide: "white" | "black";
  objective: "win" | "draw" | "checkmate";
  tagline: string;
  principle: string[];
  solution: EndgameMove[];
  defaultLevel?: number;
}

type Mode = "lesson" | "practice";

const PROGRESS_KEY = "endgames-progress-v1";

interface ProgressMap {
  [lessonId: string]: { completed?: boolean; bestPlies?: number };
}

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}
function saveProgress(p: ProgressMap) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const BOT_DELAY = 350;

export default function EndgameTrainerPro() {
  const [, params] = useRoute<{ id: string }>("/endgames/:id");
  const id = params?.id;

  const { data: lesson, isLoading } = useQuery<EndgameLesson>({
    queryKey: ["endgames", "lesson", id],
    queryFn: () => api(`/api/endgames/lessons/${id}`),
    enabled: !!id,
  });

  if (!id) return null;
  if (isLoading || !lesson) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }
  return <Trainer lesson={lesson} />;
}

function Trainer({ lesson }: { lesson: EndgameLesson }) {
  const [mode, setMode] = React.useState<Mode>("lesson");
  const [progress, setProgress] = React.useState<ProgressMap>(() => loadProgress());

  const markCompleted = React.useCallback(
    (id: string, plies: number) => {
      setProgress((prev) => {
        const cur = prev[id] ?? {};
        const newBest =
          cur.bestPlies != null ? Math.min(cur.bestPlies, plies) : plies;
        const next: ProgressMap = {
          ...prev,
          [id]: { completed: true, bestPlies: newBest },
        };
        saveProgress(next);
        return next;
      });
    },
    [],
  );

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/endgames"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All endgames
        </Link>
        <h1 className="text-2xl font-bold">{lesson.name}</h1>
        <Badge variant="outline" className="text-[10px] uppercase">
          {lesson.objective}
        </Badge>
        <Badge variant="outline" className="text-[10px] uppercase">
          You play {lesson.userSide}
        </Badge>
        {progress[lesson.id]?.completed && (
          <Badge className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ✓ completed
          </Badge>
        )}
      </div>

      <p className="text-sm italic text-muted-foreground -mt-2">{lesson.tagline}</p>

      <div className="flex flex-wrap items-center gap-2">
        <ModeButton
          active={mode === "lesson"}
          onClick={() => setMode("lesson")}
          icon={GraduationCap}
          label="Lesson"
        />
        <ModeButton
          active={mode === "practice"}
          onClick={() => setMode("practice")}
          icon={Cpu}
          label="Play vs Engine"
        />
      </div>

      {mode === "lesson" ? (
        <LessonMode lesson={lesson} />
      ) : (
        <PracticeMode lesson={lesson} onComplete={markCompleted} />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground/80 border-border hover:bg-secondary",
      )}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

/* ====================================================================== */
/*  Lesson mode — annotated walkthrough                                    */
/* ====================================================================== */

function LessonMode({ lesson }: { lesson: EndgameLesson }) {
  const [chess] = React.useState(() => new Chess(lesson.fen));
  const [moveIdx, setMoveIdx] = React.useState(0);
  const [fen, setFen] = React.useState(lesson.fen);
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();

  React.useEffect(() => {
    chess.load(lesson.fen);
    setFen(lesson.fen);
    setMoveIdx(0);
    setLastMove(undefined);
  }, [lesson.fen, chess]);

  const goTo = (target: number) => {
    if (target < 0 || target > lesson.solution.length) return;
    chess.load(lesson.fen);
    let last: [string, string] | undefined;
    for (let i = 0; i < target; i++) {
      try {
        const m = chess.move(lesson.solution[i].san);
        if (m) last = [m.from, m.to];
      } catch {
        return;
      }
    }
    setFen(chess.fen());
    setMoveIdx(target);
    setLastMove(last);
  };

  const lastPlayed = moveIdx > 0 ? lesson.solution[moveIdx - 1] : null;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="space-y-3">
        <div className="max-w-[640px] mx-auto lg:mx-0">
          <Chessboard
            fen={fen}
            orientation={lesson.userSide}
            interactive={false}
            lastMove={lastMove}
          />
          <div className="flex items-center gap-2 mt-3">
            <Button variant="outline" size="icon" onClick={() => goTo(0)}>
              ⏮
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goTo(moveIdx - 1)}
              disabled={moveIdx === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goTo(moveIdx + 1)}
              disabled={moveIdx >= lesson.solution.length}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goTo(lesson.solution.length)}
            >
              ⏭
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Move {moveIdx} / {lesson.solution.length}
            </span>
          </div>
        </div>

        {lastPlayed?.comment && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex gap-2 text-amber-100">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-mono font-bold mr-2">{lastPlayed.san}</span>
              {lastPlayed.comment}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Principle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            {lesson.principle.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Solution</CardTitle>
          </CardHeader>
          <CardContent className="p-2 max-h-[320px] overflow-y-auto">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-xs font-mono tabular-nums">
              {Array.from({ length: Math.ceil(lesson.solution.length / 2) }).map((_, i) => {
                const wIdx = i * 2;
                const bIdx = wIdx + 1;
                const w = lesson.solution[wIdx];
                const b = lesson.solution[bIdx];
                return (
                  <React.Fragment key={i}>
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <button
                      onClick={() => goTo(wIdx + 1)}
                      className={cn(
                        "px-1 rounded text-left hover:bg-secondary transition-colors",
                        moveIdx > wIdx ? "text-foreground" : "text-muted-foreground/60",
                        moveIdx === wIdx + 1 && "bg-primary/20 font-semibold",
                      )}
                    >
                      {w?.san ?? ""}
                    </button>
                    <button
                      onClick={() => b && goTo(bIdx + 1)}
                      disabled={!b}
                      className={cn(
                        "px-1 rounded text-left hover:bg-secondary transition-colors",
                        moveIdx > bIdx ? "text-foreground" : "text-muted-foreground/60",
                        moveIdx === bIdx + 1 && "bg-primary/20 font-semibold",
                      )}
                    >
                      {b?.san ?? ""}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Practice mode — play it out vs Stockfish                               */
/* ====================================================================== */

function PracticeMode({
  lesson,
  onComplete,
}: {
  lesson: EndgameLesson;
  onComplete: (id: string, plies: number) => void;
}) {
  const userColor = lesson.userSide;
  const engineLevel = lesson.defaultLevel ?? 5;

  const [chess] = React.useState(() => new Chess(lesson.fen));
  const [fen, setFen] = React.useState(lesson.fen);
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();
  const [history, setHistory] = React.useState<string[]>([]);
  const [outcome, setOutcome] = React.useState<
    "playing" | "achieved" | "failed" | "stalemate" | "checkmate-against-us"
  >("playing");
  const [showHint, setShowHint] = React.useState(false);
  const [hint, setHint] = React.useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const userSideShort = userColor === "white" ? "w" : "b";
  const engineSideShort = userSideShort === "w" ? "b" : "w";

  const reset = React.useCallback(() => {
    chess.load(lesson.fen);
    setFen(lesson.fen);
    setLastMove(undefined);
    setHistory([]);
    setOutcome("playing");
    setHint(null);
    setShowHint(false);
    setErr(null);
  }, [chess, lesson.fen]);

  React.useEffect(() => {
    reset();
  }, [lesson.fen, reset]);

  const engineMove = useMutation({
    mutationFn: (curFen: string) =>
      api<{ bestMove: string | null; engineMode: string }>("/api/play/move", {
        method: "POST",
        body: JSON.stringify({ fen: curFen, level: engineLevel }),
      }),
  });

  // Let the engine move when it's its turn.
  React.useEffect(() => {
    if (outcome !== "playing") return;
    if (chess.turn() !== engineSideShort) return;

    let cancelled = false;
    setThinking(true);
    const timer = setTimeout(() => {
      engineMove
        .mutateAsync(fen)
        .then((r) => {
          if (cancelled) return;
          if (!r.bestMove || r.bestMove.length < 4) {
            setThinking(false);
            checkAchievement();
            return;
          }
          const from = r.bestMove.slice(0, 2);
          const to = r.bestMove.slice(2, 4);
          const promo = r.bestMove.length > 4 ? r.bestMove.slice(4, 5) : undefined;
          try {
            const m = chess.move({ from, to, promotion: promo });
            if (!m) return;
            setLastMove([m.from, m.to]);
            setFen(chess.fen());
            setHistory((h) => [...h, m.san]);
            checkAchievement();
          } catch {
            /* engine returned illegal move (mock fallback?) — try again */
          }
          setThinking(false);
        })
        .catch((e) => {
          if (cancelled) return;
          setErr(`Engine error: ${e?.message ?? "unknown"}`);
          setThinking(false);
        });
    }, BOT_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, outcome]);

  function checkAchievement() {
    if (chess.isCheckmate()) {
      // Whoever just moved delivered mate.
      const mover = chess.turn() === "w" ? "b" : "w";
      if (mover === userSideShort) {
        setOutcome("achieved");
        onComplete(lesson.id, history.length + 1);
      } else {
        setOutcome("checkmate-against-us");
      }
      return;
    }
    if (chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial()) {
      if (lesson.objective === "draw") {
        setOutcome("achieved");
        onComplete(lesson.id, history.length + 1);
      } else {
        setOutcome("stalemate");
      }
      return;
    }
  }

  const onUserMove = (from: string, to: string, promotion?: string) => {
    if (outcome !== "playing") return;
    if (chess.turn() !== userSideShort) return;
    try {
      const m = chess.move({ from, to, promotion });
      if (!m) return;
      setLastMove([m.from, m.to]);
      setFen(chess.fen());
      setHistory((h) => [...h, m.san]);
      setHint(null);
      setShowHint(false);
      checkAchievement();
    } catch {
      /* illegal */
    }
  };

  const requestHint = async () => {
    setShowHint(true);
    try {
      const r = await api<{ bestMove: string | null }>("/api/position/evaluate", {
        method: "POST",
        body: JSON.stringify({ fen, depth: 14 }),
      });
      if (r.bestMove && r.bestMove.length >= 4) {
        setHint({ from: r.bestMove.slice(0, 2), to: r.bestMove.slice(2, 4) });
      }
    } catch {
      /* ignore */
    }
  };

  const arrows =
    showHint && hint
      ? [{ orig: hint.from, dest: hint.to, brush: "blue" as const }]
      : [];

  const objectiveText =
    lesson.objective === "draw"
      ? "Draw the position."
      : lesson.objective === "checkmate"
        ? "Checkmate the lone king."
        : "Win the position.";

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="space-y-3">
        <div className="max-w-[640px] mx-auto lg:mx-0">
          <Chessboard
            fen={fen}
            orientation={userColor}
            interactive={outcome === "playing"}
            movableColor={userColor}
            lastMove={lastMove}
            arrows={arrows}
            onMove={onUserMove}
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={reset}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reset
            </Button>
            {outcome === "playing" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (showHint ? setShowHint(false) : requestHint())}
              >
                {showHint ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide hint
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Show hint
                  </>
                )}
              </Button>
            )}
            {outcome === "playing" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOutcome(lesson.objective === "draw" ? "failed" : "failed")}
              >
                <Flag className="w-3.5 h-3.5 mr-1.5" /> Resign
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {thinking ? "Engine thinking…" : ""}
            </span>
          </div>
        </div>

        <OutcomeBanner
          outcome={outcome}
          objective={lesson.objective}
          plies={history.length}
        />

        {err && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {err}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> Objective
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <p>{objectiveText}</p>
            <p className="text-xs text-muted-foreground">
              Engine level: <span className="font-mono">{engineLevel}/8</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Move log</CardTitle>
          </CardHeader>
          <CardContent className="p-3 max-h-[280px] overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Waiting for moves…
              </p>
            ) : (
              <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-xs font-mono tabular-nums">
                {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => {
                  const w = history[i * 2];
                  const b = history[i * 2 + 1];
                  return (
                    <React.Fragment key={i}>
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{w}</span>
                      <span>{b}</span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OutcomeBanner({
  outcome,
  objective,
  plies,
}: {
  outcome:
    | "playing"
    | "achieved"
    | "failed"
    | "stalemate"
    | "checkmate-against-us";
  objective: "win" | "draw" | "checkmate";
  plies: number;
}) {
  if (outcome === "playing") return null;
  if (outcome === "achieved") {
    return (
      <Banner tone="emerald" icon={CheckCircle2}>
        <div>
          <span className="font-semibold">Objective achieved.</span> Solved in{" "}
          {plies} ply.
        </div>
      </Banner>
    );
  }
  if (outcome === "checkmate-against-us") {
    return (
      <Banner tone="red" icon={XCircle}>
        <div>
          <span className="font-semibold">Checkmate against you.</span> The
          engine found a winning attack — try again.
        </div>
      </Banner>
    );
  }
  if (outcome === "stalemate") {
    return (
      <Banner tone="amber" icon={XCircle}>
        <div>
          <span className="font-semibold">Stalemate / draw.</span> You were
          trying to {objective === "win" ? "win" : "checkmate"} — half a point
          isn't enough.
        </div>
      </Banner>
    );
  }
  return (
    <Banner tone="red" icon={XCircle}>
      <div>Resigned. Reset to try again.</div>
    </Banner>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "emerald" | "red" | "amber";
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "red"
        ? "border-red-500/40 bg-red-500/10 text-red-200"
        : "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return (
    <div className={cn("rounded-md border p-3 text-sm flex gap-2", cls)}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      {children}
    </div>
  );
}
