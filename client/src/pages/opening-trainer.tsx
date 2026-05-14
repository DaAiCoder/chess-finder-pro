import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chess } from "chess.js";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flame,
  GraduationCap,
  Lightbulb,
  ListChecks,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";

interface CourseLineMove {
  san: string;
  comment?: string;
}
interface CourseLine {
  id: string;
  name: string;
  finalComment?: string;
  moves: CourseLineMove[];
}
interface OpeningCourse {
  slug: string;
  name: string;
  color: "white" | "black";
  description: string;
  tagline?: string;
  lines: CourseLine[];
}

type Mode = "learn" | "practice" | "drill" | "time-trial";

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "learn", label: "Learn", icon: GraduationCap },
  { id: "practice", label: "Practice", icon: ListChecks },
  { id: "drill", label: "Drill", icon: Flame },
  { id: "time-trial", label: "Time Trial", icon: Clock },
];

const PROGRESS_STORAGE_KEY = "openings-progress-v1";
const RECORDS_STORAGE_KEY = "openings-records-v1";

interface ProgressMap {
  [slug: string]: { mastered: string[] };
}
interface RecordsMap {
  [slug: string]: { drillBest?: number; timeTrialBest?: number };
}

const TIME_TRIAL_SECONDS = 60;
const TIME_TRIAL_BONUS = 3;
const BOT_MOVE_DELAY = 450;
const FEEDBACK_DELAY = 600;

export default function OpeningTrainer() {
  const [, params] = useRoute<{ slug: string }>("/openings/:slug");
  const slug = params?.slug;

  const { data: course, isLoading } = useQuery<OpeningCourse>({
    queryKey: ["openings", "course", slug],
    queryFn: () => api(`/api/openings/courses/${slug}`),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

  if (!slug) return null;
  if (isLoading || !course) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading course…
          </CardContent>
        </Card>
      </div>
    );
  }
  return <Trainer course={course} />;
}

