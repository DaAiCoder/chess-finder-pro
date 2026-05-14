import * as React from "react";
import { Link } from "wouter";
import { Chess } from "chess.js";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { usePreviewQuota } from "@/hooks/usePreviewQuota";
import { cn } from "@/lib/utils";

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

/**
 * Mini Blind Tactics widget for /welcome. Shows a *frozen* starting
 * position, lists the moves the guest must play mentally, and asks
 * them to pick the right tactical move (multiple choice from the
 * imagined position's legal moves) — without ever updating the board.
 *
 * Capped at 3 puzzles via `usePreviewQuota("blind")`.
 */
export function BlindTacticsPreview() {
  const quota = usePreviewQuota("blind");
  const [allEasy, setAllEasy] = React.useState<BlindTactic[] | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [seed, setSeed] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    api<BlindTactic[]>("/api/training/visualization/blind-tactics")
      .then((list) => {
        if (cancelled) return;
        // Pick the easiest puzzles for the preview so the guest can
        // actually solve them in their head. Difficulty 1-2 only.
        const easy = list.filter((t) => t.difficulty <= 2);
        // Shuffle once so a refresh on the landing page is varied.
        for (let i = easy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [easy[i], easy[j]] = [easy[j], easy[i]];
        }
        setAllEasy(easy);
      })
      .catch((e) => {
        if (!cancelled) setLoadErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tactic = React.useMemo<BlindTactic | null>(() => {
    if (!allEasy || allEasy.length === 0) return null;
    return allEasy[seed % allEasy.length];
  }, [allEasy, seed]);

  const next = () => setSeed((s) => s + 1);

  const remaining = quota.unlimited ? "unlimited" : `${quota.remaining}/${quota.budget}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {quota.unlimited
            ? "Blind tactics is unlimited on your account."
            : `Preview: ${remaining} free puzzles left.`}
        </span>
        {!quota.unlimited && (
          <Link
            href="/signup?next=%2Ftraining%2Fvisualization"
            className="text-emerald-300 hover:underline"
          >
            Unlock full trainer →
          </Link>
        )}
      </div>

      {loadErr && (
        <p className="text-xs text-destructive">Could not load puzzles: {loadErr}</p>
      )}

      {!allEasy && !loadErr && (
        <p className="text-xs text-muted-foreground">Loading puzzles…</p>
      )}

      {tactic && (
        <BlindPuzzle
          key={tactic.id}
          tactic={tactic}
          quota={quota}
          onNext={next}
        />
      )}
    </div>
  );
}

interface QuotaApi {
  unlimited: boolean;
  exceeded: boolean;
  spend: (n?: number) => boolean;
}

function BlindPuzzle({
  tactic,
  quota,
  onNext,
}: {
  tactic: BlindTactic;
  quota: QuotaApi;
  onNext: () => void;
}) {
  const [status, setStatus] = React.useState<
    "solving" | "wrong" | "solved" | "revealed"
  >("solving");
  const [chosen, setChosen] = React.useState<string | null>(null);

  // Compute the imagined FEN by replaying playedMoves over startFen.
  // chess.js throws on bad SAN — surface that as an inline error.
  const { imaginedFen, finalFen, options, lastMoveSquares } = React.useMemo(() => {
    try {
      const ch = new Chess(tactic.startFen);
      for (const san of tactic.playedMoves) ch.move(san);
      const imagined = ch.fen();

      // Pick 3 decoy moves from legal moves in the imagined position.
      const legal = ch.moves();
      const decoys: string[] = [];
      const pool = legal.filter((m) => m !== tactic.solution);
      // Prefer moves that look "tactical" first — captures / checks —
      // so the multiple choice isn't trivially the only sharp move.
      const tactical = pool.filter((m) => /[x+#]/.test(m));
      const quiet = pool.filter((m) => !/[x+#]/.test(m));
      const shuffled = [...tactical, ...quiet];
      for (let i = 0; i < shuffled.length && decoys.length < 3; i++) {
        decoys.push(shuffled[i]);
      }
      const opts = [...decoys, tactic.solution];
      // Shuffle the options once per puzzle for fair display.
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }

      // After playing the solution we can show the resulting position.
      const ch2 = new Chess(imagined);
      const mv = ch2.move(tactic.solution);
      const final = ch2.fen();
      const last: [string, string] | undefined = mv
        ? [mv.from, mv.to]
        : undefined;
      return {
        imaginedFen: imagined,
        finalFen: final,
        options: opts,
        lastMoveSquares: last,
      };
    } catch {
      return {
        imaginedFen: null,
        finalFen: null,
        options: [tactic.solution],
        lastMoveSquares: undefined as [string, string] | undefined,
      };
    }
  }, [tactic]);

  const moveListText = formatMoveList(tactic.playedMoves, tactic.startFen);

  const handlePick = (san: string) => {
    if (status === "solved" || status === "revealed") return;
    // Spend a try the first time the user commits an answer for this
    // puzzle. Subsequent wrong-then-retry on the same puzzle is free.
    if (status === "solving") {
      if (!quota.spend(1)) return;
    }
    setChosen(san);
    if (san === tactic.solution) {
      setStatus("solved");
    } else {
      setStatus("wrong");
    }
  };

  const reveal = () => {
    if (status === "solving") {
      if (!quota.spend(1)) return;
    }
    setChosen(tactic.solution);
    setStatus("revealed");
  };

  // What board to display:
  //   - while solving / wrong → the frozen STARTING position
  //   - solved / revealed → the FINAL imagined position with the solving
  //     move highlighted
  const boardFen =
    status === "solved" || status === "revealed"
      ? finalFen ?? tactic.startFen
      : tactic.startFen;
  const arrows = lastMoveSquares && (status === "solved" || status === "revealed")
    ? [
        {
          orig: lastMoveSquares[0],
          dest: lastMoveSquares[1],
          brush: "green" as const,
        },
      ]
    : undefined;

  const sideLabel =
    tactic.sideToMove === "white" ? "White to play" : "Black to play";

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-[1fr_240px] gap-3">
        <div className="max-w-[420px]">
          <Chessboard
            fen={boardFen}
            orientation={tactic.sideToMove}
            interactive={false}
            arrows={arrows}
            lastMove={
              status === "solved" || status === "revealed"
                ? lastMoveSquares
                : undefined
            }
          />
          <p className="text-[10px] text-muted-foreground mt-1 text-center">
            {status === "solved" || status === "revealed"
              ? "Position after the tactic — solving move highlighted."
              : "Frozen starting position. Play the moves in your head."}
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-700/60 text-emerald-200"
            >
              {sideLabel}
            </Badge>
            <Badge variant="secondary" className="text-[10px] capitalize">
              {tactic.theme.replace(/-/g, " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              ★ {tactic.difficulty}
            </Badge>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-2.5 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
              <EyeOff className="w-3 h-3" /> Play in your head
            </p>
            <p className="font-mono text-xs text-emerald-300/90 leading-relaxed break-words">
              {moveListText}
            </p>
          </div>

          {tactic.description && (
            <p className="text-xs text-muted-foreground leading-snug">
              {tactic.description}
            </p>
          )}

          {status === "solved" && (
            <div className="rounded border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-2 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Nice — that's the move.</p>
                <p className="text-muted-foreground">
                  Solution: <span className="font-mono text-emerald-300">{tactic.solution}</span>
                </p>
              </div>
            </div>
          )}

          {status === "revealed" && (
            <div className="rounded border border-amber-700/60 bg-amber-950/30 px-2.5 py-2 text-xs flex items-start gap-2">
              <Eye className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Solution revealed</p>
                <p className="text-muted-foreground">
                  The move was <span className="font-mono text-emerald-300">{tactic.solution}</span>.
                </p>
              </div>
            </div>
          )}

          {status === "wrong" && (
            <div className="rounded border border-rose-700/60 bg-rose-950/30 px-2.5 py-2 text-xs flex items-start gap-2">
              <XCircle className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Not the move.</p>
                <p className="text-muted-foreground">Try again, or reveal.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multiple-choice option row */}
      {status !== "solved" && status !== "revealed" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {options.map((opt) => {
            const isChosenWrong = status === "wrong" && opt === chosen;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => handlePick(opt)}
                disabled={quota.exceeded && status === "solving"}
                className={cn(
                  "rounded border px-2.5 py-2 text-sm font-mono transition-colors",
                  isChosenWrong
                    ? "border-rose-700/60 bg-rose-950/40 text-rose-200"
                    : "border-border bg-card/70 hover:bg-secondary/80",
                  quota.exceeded && status === "solving" && "opacity-50 cursor-not-allowed",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {status === "solving" && imaginedFen && !quota.exceeded && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            Tip: visualize each move before clicking.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={reveal}>
            Reveal answer
          </Button>
        </div>
      )}

      {(status === "solved" || status === "revealed") && !quota.exceeded && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          className="w-full"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Next puzzle
        </Button>
      )}

      {quota.exceeded && <SignupNudge />}
    </div>
  );
}

/**
 * Format a list of SAN plies as a tidy move list,
 * starting from the side to move in `startFen`.
 *   ["e4","e5","Nf3","Nc6","Bb5"] (white to move)
 *     → "1.e4 e5 2.Nf3 Nc6 3.Bb5"
 */
function formatMoveList(playedMoves: string[], startFen: string): string {
  let startWithBlack = false;
  let moveNumber = 1;
  try {
    const ch = new Chess(startFen);
    if (ch.turn() === "b") startWithBlack = true;
    const fenFields = startFen.split(" ");
    const fullMove = Number(fenFields[5] ?? 1);
    if (Number.isFinite(fullMove)) moveNumber = fullMove;
  } catch {
    /* ignore */
  }
  const out: string[] = [];
  let i = 0;
  let n = moveNumber;
  if (startWithBlack && i < playedMoves.length) {
    out.push(`${n}...${playedMoves[i++]}`);
    n++;
  }
  while (i < playedMoves.length) {
    const white = playedMoves[i++];
    const black = i < playedMoves.length ? playedMoves[i++] : null;
    out.push(black ? `${n}.${white} ${black}` : `${n}.${white}`);
    n++;
  }
  return out.join(" ");
}

function SignupNudge() {
  return (
    <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 flex items-center gap-3">
      <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
      <p className="flex-1 text-xs text-foreground/90">
        That&apos;s your free preview. Sign up to unlock the full visualization
        trainer: blindfold, board vision, remember position, and more.
      </p>
      <Link href="/signup?next=%2Ftraining%2Fvisualization">
        <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
          Sign up
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

BlindTacticsPreview.displayName = "BlindTacticsPreview";
