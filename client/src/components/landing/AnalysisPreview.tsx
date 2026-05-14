import * as React from "react";
import { Link } from "wouter";
import { Chess } from "chess.js";
import { ArrowRight, Lock, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { usePreviewQuota } from "@/hooks/usePreviewQuota";
import { cn } from "@/lib/utils";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface AllMovesLine {
  uci: string;
  cp: number;
  mateIn: number | null;
  pv: string[];
}

interface AllMovesResponse {
  fen: string;
  depth: number;
  bestMove: string | null;
  bestEvaluation: number;
  lines: AllMovesLine[];
}

/**
 * Inline analysis board for /welcome. The guest plays moves on a real
 * chessground board; we call `/api/position/all-moves` for the best
 * move + eval and draw it as an arrow. Capped at 3 engine queries via
 * `usePreviewQuota("analysis")`.
 */
export function AnalysisPreview() {
  const quota = usePreviewQuota("analysis");
  const [chess] = React.useState(() => new Chess());
  const [fen, setFen] = React.useState(STARTING_FEN);
  const [analysis, setAnalysis] = React.useState<AllMovesResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const runEngine = React.useCallback(
    async (nextFen: string) => {
      if (!quota.spend(1)) return;
      setBusy(true);
      setErrMsg(null);
      try {
        const res = await api<AllMovesResponse>("/api/position/all-moves", {
          method: "POST",
          body: JSON.stringify({ fen: nextFen, depth: 10 }),
        });
        setAnalysis(res);
      } catch (e) {
        setErrMsg((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [quota],
  );

  const onMove = (from: string, to: string, promotion?: string) => {
    try {
      const mv = chess.move({ from, to, promotion: promotion ?? "q" });
      if (!mv) return;
      const next = chess.fen();
      setFen(next);
      void runEngine(next);
    } catch {
      /* illegal — ignore */
    }
  };

  const reset = () => {
    chess.reset();
    setFen(STARTING_FEN);
    setAnalysis(null);
    setErrMsg(null);
  };

  const remaining = quota.unlimited ? "unlimited" : `${quota.remaining}/${quota.budget}`;
  const best = analysis?.lines[0];
  const arrows = React.useMemo(() => {
    if (!best || !best.uci) return [];
    const from = best.uci.slice(0, 2);
    const to = best.uci.slice(2, 4);
    return [{ orig: from, dest: to, brush: "green" as const }];
  }, [best]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {quota.unlimited
            ? "Engine is unlimited on your account."
            : `Preview: ${remaining} free analyses left.`}
        </span>
        {!quota.unlimited && (
          <Link href="/signup?next=%2Fanalysis" className="text-emerald-300 hover:underline">
            Unlock full analysis →
          </Link>
        )}
      </div>

      <div className="grid sm:grid-cols-[1fr_240px] gap-3">
        <div className="max-w-[420px]">
          <Chessboard
            fen={fen}
            interactive={!quota.exceeded}
            movableColor="both"
            onMove={onMove}
            arrows={arrows}
          />
        </div>

        <div className="space-y-2 text-sm">
          <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2 min-h-[8rem]">
            {busy ? (
              <p className="text-xs text-muted-foreground">Thinking…</p>
            ) : analysis ? (
              <>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Best move
                </p>
                <p className="font-mono text-base text-emerald-300">
                  {best?.uci ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Eval:{" "}
                  <span className="text-foreground/90 font-medium">
                    {formatEval(best)}
                  </span>
                </p>
                {best?.pv && best.pv.length > 0 && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Principal variation: {best.pv.slice(0, 6).join(" ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Play a move to see Stockfish&apos;s best reply.
              </p>
            )}
            {errMsg && <p className="text-xs text-destructive">{errMsg}</p>}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            className="w-full"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset board
          </Button>
        </div>
      </div>

      {quota.exceeded && <SignupNudge />}
    </div>
  );
}

function formatEval(line: AllMovesLine | undefined): string {
  if (!line) return "—";
  if (line.mateIn != null) return `Mate in ${Math.abs(line.mateIn)}`;
  const pawns = line.cp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

function SignupNudge() {
  return (
    <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 flex items-center gap-3">
      <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
      <p className="flex-1 text-xs text-foreground/90">
        That&apos;s your free preview. Sign up for unlimited engine queries, coach commentary, and PGN imports.
      </p>
      <Link href="/signup?next=%2Fanalysis">
        <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
          Sign up
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

AnalysisPreview.displayName = "AnalysisPreview";
export const ANALYSIS_PREVIEW_SAMPLE_NOTE = (
  <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
    <Sparkles className="w-3 h-3" /> Powered by Stockfish 17
  </span>
);