function Trainer({ course }: { course: OpeningCourse }) {
  const [mode, setMode] = React.useState<Mode>("learn");
  const [progress, setProgress] = React.useState<ProgressMap>(() => loadProgress());
  const [records, setRecords] = React.useState<RecordsMap>(() => loadRecords());

  const masteredSet = React.useMemo(
    () => new Set(progress[course.slug]?.mastered ?? []),
    [progress, course.slug],
  );

  const markMastered = React.useCallback(
    (lineId: string) => {
      setProgress((prev) => {
        const cur = prev[course.slug]?.mastered ?? [];
        if (cur.includes(lineId)) return prev;
        const next: ProgressMap = {
          ...prev,
          [course.slug]: { mastered: [...cur, lineId] },
        };
        saveProgress(next);
        return next;
      });
    },
    [course.slug],
  );

  const recordDrill = React.useCallback(
    (streak: number) => {
      setRecords((prev) => {
        const cur = prev[course.slug] ?? {};
        if ((cur.drillBest ?? 0) >= streak) return prev;
        const next = { ...prev, [course.slug]: { ...cur, drillBest: streak } };
        saveRecords(next);
        return next;
      });
    },
    [course.slug],
  );
  const recordTimeTrial = React.useCallback(
    (score: number) => {
      setRecords((prev) => {
        const cur = prev[course.slug] ?? {};
        if ((cur.timeTrialBest ?? 0) >= score) return prev;
        const next = { ...prev, [course.slug]: { ...cur, timeTrialBest: score } };
        saveRecords(next);
        return next;
      });
    },
    [course.slug],
  );

  const courseRecords = records[course.slug] ?? {};

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/openings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All courses
        </Link>
        <h1 className="text-2xl font-bold">{course.name}</h1>
        <Badge variant="outline" className="text-[10px] uppercase">
          {course.color === "white" ? "For White" : "For Black"}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {masteredSet.size}/{course.lines.length} lines mastered
        </span>
      </div>

      {course.tagline && (
        <p className="text-sm italic text-muted-foreground -mt-2">{course.tagline}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                mode === m.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground/80 border-border hover:bg-secondary",
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === "learn" || mode === "practice" ? (
        <LearnPracticeMode
          course={course}
          mode={mode}
          masteredSet={masteredSet}
          onMastered={markMastered}
        />
      ) : mode === "drill" ? (
        <DrillMode
          course={course}
          best={courseRecords.drillBest ?? 0}
          onRecord={recordDrill}
        />
      ) : (
        <TimeTrialMode
          course={course}
          best={courseRecords.timeTrialBest ?? 0}
          onRecord={recordTimeTrial}
        />
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Learn / Practice mode                                                  */
/* ====================================================================== */

function LearnPracticeMode({
  course,
  mode,
  masteredSet,
  onMastered,
}: {
  course: OpeningCourse;
  mode: "learn" | "practice";
  masteredSet: Set<string>;
  onMastered: (lineId: string) => void;
}) {
  const [lineIdx, setLineIdx] = React.useState(0);
  const line = course.lines[lineIdx];
  const userOffset = course.color === "white" ? 0 : 1;
  const orientation = course.color;

  const [chess] = React.useState(() => new Chess());
  const [moveIdx, setMoveIdx] = React.useState(0);
  const [fen, setFen] = React.useState(chess.fen());
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();
  const [feedback, setFeedback] = React.useState<
    | { kind: "info"; text: string }
    | { kind: "correct"; text?: string }
    | { kind: "wrong"; text?: string }
    | { kind: "done"; text?: string }
    | null
  >(null);
  const [attempts, setAttempts] = React.useState(0);
  const [showHintToggle, setShowHintToggle] = React.useState(true);
  const [done, setDone] = React.useState(false);

  const resetLine = React.useCallback(
    (idx: number) => {
      const c = new Chess();
      chess.reset();
      setMoveIdx(0);
      setFen(c.fen());
      setLastMove(undefined);
      setFeedback(null);
      setAttempts(0);
      setDone(false);
      setLineIdx(idx);
    },
    [chess],
  );

  React.useEffect(() => {
    resetLine(lineIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdx, course.slug]);

  // Auto-play opponent moves.
  React.useEffect(() => {
    if (done || moveIdx >= line.moves.length) return;
    const isUserTurn = moveIdx % 2 === userOffset;
    if (!isUserTurn) {
      const move = line.moves[moveIdx];
      const t = setTimeout(() => {
        const result = chess.move(move.san);
        if (!result) return;
        setLastMove([result.from, result.to]);
        setFen(chess.fen());
        setMoveIdx((i) => i + 1);
        if (move.comment) setFeedback({ kind: "info", text: move.comment });
      }, BOT_MOVE_DELAY);
      return () => clearTimeout(t);
    }
    return;
  }, [moveIdx, line, userOffset, chess, done]);

  // When line completes:
  React.useEffect(() => {
    if (moveIdx >= line.moves.length && !done) {
      setDone(true);
      setFeedback({
        kind: "done",
        text: line.finalComment ?? "Line complete. Well done.",
      });
      onMastered(line.id);
    }
  }, [moveIdx, line, done, onMastered]);

  const expected = !done ? line.moves[moveIdx] : null;
  const isUserTurn = !done && expected != null && moveIdx % 2 === userOffset;

  const onUserMove = (from: string, to: string, promotion?: string) => {
    if (!isUserTurn || !expected) return;
    // Try to make the move on a probe board to convert to SAN.
    const probe = new Chess(fen);
    const made = probe.move({ from, to, promotion });
    if (!made) return;
    if (made.san === expected.san) {
      const real = chess.move({ from, to, promotion });
      if (!real) return;
      setLastMove([real.from, real.to]);
      setFen(chess.fen());
      setMoveIdx((i) => i + 1);
      setAttempts(0);
      setFeedback({
        kind: "correct",
        text: expected.comment ?? "Correct.",
      });
    } else {
      setAttempts((a) => a + 1);
      setFeedback({
        kind: "wrong",
        text:
          mode === "learn"
            ? `Not the move. Expected ${expected.san}.`
            : "Not the move. Try again.",
      });
    }
  };

  // Hint: show the source/dest of the expected move as an arrow.
  const hintMove = React.useMemo(() => {
    if (!isUserTurn || !expected) return null;
    if (mode === "learn" && !showHintToggle) return null;
    if (mode === "practice" && attempts < 2) return null;
    try {
      const probe = new Chess(fen);
      const m = probe.move(expected.san);
      if (!m) return null;
      return { from: m.from, to: m.to };
    } catch {
      return null;
    }
  }, [isUserTurn, expected, fen, mode, attempts, showHintToggle]);

  const arrows =
    hintMove != null
      ? [{ orig: hintMove.from, dest: hintMove.to, brush: "blue" as const }]
      : [];

  const goNextLine = () => {
    const next = (lineIdx + 1) % course.lines.length;
    resetLine(next);
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="space-y-3">
        <div className="max-w-[640px] mx-auto lg:mx-0">
          <Chessboard
            fen={fen}
            orientation={orientation}
            interactive
            movableColor={course.color}
            lastMove={lastMove}
            arrows={arrows}
            onMove={onUserMove}
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => resetLine(lineIdx)}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Restart line
            </Button>
            {mode === "learn" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHintToggle((v) => !v)}
              >
                {showHintToggle ? (
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
            {done && (
              <Button size="sm" onClick={goNextLine} className="ml-auto">
                Next line →
              </Button>
            )}
          </div>
        </div>

        <CommentaryBox
          feedback={feedback}
          isUserTurn={isUserTurn}
          expectedHint={
            mode === "learn" && showHintToggle && expected
              ? `Your move: think about ${expected.san}.`
              : null
          }
          done={done}
        />
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Lines ({course.lines.length})</span>
              <Badge variant="outline" className="text-[10px]">
                {masteredSet.size} mastered
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {course.lines.map((l, i) => {
                const isCur = i === lineIdx;
                const isDone = masteredSet.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => resetLine(i)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded text-xs flex items-center gap-2 transition-colors",
                        isCur ? "bg-primary/15 text-foreground" : "hover:bg-secondary text-foreground/80",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 inline-block rounded-full border border-border shrink-0" />
                      )}
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {l.moves.length} ply
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <MoveHistory line={line} moveIdx={moveIdx} />
      </div>
    </div>
  );
}

function CommentaryBox({
  feedback,
  isUserTurn,
  expectedHint,
  done,
}: {
  feedback:
    | { kind: "info"; text: string }
    | { kind: "correct"; text?: string }
    | { kind: "wrong"; text?: string }
    | { kind: "done"; text?: string }
    | null;
  isUserTurn: boolean;
  expectedHint: string | null;
  done: boolean;
}) {
  const tone =
    feedback?.kind === "wrong"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : feedback?.kind === "correct"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : feedback?.kind === "done"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
          : "border-border bg-card text-foreground/90";

  const Icon =
    feedback?.kind === "wrong"
      ? XCircle
      : feedback?.kind === "correct"
        ? CheckCircle2
        : feedback?.kind === "done"
          ? CheckCircle2
          : Lightbulb;

  const text =
    feedback?.text ??
    (done
      ? "Line complete!"
      : isUserTurn
        ? expectedHint ?? "Your move."
        : "Watching opponent move…");

  return (
    <div className={cn("rounded-md border p-3 text-sm flex gap-2", tone)}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{text}</div>
    </div>
  );
}

function MoveHistory({ line, moveIdx }: { line: CourseLine; moveIdx: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Moves</CardTitle>
      </CardHeader>
      <CardContent className="p-3 max-h-[200px] overflow-y-auto">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-xs font-mono tabular-nums">
          {Array.from({ length: Math.ceil(line.moves.length / 2) }).map((_, i) => {
            const wIdx = i * 2;
            const bIdx = wIdx + 1;
            const w = line.moves[wIdx];
            const b = line.moves[bIdx];
            return (
              <React.Fragment key={i}>
                <span className="text-muted-foreground">{i + 1}.</span>
                <span
                  className={cn(
                    "px-1 rounded",
                    moveIdx > wIdx ? "text-foreground" : "text-muted-foreground/60",
                    moveIdx - 1 === wIdx && "bg-primary/20 font-semibold",
                  )}
                >
                  {w?.san ?? ""}
                </span>
                <span
                  className={cn(
                    "px-1 rounded",
                    moveIdx > bIdx ? "text-foreground" : "text-muted-foreground/60",
                    moveIdx - 1 === bIdx && "bg-primary/20 font-semibold",
                  )}
                >
                  {b?.san ?? ""}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ====================================================================== */
/*  Drill mode                                                             */
/* ====================================================================== */

function DrillMode({
  course,
  best,
  onRecord,
}: {
  course: OpeningCourse;
  best: number;
  onRecord: (streak: number) => void;
}) {
  const userOffset = course.color === "white" ? 0 : 1;
  const orientation = course.color;
  const [chess] = React.useState(() => new Chess());
  const [lineIdx, setLineIdx] = React.useState(0);
  const [moveIdx, setMoveIdx] = React.useState(0);
  const [fen, setFen] = React.useState(chess.fen());
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();
  const [streak, setStreak] = React.useState(0);
  const [errors, setErrors] = React.useState(0);
  const [flash, setFlash] = React.useState<"correct" | "wrong" | null>(null);

  const line = course.lines[lineIdx];

  const newLine = React.useCallback(
    (idx: number) => {
      chess.reset();
      setMoveIdx(0);
      setFen(chess.fen());
      setLastMove(undefined);
      setLineIdx(idx);
    },
    [chess],
  );

  // Auto-play opponent moves
  React.useEffect(() => {
    if (moveIdx >= line.moves.length) {
      // Line complete — go to next line.
      const t = setTimeout(() => newLine((lineIdx + 1) % course.lines.length), 200);
      return () => clearTimeout(t);
    }
    const isUserTurn = moveIdx % 2 === userOffset;
    if (!isUserTurn) {
      const t = setTimeout(() => {
        const m = chess.move(line.moves[moveIdx].san);
        if (!m) return;
        setLastMove([m.from, m.to]);
        setFen(chess.fen());
        setMoveIdx((i) => i + 1);
      }, 250);
      return () => clearTimeout(t);
    }
    return;
  }, [moveIdx, line, lineIdx, course.lines, userOffset, chess, newLine]);

  React.useEffect(() => {
    onRecord(streak);
  }, [streak, onRecord]);

  const onUserMove = (from: string, to: string, promotion?: string) => {
    if (moveIdx >= line.moves.length) return;
    if (moveIdx % 2 !== userOffset) return;
    const expected = line.moves[moveIdx];
    const probe = new Chess(fen);
    const made = probe.move({ from, to, promotion });
    if (!made) return;
    if (made.san === expected.san) {
      const real = chess.move({ from, to, promotion });
      if (!real) return;
      setLastMove([real.from, real.to]);
      setFen(chess.fen());
      setMoveIdx((i) => i + 1);
      setStreak((s) => s + 1);
      setFlash("correct");
      setTimeout(() => setFlash(null), 250);
    } else {
      setStreak(0);
      setErrors((e) => e + 1);
      setFlash("wrong");
      setTimeout(() => {
        setFlash(null);
        // Skip to next line on error.
        newLine((lineIdx + 1) % course.lines.length);
      }, FEEDBACK_DELAY);
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="max-w-[640px] mx-auto lg:mx-0 space-y-3">
        <div
          className={cn(
            "rounded-md p-1 transition-colors",
            flash === "correct" && "bg-emerald-500/20",
            flash === "wrong" && "bg-red-500/20",
          )}
        >
          <Chessboard
            fen={fen}
            orientation={orientation}
            interactive
            movableColor={course.color}
            lastMove={lastMove}
            onMove={onUserMove}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Drill mode: keep playing the right move. One mistake resets your streak and skips you to the next line.
        </div>
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-500" /> Drill
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Stat label="Streak" value={streak} accent="text-emerald-400" big />
            <Stat label="Errors" value={errors} accent="text-red-400" />
            <Stat label="Best (this device)" value={best} accent="text-amber-400" />
            <Stat label="Current line" value={line.name} small />
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setStreak(0); setErrors(0); newLine(0); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Restart drill
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Time Trial mode                                                        */
/* ====================================================================== */

function TimeTrialMode({
  course,
  best,
  onRecord,
}: {
  course: OpeningCourse;
  best: number;
  onRecord: (score: number) => void;
}) {
  const userOffset = course.color === "white" ? 0 : 1;
  const orientation = course.color;
  const [chess] = React.useState(() => new Chess());
  const [lineIdx, setLineIdx] = React.useState(0);
  const [moveIdx, setMoveIdx] = React.useState(0);
  const [fen, setFen] = React.useState(chess.fen());
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();
  const [score, setScore] = React.useState(0);
  const [seconds, setSeconds] = React.useState(TIME_TRIAL_SECONDS);
  const [running, setRunning] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [flash, setFlash] = React.useState<"correct" | "wrong" | null>(null);

  const line = course.lines[lineIdx];

  const newLine = React.useCallback(
    (idx: number) => {
      chess.reset();
      setMoveIdx(0);
      setFen(chess.fen());
      setLastMove(undefined);
      setLineIdx(idx);
    },
    [chess],
  );

  const start = () => {
    setScore(0);
    setSeconds(TIME_TRIAL_SECONDS);
    setOver(false);
    setRunning(true);
    newLine(0);
  };

  // Tick the clock.
  React.useEffect(() => {
    if (!running) return;
    if (seconds <= 0) {
      setRunning(false);
      setOver(true);
      onRecord(score);
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, seconds, score, onRecord]);

  // Opponent moves auto-play.
  React.useEffect(() => {
    if (!running) return;
    if (moveIdx >= line.moves.length) {
      const t = setTimeout(() => newLine((lineIdx + 1) % course.lines.length), 150);
      return () => clearTimeout(t);
    }
    const isUserTurn = moveIdx % 2 === userOffset;
    if (!isUserTurn) {
      const t = setTimeout(() => {
        const m = chess.move(line.moves[moveIdx].san);
        if (!m) return;
        setLastMove([m.from, m.to]);
        setFen(chess.fen());
        setMoveIdx((i) => i + 1);
      }, 200);
      return () => clearTimeout(t);
    }
    return;
  }, [moveIdx, line, lineIdx, course.lines, userOffset, chess, running, newLine]);

  const onUserMove = (from: string, to: string, promotion?: string) => {
    if (!running || moveIdx >= line.moves.length) return;
    if (moveIdx % 2 !== userOffset) return;
    const expected = line.moves[moveIdx];
    const probe = new Chess(fen);
    const made = probe.move({ from, to, promotion });
    if (!made) return;
    if (made.san === expected.san) {
      const real = chess.move({ from, to, promotion });
      if (!real) return;
      setLastMove([real.from, real.to]);
      setFen(chess.fen());
      setMoveIdx((i) => i + 1);
      setScore((s) => s + 1);
      setSeconds((sec) => Math.min(TIME_TRIAL_SECONDS + 30, sec + TIME_TRIAL_BONUS));
      setFlash("correct");
      setTimeout(() => setFlash(null), 200);
    } else {
      setFlash("wrong");
      setSeconds((sec) => Math.max(0, sec - 2));
      setTimeout(() => {
        setFlash(null);
        newLine((lineIdx + 1) % course.lines.length);
      }, FEEDBACK_DELAY);
    }
  };

  const pct = (seconds / TIME_TRIAL_SECONDS) * 100;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="max-w-[640px] mx-auto lg:mx-0 space-y-3">
        <div
          className={cn(
            "rounded-md p-1 transition-colors",
            flash === "correct" && "bg-emerald-500/20",
            flash === "wrong" && "bg-red-500/20",
          )}
        >
          <Chessboard
            fen={fen}
            orientation={orientation}
            interactive={running}
            movableColor={course.color}
            lastMove={lastMove}
            onMove={onUserMove}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Time Trial: as many correct moves as possible in 60s. Each correct move adds {TIME_TRIAL_BONUS}s; mistakes lose 2s.
        </div>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" /> Time Trial
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Time</span>
                <span className="font-mono font-bold text-lg tabular-nums">
                  {Math.max(0, seconds)}s
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    backgroundColor: pct < 25 ? "#ef4444" : "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>
            <Stat label="Score" value={score} accent="text-emerald-400" big />
            <Stat label="Best (this device)" value={best} accent="text-amber-400" />
            {!running && !over && (
              <Button className="w-full" onClick={start}>
                <Zap className="w-4 h-4 mr-2" /> Start
              </Button>
            )}
            {over && (
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-card p-3 text-sm">
                  Time! You scored <span className="font-bold">{score}</span>.
                  {score > best && (
                    <span className="text-emerald-400"> New record!</span>
                  )}
                </div>
                <Button className="w-full" onClick={start}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Play again
                </Button>
              </div>
            )}
            {running && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setRunning(false); setOver(true); onRecord(score); }}>
                Stop
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  big = false,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  big?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums font-semibold",
          big ? "text-2xl" : small ? "text-xs" : "text-base",
          accent,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------- localStorage helpers ----------------------- */

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}
function saveProgress(p: ProgressMap) {
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
function loadRecords(): RecordsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecordsMap) : {};
  } catch {
    return {};
  }
}
function saveRecords(r: RecordsMap) {
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
