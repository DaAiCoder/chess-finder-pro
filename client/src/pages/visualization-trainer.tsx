import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chessboard } from "@/components/chess/Chessboard";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { api } from "@/lib/queryClient";
import {
  Brain,
  CheckCircle2,
  Eraser,
  Eye,
  EyeOff,
  Flame,
  Hourglass,
  RefreshCw,
  SkipForward,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { Chess } from "chess.js";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import type { TrainingProblem } from "@shared/schema";

export default function VisualizationTrainer() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Visualization</h1>
        <p className="text-muted-foreground text-sm">Calculate, memorise, and recognise squares without help.</p>
      </div>
      <Tabs defaultValue="standard">
        <TabsList>
          <TabsTrigger value="standard">Standard</TabsTrigger>
          <TabsTrigger value="blind">Blind Tactics</TabsTrigger>
          <TabsTrigger value="blindfold">Blindfold 2.0</TabsTrigger>
          <TabsTrigger value="remember">Remember Position</TabsTrigger>
          <TabsTrigger value="vision">Board Vision</TabsTrigger>
        </TabsList>
        <TabsContent value="standard"><StandardMode /></TabsContent>
        <TabsContent value="blind"><BlindMode /></TabsContent>
        <TabsContent value="blindfold"><BlindfoldMode /></TabsContent>
        <TabsContent value="remember"><RememberMode /></TabsContent>
        <TabsContent value="vision"><VisionMode /></TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Phase 3.4 Blindfold mode: no board, only a starting FEN + a list of
 * SAN moves. The user mentally plays them and answers a multiple-
 * choice question about the resulting position.
 */
function BlindfoldMode() {
  const [moveCount, setMoveCount] = React.useState(4);
  const q = useQuery<{
    startFen: string;
    moves: string[];
    question: {
      type: string;
      prompt: string;
      options: string[];
      answer: string;
    };
  }>({
    queryKey: ["blindfold", moveCount],
    queryFn: () => api(`/api/training/visualization/blindfold?moves=${moveCount}`),
  });

  const [answer, setAnswer] = React.useState<string | null>(null);
  const [solved, setSolved] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setAnswer(null);
    setSolved(null);
  }, [q.data?.startFen, q.data?.moves]);

  if (q.isLoading || !q.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  function pick(o: string) {
    if (answer !== null || !q.data) return;
    setAnswer(o);
    setSolved(o === q.data.question.answer);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <EyeOff className="w-4 h-4" /> Blindfold Visualization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          No board. Play the moves in your head from the starting FEN.
        </div>
        <div className="rounded border bg-card p-3 font-mono text-xs break-all">
          {q.data.startFen}
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Moves</div>
          <div className="font-mono text-base">
            {q.data.moves.map((san, i) => (
              <span key={i} className="mr-2">
                {i % 2 === 0 ? <span className="text-muted-foreground">{Math.floor(i / 2) + 1}.</span> : ""} {san}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-2">{q.data.question.prompt}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {q.data.question.options.map((o) => (
              <Button
                key={o}
                size="sm"
                variant={answer === o ? (o === q.data!.question.answer ? "default" : "destructive") : "outline"}
                onClick={() => pick(o)}
                disabled={answer !== null}
              >
                {o}
              </Button>
            ))}
          </div>
          {solved === true && (
            <div className="mt-2 text-emerald-600 text-sm flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Correct.
            </div>
          )}
          {solved === false && (
            <div className="mt-2 text-rose-600 text-sm">
              Wrong — the answer was {q.data.question.answer}.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMoveCount((n) => Math.max(2, n - 1))}>
            Easier ({Math.max(2, moveCount - 1)} moves)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMoveCount((n) => Math.min(8, n + 1))}>
            Harder ({Math.min(8, moveCount + 1)} moves)
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => q.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StandardMode() {
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "tactics-for-vis"],
    queryFn: () => api("/api/training/problems?module=tactics"),
  });
  return all.data ? (
    <PuzzlePlayer problems={all.data.slice(0, 30)} deckPersistenceKey="visualization:sample" />
  ) : null;
}

/* ====================================================================== */
/*  Blind Tactics — Listudy-style                                          */
/*                                                                          */
/*  The board is FROZEN at `startFen`. The user is told which plies have   */
/*  been played since (move list). They have to imagine the resulting      */
/*  position in their head and play the solving move there.                */
/*                                                                          */
/*  Crucially, clicks on the frozen board resolve against the *imagined*   */
/*  position (chess.js instance fed the played moves), not the displayed   */
/*  one. That means a square that visually looks empty (because a piece    */
/*  moved away in the played sequence) can still be a destination, and a   */
/*  square that visually has a piece (that has since left) cannot be a     */
/*  legal selection. The user must keep the imagined state in their head.  */
/* ====================================================================== */

interface BlindTactic {
  id: string;
  startFen: string;
  playedMoves: string[];
  solution: string;
  theme: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  sideToMove: "white" | "black";
}

type BlindStatus = "solving" | "wrong" | "solved" | "revealed";

function BlindMode() {
  const q = useQuery<BlindTactic[]>({
    queryKey: ["blind-tactics"],
    queryFn: () => api("/api/training/visualization/blind-tactics"),
  });
  const all = q.data ?? [];

  const [maxDifficulty, setMaxDifficulty] = React.useState<1 | 2 | 3 | 4 | 5>(5);
  const [orientation, setOrientation] = React.useState<"white" | "black">("white");
  const filtered = React.useMemo(
    () => all.filter((t) => t.difficulty <= maxDifficulty),
    [all, maxDifficulty],
  );

  const [seed, setSeed] = React.useState(0);
  const tactic = React.useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered[seed % filtered.length];
  }, [filtered, seed]);

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  if (!tactic) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">No blind tactics available.</CardContent>
      </Card>
    );
  }

  return (
    // `key={tactic.id}` guarantees that every per-puzzle state inside
    // BlindPuzzlePlay is torn down and re-created on Next. Without the key,
    // a stale `status="solved"` would flash the new puzzle's solution
    // position for one frame before the effect reset it — that was the
    // "blink" the page used to do on every Next click.
    <BlindPuzzlePlay
      key={tactic.id}
      tactic={tactic}
      onNext={() => setSeed((s) => s + 1)}
      filtered={filtered}
      maxDifficulty={maxDifficulty}
      onChangeMaxDifficulty={(d) => {
        setMaxDifficulty(d);
        setSeed(0);
      }}
    />
  );
}

function BlindPuzzlePlay({
  tactic,
  onNext,
  filtered,
  maxDifficulty,
  onChangeMaxDifficulty,
}: {
  tactic: BlindTactic;
  onNext: () => void;
  filtered: BlindTactic[];
  maxDifficulty: 1 | 2 | 3 | 4 | 5;
  onChangeMaxDifficulty: (d: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [orientation, setOrientation] = React.useState<"white" | "black">(tactic.sideToMove);
  const [status, setStatus] = React.useState<BlindStatus>("solving");
  const [lastTry, setLastTry] = React.useState<string | null>(null);
  // Peek mode swaps the displayed board between the FROZEN past position
  // and the IMAGINED current position. It's an escape hatch for when the
  // user gets lost — toggling on shows them the same position chessground
  // would show in a normal tactics trainer.
  const [peek, setPeek] = React.useState(false);

  // Compute the *imagined* FEN — applied internally so we can validate
  // clicks. The user must keep this in their head; we never display it
  // unless they've solved the puzzle (or hit Give up).
  const imaginedFen = React.useMemo(() => {
    try {
      const ch = new Chess(tactic.startFen);
      for (const san of tactic.playedMoves) ch.move(san);
      return ch.fen();
    } catch {
      return null;
    }
  }, [tactic]);

  // For the reveal phase we also need the FEN *after* the solving move.
  const finalFen = React.useMemo(() => {
    if (!imaginedFen) return null;
    try {
      const ch = new Chess(imaginedFen);
      ch.move(tactic.solution);
      return ch.fen();
    } catch {
      return null;
    }
  }, [tactic, imaginedFen]);

  // Highlight the solving move once the puzzle is over.
  const lastMove: [string, string] | undefined = React.useMemo(() => {
    if (status !== "solved" && status !== "revealed") return undefined;
    if (!imaginedFen) return undefined;
    try {
      const ch = new Chess(imaginedFen);
      const mv = ch.move(tactic.solution);
      return mv ? [mv.from, mv.to] : undefined;
    } catch {
      return undefined;
    }
  }, [status, imaginedFen, tactic.solution]);

  if (!imaginedFen) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">Bad puzzle data — skipping.</CardContent>
      </Card>
    );
  }

  function handleMove(san: string) {
    if (status !== "solving" && status !== "wrong") return;
    if (san === tactic.solution) {
      setStatus("solved");
      setLastTry(san);
      toast({ title: "Solved", description: `${san} is correct.`, variant: "success" });
    } else {
      setStatus("wrong");
      setLastTry(san);
      toast({
        title: "Not the move",
        description: `${san} doesn't solve it — keep visualising.`,
        variant: "destructive",
      });
    }
  }

  // What's shown on the board:
  //   solving / wrong → frozen position
  //   solved          → final position (after the user's correct move)
  //   revealed        → imagined position (so they can replay the answer)
  const boardFen =
    status === "solved" && finalFen
      ? finalFen
      : status === "revealed"
      ? imaginedFen
      : tactic.startFen;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <div className="max-w-[640px] space-y-2">
        {status === "solving" || status === "wrong" ? (
          <BlindTacticsBoard
            displayFen={peek ? imaginedFen : tactic.startFen}
            frozenFen={tactic.startFen}
            imaginedFen={imaginedFen}
            orientation={orientation}
            onSolveSan={handleMove}
          />
        ) : (
          <div className="max-w-[640px]">
            <Chessboard fen={boardFen} orientation={orientation} lastMove={lastMove} />
          </div>
        )}
        {(status === "solving" || status === "wrong") && (
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            {peek ? (
              <>
                <span className="text-amber-300 font-semibold">Peek mode</span>: showing the imagined current position. Toggle it off to train your visualisation.
              </>
            ) : (
              <>
                The board shows the position <em>before</em> the played moves. Click the square where you imagine the piece <em>now</em> — e.g. after <span className="font-mono">Qh5</span>, the queen lives on <span className="font-mono">h5</span>, not <span className="font-mono">d1</span>.
              </>
            )}
          </p>
        )}
        {status !== "solving" && status !== "wrong" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Final position after the solution.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <EyeOff className="w-4 h-4" /> Blind Tactics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              In this position, the following moves were played. Visualise them in your head, then play the solving move.
            </p>
            <div className="rounded border bg-card/50 p-2 font-mono text-sm leading-relaxed">
              <BlindMoveList moves={tactic.playedMoves} sideToMove={tactic.sideToMove} />
              {status === "solved" && (
                <span className="ml-1 text-emerald-400 font-semibold">
                  {formatNextMoveNumber(tactic.playedMoves)} {tactic.solution}
                </span>
              )}
              {status === "revealed" && (
                <span className="ml-1 text-amber-300 font-semibold">
                  {formatNextMoveNumber(tactic.playedMoves)} {tactic.solution}
                </span>
              )}
            </div>
            <div className="text-xs">
              <span className="font-semibold capitalize">{tactic.sideToMove}</span> to play and win.
            </div>

            {(status === "solving" || status === "wrong") && (
              <div className="space-y-2">
                <Button
                  variant={peek ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setPeek((p) => !p)}
                >
                  {peek ? (
                    <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide current position</>
                  ) : (
                    <><Eye className="w-3.5 h-3.5 mr-1.5" /> Peek current position</>
                  )}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Flip board
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStatus("revealed")}>
                    Give up
                  </Button>
                </div>
              </div>
            )}
            {status === "wrong" && lastTry && (
              <p className="text-xs text-rose-400">
                <span className="font-mono">{lastTry}</span> isn't the move — try again.
              </p>
            )}
            {(status === "solved" || status === "revealed") && (
              <div className="space-y-2">
                <div className={cn(
                  "rounded border p-2 text-xs",
                  status === "solved"
                    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                    : "border-amber-500/40 bg-amber-500/5 text-amber-200",
                )}>
                  {status === "solved" ? (
                    <>
                      <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />
                      Nailed it. The answer was <span className="font-mono">{tactic.solution}</span>.
                    </>
                  ) : (
                    <>
                      The solution was <span className="font-mono">{tactic.solution}</span>. Replay it on the board and try the next one.
                    </>
                  )}
                </div>
                <Button onClick={onNext} className="w-full">
                  <SkipForward className="w-4 h-4 mr-2" /> Next tactic
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Max difficulty</p>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => onChangeMaxDifficulty(d as 1 | 2 | 3 | 4 | 5)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-semibold",
                      maxDifficulty === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    ≤{d}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Tier {tactic.difficulty} · {tactic.theme}. {filtered.length} puzzles in this tier.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              {tactic.description}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Renders the played-moves list as "1. e4 e5 2. Nf3" etc. */
function BlindMoveList({ moves, sideToMove }: { moves: string[]; sideToMove: "white" | "black" }) {
  // The frozen position's side-to-move is the player of moves[0]. Figure
  // out whether the SEQUENCE starts with a white or a black move.
  const startsWithWhite = (() => {
    // After playing `moves`, side-to-move is `sideToMove`. So before
    // playing the LAST move, side-to-move was the opposite, ... and so on.
    // Working back: side at start = (sideToMove flipped moves.length times).
    const flipped = moves.length % 2 === 0 ? sideToMove : sideToMove === "white" ? "black" : "white";
    return flipped === "white";
  })();
  // We render in pairs; insert a "..." for a leading black move.
  const out: React.ReactNode[] = [];
  let moveNumber = 1;
  let i = 0;
  if (!startsWithWhite && moves.length > 0) {
    out.push(<span key="dots">{moveNumber}...</span>);
    out.push(<span key="m0" className="ml-1 mr-2">{moves[0]}</span>);
    moveNumber++;
    i = 1;
  }
  while (i < moves.length) {
    out.push(<span key={`n${moveNumber}`} className="text-muted-foreground">{moveNumber}.</span>);
    out.push(<span key={`w${i}`} className="ml-1 mr-1">{moves[i]}</span>);
    if (i + 1 < moves.length) {
      out.push(<span key={`b${i + 1}`} className="mr-2">{moves[i + 1]}</span>);
    }
    moveNumber++;
    i += 2;
  }
  return <>{out}</>;
}

/** Returns the move-number prefix for the next move (e.g. "5." or "5..."). */
function formatNextMoveNumber(moves: string[]): string {
  // Number of completed full moves so far:
  const fulls = Math.floor(moves.length / 2);
  const isWhiteToMove = moves.length % 2 === 0;
  return isWhiteToMove ? `${fulls + 1}.` : `${fulls + 1}...`;
}

/**
 * When the user clicks a square that has a piece in the frozen view but not
 * in the imagined view, try to figure out where that exact piece ended up
 * in the imagined position. Heuristic: same piece letter, same color; if
 * multiple candidates exist (e.g. two knights), prefer the one closest to
 * the clicked square (chess pieces usually move short distances per turn).
 *
 * Returns null when the piece was captured (no matching piece in imagined).
 */
function findPieceInImagined(
  piece: string,
  fromSquare: string,
  frozen: Map<string, string>,
  imagined: Map<string, string>,
): string | null {
  // Squares that hold the same piece in the imagined position…
  const candidatesInImagined: string[] = [];
  for (const [sq, p] of imagined) if (p === piece) candidatesInImagined.push(sq);
  if (candidatesInImagined.length === 0) return null;

  // …minus the ones that already had this piece in the frozen position
  // (those didn't move; only the *new* squares are interesting).
  const newSquares = candidatesInImagined.filter((sq) => frozen.get(sq) !== piece);
  const pool = newSquares.length > 0 ? newSquares : candidatesInImagined;

  // Pick the closest square by Chebyshev distance — this is a heuristic;
  // it's right for "the queen moved to h5 from d1" type cases without
  // needing to replay the move history client-side.
  let best: string | null = null;
  let bestDist = Infinity;
  for (const sq of pool) {
    const d = chebyshev(fromSquare, sq);
    if (d < bestDist) {
      bestDist = d;
      best = sq;
    }
  }
  return best;
}

function chebyshev(a: string, b: string): number {
  const dx = Math.abs(a.charCodeAt(0) - b.charCodeAt(0));
  const dy = Math.abs(Number(a[1]) - Number(b[1]));
  return Math.max(dx, dy);
}

function pieceFullName(piece: string): string {
  const color = piece === piece.toUpperCase() ? "white" : "black";
  const kind = piece.toLowerCase();
  const name =
    kind === "k" ? "king" :
    kind === "q" ? "queen" :
    kind === "r" ? "rook" :
    kind === "b" ? "bishop" :
    kind === "n" ? "knight" :
    kind === "p" ? "pawn" : "piece";
  return `${color} ${name}`;
}

/**
 * Click-to-move board for blind tactics. The underlying display is the
 * standard Chessboard (chessground with the regular cream/green theme and
 * the same SVG piece set used everywhere else in the app), rendered with
 * the *frozen* FEN and view-only.
 *
 * On top of that we overlay a transparent 8x8 click grid that resolves
 * clicks against the *imagined* FEN. Selection + legal destinations are
 * drawn as small overlay markers (a yellow ring on the selected square,
 * green dots for legal destinations) so the user gets visual feedback
 * without the underlying board ever updating to reveal the imagined
 * position.
 *
 * Interaction model:
 *   1. User clicks a square (any square, occupied or not visually).
 *   2. If the imagined position has a piece of the side-to-move on that
 *      square, we highlight it and dot all legal destinations.
 *   3. User clicks one of those dots: we play the move on a chess.js
 *      clone of the imagined position, compute the resulting SAN, and
 *      bubble up via `onSolveSan` for the parent to compare against the
 *      target.
 */
function BlindTacticsBoard({
  displayFen,
  frozenFen,
  imaginedFen,
  orientation,
  onSolveSan,
}: {
  /** What chessground renders. Usually the frozen position, but switches to
   *  the imagined position when the user enables Peek mode. */
  displayFen: string;
  /** The original (untouched) starting position — used to detect when the
   *  user clicks a piece that's only on the frozen board, so we can show a
   *  helpful "that piece has moved" toast. */
  frozenFen: string;
  /** Source of truth for legality and SAN computation. */
  imaginedFen: string;
  orientation: "white" | "black";
  onSolveSan: (san: string) => void;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [promotion, setPromotion] = React.useState<{ from: string; to: string } | null>(null);

  // Reset selection when the puzzle changes.
  React.useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [frozenFen, imaginedFen]);

  const frozenPieces = React.useMemo(() => fenToPieceMap(frozenFen), [frozenFen]);
  const imaginedPieces = React.useMemo(() => fenToPieceMap(imaginedFen), [imaginedFen]);

  // Map of from-square -> [{to, promotion}] computed from the imagined
  // position. This is what determines what the user can click.
  const moveMap = React.useMemo(() => {
    const map = new Map<string, { to: string; promotion?: string; san: string }[]>();
    try {
      const ch = new Chess(imaginedFen);
      for (const mv of ch.moves({ verbose: true })) {
        const arr = map.get(mv.from) ?? [];
        arr.push({ to: mv.to, promotion: mv.promotion ?? undefined, san: mv.san });
        map.set(mv.from, arr);
      }
    } catch {
      /* invalid fen — leave map empty */
    }
    return map;
  }, [imaginedFen]);

  const dests = React.useMemo(() => {
    if (!selected) return new Set<string>();
    const moves = moveMap.get(selected) ?? [];
    return new Set(moves.map((m) => m.to));
  }, [selected, moveMap]);

  function attemptMove(from: string, to: string, promotion?: string) {
    try {
      const ch = new Chess(imaginedFen);
      const mv = ch.move({ from, to, promotion: promotion ?? "q" });
      if (!mv) return;
      onSolveSan(mv.san);
      setSelected(null);
    } catch {
      /* swallow — the click was on an illegal destination */
    }
  }

  function handleSquareClick(sq: string) {
    // If we have a current selection AND the clicked square is a legal dest,
    // play the move (handling promotion if needed).
    if (selected && dests.has(sq)) {
      const moves = (moveMap.get(selected) ?? []).filter((m) => m.to === sq);
      const isPromotion = moves.some((m) => !!m.promotion);
      if (isPromotion) {
        setPromotion({ from: selected, to: sq });
        return;
      }
      attemptMove(selected, sq);
      return;
    }
    // Otherwise, set selection if the imagined position has a movable piece
    // here. We don't allow selecting a square that visually shows a piece
    // but is actually empty in the imagined position — that wouldn't be a
    // legal move source.
    if (moveMap.has(sq)) {
      setSelected(sq);
      return;
    }
    setSelected(null);

    // Helpful feedback: if the user clicked a square that has a piece in
    // the FROZEN view but is empty in the IMAGINED view, that piece either
    // moved or got captured during the played sequence. Find out which and
    // tell them — this is the single most common UX trap of blind tactics.
    const frozenPiece = frozenPieces.get(sq);
    if (frozenPiece) {
      const newSquare = findPieceInImagined(frozenPiece, sq, frozenPieces, imaginedPieces);
      if (newSquare) {
        toast({
          title: "That piece has moved",
          description: `In the imagined position the ${pieceFullName(frozenPiece)} is on ${newSquare}, not ${sq}.`,
        });
      } else {
        toast({
          title: "That piece is gone",
          description: `The ${pieceFullName(frozenPiece)} on ${sq} was captured during the played moves.`,
          variant: "destructive",
        });
      }
    }
  }

  return (
    <div className="board-aspect select-none relative">
      {/* Real board underneath: standard pieces, cream + green theme.
          interactive={false} so chessground's own click/drag handling
          stays out of the way — every click is captured by the overlay. */}
      <Chessboard fen={displayFen} orientation={orientation} interactive={false} />

      {/* Transparent click + highlight overlay. */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 pointer-events-none">
        {Array.from({ length: 64 }).map((_, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const file = orientation === "white" ? col : 7 - col;
          const rank = orientation === "white" ? 7 - row : row;
          const sq = String.fromCharCode(97 + file) + (rank + 1);
          const isSelected = selected === sq;
          const isDest = dests.has(sq);
          return (
            <button
              key={`${row}-${col}`}
              onClick={() => handleSquareClick(sq)}
              type="button"
              className="relative pointer-events-auto p-0 border-0 focus:outline-none focus-visible:outline-none"
              style={{
                background: isSelected ? "rgba(253, 224, 71, 0.45)" : "transparent",
                cursor: "pointer",
              }}
              aria-label={sq}
            >
              {isDest && (
                <span
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: "30%",
                    height: "30%",
                    top: "35%",
                    left: "35%",
                    backgroundColor: "rgba(20, 85, 30, 0.55)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {promotion && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <Card>
            <CardContent className="p-3 flex gap-2">
              <span className="text-xs text-muted-foreground self-center mr-1">Promote to:</span>
              {(["q", "r", "b", "n"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const { from, to } = promotion;
                    setPromotion(null);
                    attemptMove(from, to, p);
                  }}
                >
                  {p.toUpperCase()}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Remember Position — full rebuild                                       */
/*                                                                          */
/*  Phases: setup → study (countdown) → recall (place pieces) → reveal     */
/*  Difficulty tiers filter problems by piece count.                       */
/*  Score + streak per difficulty persisted to localStorage.               */
/* ====================================================================== */

type Difficulty = "beginner" | "intermediate" | "advanced";

const PROGRESS_KEY = "visualization-remember-progress-v1";

interface RememberProgress {
  beginner?: { bestScore: number; bestStreak: number; currentStreak: number };
  intermediate?: { bestScore: number; bestStreak: number; currentStreak: number };
  advanced?: { bestScore: number; bestStreak: number; currentStreak: number };
}

const STUDY_TIMES = [3, 5, 10, 15] as const;
type StudyTime = (typeof STUDY_TIMES)[number];

const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; range: [number, number]; defaultStudy: StudyTime; description: string }
> = {
  beginner: { label: "Beginner", range: [2, 8], defaultStudy: 10, description: "2–8 pieces. Endgame fragments." },
  intermediate: { label: "Intermediate", range: [9, 16], defaultStudy: 10, description: "9–16 pieces. Middlegame slices." },
  advanced: { label: "Advanced", range: [17, 32], defaultStudy: 15, description: "17+ pieces. Whole-board recall." },
};

function loadProgress(): RememberProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as RememberProgress) : {};
  } catch {
    return {};
  }
}
function saveProgress(p: RememberProgress) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function RememberMode() {
  // Pull from visualization, tactics, AND endgames pools so each tier has
  // genuine variety. Endgame lessons cover the Beginner range (2-6 pieces);
  // tactics fill Intermediate; full-game positions fill Advanced.
  const visualization = useQuery<TrainingProblem[]>({
    queryKey: ["training", "visualization"],
    queryFn: () => api("/api/training/problems?module=visualization"),
  });
  const tactics = useQuery<TrainingProblem[]>({
    queryKey: ["training", "tactics-for-vis-recall"],
    queryFn: () => api("/api/training/problems?module=tactics"),
  });
  const endgames = useQuery<{ lessons: { id: string; fen: string; name: string }[] }>({
    queryKey: ["endgames", "lessons-for-vis-recall"],
    queryFn: () => api("/api/endgames/lessons"),
  });

  const allProblems = React.useMemo(() => {
    const merged: { fen: string; id: string | number }[] = [];
    if (visualization.data) merged.push(...visualization.data.map((p) => ({ fen: p.fen, id: p.id })));
    if (tactics.data) merged.push(...tactics.data.map((p) => ({ fen: p.fen, id: p.id })));
    if (endgames.data) {
      for (const l of endgames.data.lessons) merged.push({ fen: l.fen, id: `eg-${l.id}` });
    }
    return merged as TrainingProblem[];
  }, [visualization.data, tactics.data, endgames.data]);

  const [difficulty, setDifficulty] = React.useState<Difficulty>("beginner");
  const [studyTime, setStudyTime] = React.useState<StudyTime>(
    DIFFICULTY_META.beginner.defaultStudy,
  );
  const [phase, setPhase] = React.useState<"setup" | "study" | "recall" | "reveal">("setup");
  const [problem, setProblem] = React.useState<TrainingProblem | null>(null);
  const [placed, setPlaced] = React.useState<Map<string, string>>(new Map());
  const [studyRemaining, setStudyRemaining] = React.useState(0);
  const [progress, setProgress] = React.useState<RememberProgress>(() => loadProgress());

  // Pool for the current difficulty. Beginner & Advanced filter the seed pool
  // by piece count. Intermediate is generated on demand by stripping pieces
  // from heavier positions, giving genuine middlegame fragments to memorize.
  const filteredPool = React.useMemo(() => {
    const [lo, hi] = DIFFICULTY_META[difficulty].range;
    if (difficulty === "intermediate") {
      const heavy = allProblems.filter((p) => countPieces(p.fen) >= hi);
      // Map each heavy seed to a stripped variant. Determinism per id keeps
      // the same generated position across re-renders for the same problem.
      return heavy.map((p) => ({
        ...p,
        fen: stripToTarget(p.fen, lo + Math.floor(Math.random() * (hi - lo + 1))),
      }));
    }
    return allProblems.filter((p) => {
      const n = countPieces(p.fen);
      return n >= lo && n <= hi;
    });
  }, [allProblems, difficulty]);

  const actualPieces = React.useMemo(
    () => (problem ? fenToPieceMap(problem.fen) : new Map<string, string>()),
    [problem],
  );

  // Study countdown.
  React.useEffect(() => {
    if (phase !== "study") return;
    if (studyRemaining <= 0) {
      setPhase("recall");
      return;
    }
    const t = setTimeout(() => setStudyRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, studyRemaining]);

  const startRound = React.useCallback(() => {
    if (filteredPool.length === 0) {
      toast({
        title: "No positions available",
        description: `No problems found in the ${DIFFICULTY_META[difficulty].label} range yet.`,
        variant: "destructive",
      });
      return;
    }
    const next = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    setProblem(next);
    setPlaced(new Map());
    setStudyRemaining(studyTime);
    setPhase("study");
  }, [filteredPool, studyTime, difficulty]);

  const submit = React.useCallback(() => {
    if (!problem) return;
    setPhase("reveal");
    const scoring = scorePlacements(actualPieces, placed);
    setProgress((prev) => {
      const cur = prev[difficulty] ?? { bestScore: 0, bestStreak: 0, currentStreak: 0 };
      const passed = scoring.percent >= 80;
      const next: RememberProgress = {
        ...prev,
        [difficulty]: {
          bestScore: Math.max(cur.bestScore, scoring.percent),
          bestStreak: passed ? Math.max(cur.bestStreak, cur.currentStreak + 1) : cur.bestStreak,
          currentStreak: passed ? cur.currentStreak + 1 : 0,
        },
      };
      saveProgress(next);
      return next;
    });
  }, [problem, actualPieces, placed, difficulty]);

  const next = () => startRound();

  // Keyboard shortcuts.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        if (phase === "study") setPhase("recall");
      } else if (e.key === "Enter") {
        if (phase === "recall") submit();
      } else if (e.key === "n" || e.key === "N") {
        if (phase === "reveal" || phase === "setup") startRound();
      } else if (e.key === "Escape") {
        if (phase === "recall") setPlaced(new Map());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, submit, startRound]);

  if (visualization.isLoading || tactics.isLoading || endgames.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <div className="space-y-3">
        <RememberBoard
          phase={phase}
          actualFen={problem?.fen ?? "8/8/8/8/8/8/8/8 w - - 0 1"}
          placed={placed}
          actualPieces={actualPieces}
          onPlace={(sq, piece, from) => {
            setPlaced((prev) => {
              const next = new Map(prev);
              if (from && from !== sq) next.delete(from);
              if (piece === null) next.delete(sq);
              else next.set(sq, piece);
              return next;
            });
          }}
          onRemove={(sq) =>
            setPlaced((prev) => {
              const next = new Map(prev);
              next.delete(sq);
              return next;
            })
          }
        />
        {phase === "study" && (
          <StudyTimerBar total={studyTime} remaining={studyRemaining} />
        )}
        {phase === "recall" && (
          <p className="text-xs text-muted-foreground text-center">
            <span className="text-foreground/80">Drag</span> a piece from the palette onto a square. Drag a placed piece to move it, or off the board to remove it. (Click also works.) <span className="text-foreground/80">Esc</span> clears, <span className="text-foreground/80">Enter</span> submits.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {phase === "setup" && (
          <SetupPanel
            difficulty={difficulty}
            studyTime={studyTime}
            onDifficulty={(d) => {
              setDifficulty(d);
              setStudyTime(DIFFICULTY_META[d].defaultStudy);
            }}
            onStudyTime={setStudyTime}
            onStart={startRound}
            poolSize={filteredPool.length}
            progress={progress}
          />
        )}
        {phase === "study" && (
          <StudyPanel
            difficulty={difficulty}
            timeLeft={studyRemaining}
            total={studyTime}
            onSkip={() => setPhase("recall")}
          />
        )}
        {phase === "recall" && (
          <PalettePanel
            placed={placed}
            actualPieces={actualPieces}
            difficulty={difficulty}
            onSubmit={submit}
            onClear={() => setPlaced(new Map())}
            onCancel={() => {
              setPhase("setup");
              setProblem(null);
              setPlaced(new Map());
            }}
          />
        )}
        {phase === "reveal" && (
          <RevealPanel
            actualPieces={actualPieces}
            placed={placed}
            difficulty={difficulty}
            progress={progress}
            onNext={next}
            onChangeDifficulty={() => {
              setPhase("setup");
              setProblem(null);
              setPlaced(new Map());
            }}
          />
        )}
        <ProgressCard difficulty={difficulty} progress={progress} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Selected-piece context (for the recall palette → board interaction).   */
/* ---------------------------------------------------------------------- */

const SelectedPieceContext = React.createContext<{
  selected: string | null;
  setSelected: (p: string | null) => void;
}>({ selected: null, setSelected: () => {} });

function RememberBoard({
  phase,
  actualFen,
  placed,
  actualPieces,
  onPlace,
  onRemove,
}: {
  phase: "setup" | "study" | "recall" | "reveal";
  actualFen: string;
  placed: Map<string, string>;
  actualPieces: Map<string, string>;
  onPlace: (square: string, piece: string | null, from?: string) => void;
  onRemove: (square: string) => void;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (phase !== "recall") setSelected(null);
  }, [phase]);

  if (phase === "study") {
    return (
      <div className="max-w-[640px]">
        <Chessboard fen={actualFen} />
      </div>
    );
  }
  if (phase === "setup") {
    return (
      <div className="max-w-[640px]">
        <Chessboard fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" />
      </div>
    );
  }

  // Drop outside the board removes the dragged piece (only meaningful for
  // pieces dragged FROM a square; new palette pieces just disappear).
  const handleOuterDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = readDragPayload(e);
    if (data?.from) onRemove(data.from);
  };

  return (
    <SelectedPieceContext.Provider value={{ selected, setSelected }}>
      <div
        className="max-w-[640px]"
        onDragOver={(e) => {
          if (phase === "recall") e.preventDefault();
        }}
        onDrop={phase === "recall" ? handleOuterDrop : undefined}
      >
        <PlacementBoard
          phase={phase}
          placed={placed}
          actualPieces={actualPieces}
          onPlace={onPlace}
        />
      </div>
    </SelectedPieceContext.Provider>
  );
}

/**
 * 8x8 grid that supports BOTH drag-and-drop and click-to-place.
 *
 * Drag sources:
 *   - Palette piece buttons (sets dataTransfer with `{ piece }`)
 *   - Already-placed pieces on a square (sets `{ piece, from }`)
 *
 * Drop targets:
 *   - Each square: places the piece, removing from `from` if specified
 *   - Outside the board (handled by RememberBoard's wrapper): removes the
 *     piece if it came from a square
 *
 * In `reveal` phase, drag is disabled and the board overlays colored rings
 * showing correct (green), wrong (red), and missed (blue) squares.
 */
function PlacementBoard({
  phase,
  placed,
  actualPieces,
  onPlace,
}: {
  phase: "recall" | "reveal";
  placed: Map<string, string>;
  actualPieces: Map<string, string>;
  onPlace: (square: string, piece: string | null, from?: string) => void;
}) {
  const { selected } = React.useContext(SelectedPieceContext);
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  return (
    <div className="board-aspect rounded overflow-hidden select-none">
      <div className="w-full h-full grid grid-cols-8 grid-rows-8 relative">
        {Array.from({ length: 64 }).map((_, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const file = col;
          const rank = 7 - row;
          const sq = String.fromCharCode(97 + file) + (rank + 1);
          const isLight = (file + rank) % 2 === 0;
          const piece = phase === "recall" ? placed.get(sq) : placed.get(sq);

          const correct = actualPieces.get(sq);
          let ringColor: string | null = null;
          if (phase === "reveal") {
            if (placed.get(sq) && correct === placed.get(sq)) ringColor = "#22c55e";
            else if (placed.get(sq) && correct !== placed.get(sq)) ringColor = "#ef4444";
            else if (!placed.get(sq) && correct) ringColor = "#3b82f6";
          }

          const handleClick = () => {
            if (phase !== "recall") return;
            if (selected) {
              onPlace(sq, selected);
            } else if (placed.has(sq)) {
              onPlace(sq, null);
            }
          };
          const handleContextMenu = (e: React.MouseEvent) => {
            if (phase !== "recall") return;
            e.preventDefault();
            if (placed.has(sq)) onPlace(sq, null);
          };

          // ---------- drag & drop ----------
          const handleDragOver = (e: React.DragEvent) => {
            if (phase !== "recall") return;
            e.preventDefault();
            // copy if from palette, move if from another square
            const fromSquare = e.dataTransfer.types.includes("application/x-from-square");
            e.dataTransfer.dropEffect = fromSquare ? "move" : "copy";
            if (dragOver !== sq) setDragOver(sq);
          };
          const handleDragLeave = () => {
            if (dragOver === sq) setDragOver(null);
          };
          const handleDrop = (e: React.DragEvent) => {
            if (phase !== "recall") return;
            e.preventDefault();
            e.stopPropagation();
            setDragOver(null);
            const payload = readDragPayload(e);
            if (!payload) return;
            onPlace(sq, payload.piece, payload.from);
          };

          const handlePieceDragStart = (e: React.DragEvent) => {
            if (phase !== "recall" || !piece) return;
            writeDragPayload(e, piece, sq);
          };

          // In reveal mode, also show what the user placed inside the ring
          // for direct comparison (faded if wrong).
          const showPiece =
            phase === "reveal"
              ? placed.get(sq) ?? correct ?? null
              : piece ?? null;
          const isUserGuess = phase === "reveal" && placed.get(sq);
          const isMissed = phase === "reveal" && !placed.get(sq) && correct;
          const isHighlighted = dragOver === sq;

          return (
            <button
              key={`${row}-${col}`}
              onClick={handleClick}
              onContextMenu={handleContextMenu}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="relative flex items-center justify-center text-2xl sm:text-4xl font-serif transition-colors leading-none"
              style={{
                backgroundColor: isHighlighted
                  ? "#fde047"
                  : isLight
                    ? "#eeeed2"
                    : "#769656",
                cursor:
                  phase === "recall"
                    ? selected
                      ? "copy"
                      : placed.has(sq)
                        ? "grab"
                        : "default"
                    : "default",
              }}
              aria-label={sq}
            >
              {showPiece && (
                <span
                  draggable={phase === "recall" && !!placed.get(sq)}
                  onDragStart={handlePieceDragStart}
                  style={{
                    color: showPiece === showPiece.toUpperCase() ? "#fff" : "#111",
                    textShadow:
                      showPiece === showPiece.toUpperCase()
                        ? "0 0 2px #000"
                        : undefined,
                    opacity: isMissed ? 0.55 : 1,
                    cursor: phase === "recall" && placed.get(sq) ? "grab" : undefined,
                  }}
                >
                  {PIECE_GLYPH[showPiece]}
                </span>
              )}
              {ringColor && (
                <span
                  className="absolute inset-1 rounded-md pointer-events-none"
                  style={{
                    boxShadow: `inset 0 0 0 3px ${ringColor}`,
                    opacity: isUserGuess || isMissed ? 0.95 : 0.8,
                  }}
                />
              )}
              {col === 0 && (
                <span
                  className="absolute top-0.5 left-1 text-[10px] font-semibold pointer-events-none"
                  style={{ color: isLight ? "#769656" : "#eeeed2", opacity: 0.6 }}
                >
                  {rank + 1}
                </span>
              )}
              {row === 7 && (
                <span
                  className="absolute bottom-0.5 right-1 text-[10px] font-semibold pointer-events-none"
                  style={{ color: isLight ? "#769656" : "#eeeed2", opacity: 0.6 }}
                >
                  {String.fromCharCode(97 + file)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Tiny helpers to ferry drag-and-drop payloads through HTML5 dataTransfer.
 * We use a custom MIME so dragOver can inspect whether the source is a
 * palette piece (copy) or an existing board piece (move) before drop. */
function writeDragPayload(e: React.DragEvent, piece: string, from?: string) {
  try {
    e.dataTransfer.effectAllowed = from ? "move" : "copy";
    e.dataTransfer.setData("application/x-piece", piece);
    if (from) e.dataTransfer.setData("application/x-from-square", from);
    e.dataTransfer.setData("text/plain", piece);
  } catch {
    /* some browsers throw when setting MIME at unusual times — ignore */
  }
}

function readDragPayload(
  e: React.DragEvent,
): { piece: string; from?: string } | null {
  const piece = e.dataTransfer.getData("application/x-piece") || e.dataTransfer.getData("text/plain");
  if (!piece) return null;
  const from = e.dataTransfer.getData("application/x-from-square") || undefined;
  return { piece, from };
}

/* ---------------------------------------------------------------------- */
/*  Side panels per phase                                                  */
/* ---------------------------------------------------------------------- */

function SetupPanel({
  difficulty,
  studyTime,
  onDifficulty,
  onStudyTime,
  onStart,
  poolSize,
  progress,
}: {
  difficulty: Difficulty;
  studyTime: StudyTime;
  onDifficulty: (d: Difficulty) => void;
  onStudyTime: (s: StudyTime) => void;
  onStart: () => void;
  poolSize: number;
  progress: RememberProgress;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4" /> Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Difficulty</p>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => {
              const stats = progress[d];
              return (
                <button
                  key={d}
                  onClick={() => onDifficulty(d)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors text-left",
                    difficulty === d
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div>{DIFFICULTY_META[d].label}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {stats?.bestScore ? `Best ${stats.bestScore}%` : "—"}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{DIFFICULTY_META[difficulty].description}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Study time</p>
          <div className="grid grid-cols-4 gap-1">
            {STUDY_TIMES.map((s) => (
              <button
                key={s}
                onClick={() => onStudyTime(s)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-semibold font-mono",
                  studyTime === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40",
                )}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {poolSize > 0 ? `${poolSize} positions in this tier.` : "No positions match this filter — pick another."}
        </div>

        <Button className="w-full" onClick={onStart} disabled={poolSize === 0}>
          <Sparkles className="w-4 h-4 mr-2" /> Start
        </Button>
      </CardContent>
    </Card>
  );
}

function StudyPanel({
  difficulty,
  timeLeft,
  total,
  onSkip,
}: {
  difficulty: Difficulty;
  timeLeft: number;
  total: number;
  onSkip: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-amber-400" /> Study
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Memorize the position. The board will hide automatically.
        </p>
        <div className="text-center text-5xl font-bold font-mono text-amber-400 tabular-nums">
          {timeLeft}
          <span className="text-muted-foreground text-base font-normal"> / {total}s</span>
        </div>
        <div className="text-xs text-center text-muted-foreground capitalize">
          {DIFFICULTY_META[difficulty].label} tier
        </div>
        <Button variant="outline" className="w-full" onClick={onSkip}>
          <EyeOff className="w-4 h-4 mr-2" /> Hide now (Space)
        </Button>
      </CardContent>
    </Card>
  );
}

function PalettePanel({
  placed,
  actualPieces,
  difficulty,
  onSubmit,
  onClear,
  onCancel,
}: {
  placed: Map<string, string>;
  actualPieces: Map<string, string>;
  difficulty: Difficulty;
  onSubmit: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const { selected, setSelected } = React.useContext(SelectedPieceContext);
  const placedCount = placed.size;
  const totalActual = actualPieces.size;

  // Two rows: white pieces top, black pieces bottom.
  const whitePieces = ["K", "Q", "R", "B", "N", "P"];
  const blackPieces = ["k", "q", "r", "b", "n", "p"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" /> Recall
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          You've placed <span className="font-mono font-semibold text-foreground">{placedCount}</span> piece
          {placedCount === 1 ? "" : "s"}. The position has{" "}
          <span className="font-mono font-semibold text-foreground">{totalActual}</span>.
        </div>
        <PaletteRow
          pieces={whitePieces}
          selected={selected}
          onSelect={(p) => setSelected(selected === p ? null : p)}
          label="White"
        />
        <PaletteRow
          pieces={blackPieces}
          selected={selected}
          onSelect={(p) => setSelected(selected === p ? null : p)}
          label="Black"
        />
        {selected ? (
          <div className="text-xs text-center text-amber-300">
            Selected: <span className="font-mono">{PIECE_GLYPH[selected]}</span> — click a square, or just drag a piece directly.
          </div>
        ) : (
          <div className="text-[11px] text-center text-muted-foreground">
            Drag a piece onto the board, or click to select then click a square.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClear}>
            <Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear (Esc)
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <Button className="w-full" onClick={onSubmit}>
          <CheckCircle2 className="w-4 h-4 mr-2" /> Submit (Enter)
        </Button>
      </CardContent>
    </Card>
  );
}

function PaletteRow({
  pieces,
  selected,
  onSelect,
  label,
}: {
  pieces: string[];
  selected: string | null;
  onSelect: (p: string) => void;
  label: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="grid grid-cols-6 gap-1">
        {pieces.map((p) => (
          <button
            key={p}
            onClick={() => onSelect(p)}
            draggable
            onDragStart={(e) => writeDragPayload(e, p)}
            className={cn(
              "aspect-square rounded-md border flex items-center justify-center text-2xl transition-all cursor-grab active:cursor-grabbing",
              selected === p
                ? "border-primary bg-primary/15 ring-2 ring-primary/40 scale-105"
                : "border-border hover:border-primary/40",
            )}
            style={{
              color: p === p.toUpperCase() ? "#fff" : "#111",
              textShadow: p === p.toUpperCase() ? "0 0 2px #000" : undefined,
              backgroundColor: selected === p ? undefined : p === p.toUpperCase() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.4)",
            }}
            aria-label={`${label} ${p}`}
          >
            {PIECE_GLYPH[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RevealPanel({
  actualPieces,
  placed,
  difficulty,
  progress,
  onNext,
  onChangeDifficulty,
}: {
  actualPieces: Map<string, string>;
  placed: Map<string, string>;
  difficulty: Difficulty;
  progress: RememberProgress;
  onNext: () => void;
  onChangeDifficulty: () => void;
}) {
  const scoring = React.useMemo(
    () => scorePlacements(actualPieces, placed),
    [actualPieces, placed],
  );
  const passed = scoring.percent >= 80;
  const stats = progress[difficulty];

  return (
    <Card className={cn(passed ? "border-emerald-500/40" : "border-amber-500/40")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {passed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Trophy className="w-4 h-4 text-amber-400" />
          )}
          Result
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-center">
          <div className={cn("text-5xl font-bold font-mono", passed ? "text-emerald-400" : "text-amber-300")}>
            {scoring.percent}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {scoring.correct} of {scoring.total} pieces correct
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <DiffStat label="Correct" value={scoring.correct} color="text-emerald-400" />
          <DiffStat label="Wrong" value={scoring.wrong} color="text-red-400" />
          <DiffStat label="Missed" value={scoring.missed} color="text-blue-400" />
        </div>
        {stats && (
          <div className="text-xs text-muted-foreground text-center">
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" /> Streak: {stats.currentStreak}
            </span>
            <span className="mx-2">•</span>
            <span>Best: {stats.bestScore}%</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onChangeDifficulty}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Change tier
          </Button>
          <Button onClick={onNext}>
            <SkipForward className="w-3.5 h-3.5 mr-1.5" /> Next (N)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DiffStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className={cn("text-2xl font-bold font-mono tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ProgressCard({
  difficulty,
  progress,
}: {
  difficulty: Difficulty;
  progress: RememberProgress;
}) {
  const stats = progress[difficulty];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
          {DIFFICULTY_META[difficulty].label} stats
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2 text-center text-xs">
        <ProgressStat icon={Trophy} label="Best" value={stats?.bestScore != null ? `${stats.bestScore}%` : "—"} />
        <ProgressStat icon={Flame} label="Streak" value={stats?.currentStreak ?? 0} />
        <ProgressStat icon={Sparkles} label="Best run" value={stats?.bestStreak ?? 0} />
      </CardContent>
    </Card>
  );
}

function ProgressStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <Icon className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
      <div className="font-semibold font-mono tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StudyTimerBar({ total, remaining }: { total: number; remaining: number }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  return (
    <div className="h-2 w-full bg-card rounded-full overflow-hidden border border-border max-w-[640px]">
      <div
        className="h-full bg-gradient-to-r from-amber-400 to-red-400 transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

const PIECE_GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function countPieces(fen: string): number {
  const board = fen.split(" ")[0];
  let n = 0;
  for (const ch of board) {
    if (/[a-zA-Z]/.test(ch)) n++;
  }
  return n;
}

function fenToPieceMap(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const ranks = fen.split(" ")[0].split("/");
  for (let r = 0; r < ranks.length; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        const sq = String.fromCharCode(97 + file) + (8 - r);
        map.set(sq, ch);
        file++;
      }
    }
  }
  return map;
}

interface Scoring {
  correct: number;
  wrong: number;
  missed: number;
  total: number;
  percent: number;
}

/**
 * Reduce a full position to roughly `target` pieces by removing random
 * non-king pieces, then rebuilding the FEN. Kings stay so the position is
 * still a "real" chess position to look at. Side-to-move and castling rights
 * are stripped down to a clean default.
 */
function stripToTarget(fen: string, target: number): string {
  const map = fenToPieceMap(fen);
  const kings: string[] = [];
  const others: string[] = [];
  for (const [sq, piece] of map) {
    if (piece.toLowerCase() === "k") kings.push(sq);
    else others.push(sq);
  }
  const want = Math.max(target - kings.length, 0);
  // Shuffle others, keep first `want`.
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const keep = new Set([...kings, ...others.slice(0, want)]);
  // Rebuild FEN piece-placement from the kept squares.
  const ranks: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const sq = String.fromCharCode(97 + f) + (r + 1);
      if (keep.has(sq)) {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += map.get(sq);
      } else {
        empty++;
      }
    }
    if (empty > 0) row += String(empty);
    ranks.push(row);
  }
  return `${ranks.join("/")} w - - 0 1`;
}

function scorePlacements(
  actual: Map<string, string>,
  placed: Map<string, string>,
): Scoring {
  let correct = 0;
  let wrong = 0;
  for (const [sq, piece] of placed) {
    if (actual.get(sq) === piece) correct++;
    else wrong++;
  }
  let missed = 0;
  for (const [sq] of actual) {
    if (!placed.has(sq)) missed++;
  }
  const total = actual.size;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, wrong, missed, total, percent };
}

function VisionMode() {
  const [target, setTarget] = React.useState(randomSquare());
  const [score, setScore] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState(30);
  const [running, setRunning] = React.useState(false);
  const [showCoords, setShowCoords] = React.useState(false);
  const [orientation, setOrientation] = React.useState<"white" | "black">("white");
  const [flash, setFlash] = React.useState<{ square: string; correct: boolean } | null>(null);

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  React.useEffect(() => {
    if (running && timeLeft === 0) {
      setRunning(false);
      setBest((b) => Math.max(b, score));
      toast({ title: "Time", description: `Final score: ${score}`, variant: "success" });
    }
  }, [timeLeft, running, score]);

  const onSquareClick = (sq: string) => {
    if (!running) return;
    const correct = sq === target;
    setFlash({ square: sq, correct });
    setTimeout(() => setFlash(null), 250);
    if (correct) {
      setScore((s) => s + 1);
      setTarget(randomSquare());
    } else {
      setScore((s) => Math.max(0, s - 1));
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4">
      <div className="max-w-[640px]">
        <EmptyClickableBoard
          onSquare={onSquareClick}
          showCoords={showCoords}
          orientation={orientation}
          flash={flash}
        />
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="w-4 h-4" /> Board Vision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Find the named square. Squares are unlabeled — that's the point.
            </p>
            <div className="text-4xl font-bold font-mono text-center py-2 tracking-wider">
              {running ? target : "—"}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Score: {score}
              </span>
              <span>Best: {best}</span>
              <span>Time: {timeLeft}s</span>
            </div>
            <Button
              onClick={() => {
                if (running) {
                  setRunning(false);
                  setBest((b) => Math.max(b, score));
                } else {
                  setScore(0);
                  setTimeLeft(30);
                  setTarget(randomSquare());
                  setRunning(true);
                }
              }}
              className="w-full"
            >
              {running ? "Stop" : "Start 30s"}
            </Button>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCoords((s) => !s)}>
                {showCoords ? "Hide coords" : "Show coords"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
              >
                Flip board
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyClickableBoard({
  onSquare,
  showCoords,
  orientation,
  flash,
}: {
  onSquare: (sq: string) => void;
  showCoords: boolean;
  orientation: "white" | "black";
  flash: { square: string; correct: boolean } | null;
}) {
  // White-on-bottom: file index increases left→right, rank decreases top→bottom.
  // Black-on-bottom: both axes mirrored. We compute the algebraic square per cell
  // and only render a/b/c… and 1/2/3… on the edges (and only when toggled on).
  return (
    <div className="board-aspect rounded overflow-hidden select-none">
      <div className="w-full h-full grid grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }).map((_, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const file = orientation === "white" ? col : 7 - col;
          const rank = orientation === "white" ? 7 - row : row;
          const sq = String.fromCharCode(97 + file) + (rank + 1);
          const isLight = (file + rank) % 2 === 0;
          const isFlash = flash?.square === sq;
          const baseBg = isLight ? "#eeeed2" : "#769656";
          const flashBg = flash?.correct ? "#22c55e" : "#ef4444";
          return (
            <button
              key={`${row}-${col}`}
              className="relative transition-colors"
              style={{ backgroundColor: isFlash ? flashBg : baseBg }}
              onClick={() => onSquare(sq)}
              aria-label="board square"
            >
              {showCoords && row === 7 && (
                <span
                  className="absolute bottom-0.5 right-1 text-[10px] font-semibold pointer-events-none"
                  style={{ color: isLight ? "#769656" : "#eeeed2" }}
                >
                  {String.fromCharCode(97 + file)}
                </span>
              )}
              {showCoords && col === 0 && (
                <span
                  className="absolute top-0.5 left-1 text-[10px] font-semibold pointer-events-none"
                  style={{ color: isLight ? "#769656" : "#eeeed2" }}
                >
                  {rank + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function randomSquare(): string {
  const f = String.fromCharCode(97 + Math.floor(Math.random() * 8));
  const r = Math.floor(Math.random() * 8) + 1;
  return f + r;
}

void Chess; // keep import alive — used elsewhere
