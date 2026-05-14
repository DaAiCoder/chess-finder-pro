import * as React from "react";
import { Chess } from "chess.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { EvalBar } from "@/components/chess/EvalBar";
import {
  PerPieceEvalOverlay,
  type PerPieceEval,
} from "@/components/chess/PerPieceEvalOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { api } from "@/lib/queryClient";
import {
  coachStreamHeadersOk,
  sseTailDelta,
  STALE_COACH_SERVER_MSG,
} from "@/lib/coachReplyNormalize";
import { formatCp } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, RotateCcw, Search } from "lucide-react";
import type { Game } from "@shared/schema";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface AllMovesLine {
  uci: string;
  cp: number; // white POV centipawns
  mateIn: number | null;
  pv: string[];
}

interface AllMovesResponse {
  fen: string;
  depth: number;
  bestMove: string | null;
  bestEvaluation: number;
  lines: AllMovesLine[];
  engineMode: "uci" | "mock";
}

export default function ChessTrainer() {
  const [chess] = React.useState(() => new Chess());
  const [fen, setFen] = React.useState(STARTING_FEN);
  const [history, setHistory] = React.useState<string[]>([STARTING_FEN]);
  const [historyIdx, setHistoryIdx] = React.useState(0);
  const [orientation, setOrientation] = React.useState<"white" | "black">("white");
  const [query, setQuery] = React.useState("");
  const [showEvals, setShowEvals] = React.useState(true);
  const [showBestArrow, setShowBestArrow] = React.useState(true);
  const [coachOn, setCoachOn] = React.useState(false);
  const [coachComment, setCoachComment] = React.useState<string>("");
  const [coachBusy, setCoachBusy] = React.useState(false);
  const allMoves = useQuery<AllMovesResponse>({
    queryKey: ["all-moves", fen],
    queryFn: () =>
      api("/api/position/all-moves", {
        method: "POST",
        body: JSON.stringify({ fen, depth: 12 }),
      }),
    staleTime: 60_000,
  });

  const querySearch = useMutation({
    mutationFn: (q: string) =>
      api<{ results: Game[] }>("/api/query", {
        method: "POST",
        body: JSON.stringify({ query: q }),
      }),
  });

  const askCoach = React.useCallback(
    async (priorFen: string, san: string) => {
      setCoachBusy(true);
      setCoachComment("Thinking…");
      try {
        const res = await fetch("/api/coach/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Analysis mode — comment on the move ${san} I just played in 1-2 sentences. Be specific.`,
            fen: priorFen,
          }),
        });
        if (!coachStreamHeadersOk(res)) {
          setCoachComment(STALE_COACH_SERVER_MSG);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no body");
        const dec = new TextDecoder();
        let buf = "";
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() ?? "";
          for (const b of blocks) {
            const line = b.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const obj = JSON.parse(line.replace(/^data:\s*/, "")) as {
                delta?: string;
                error?: string;
              };
              if (obj.error) throw new Error(obj.error);
              if (obj.delta) {
                acc += obj.delta;
                setCoachComment(acc);
              }
            } catch {
              /* parse noise */
            }
          }
        }
        acc += sseTailDelta(buf);
        setCoachComment(acc);
      } catch (e) {
        setCoachComment(`(coach unavailable: ${(e as Error).message})`);
      } finally {
        setCoachBusy(false);
      }
    },
    [],
  );

  const onMove = (from: string, to: string, promotion?: string) => {
    try {
      const priorFen = chess.fen();
      const m = chess.move({ from, to, promotion });
      if (!m) return;
      const next = chess.fen();
      const trimmed = history.slice(0, historyIdx + 1);
      const newHistory = [...trimmed, next];
      setHistory(newHistory);
      setHistoryIdx(newHistory.length - 1);
      setFen(next);
      if (coachOn) void askCoach(priorFen, m.san);
    } catch {
      // illegal — ignore
    }
  };

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= history.length) return;
    setHistoryIdx(idx);
    chess.load(history[idx]);
    setFen(history[idx]);
  };

  const reset = () => {
    chess.reset();
    setHistory([STARTING_FEN]);
    setHistoryIdx(0);
    setFen(STARTING_FEN);
  };

  // Group lines by source square; pick best per piece. Best globally → blue.
  const perPieceEvals: PerPieceEval[] = React.useMemo(() => {
    if (!allMoves.data?.lines?.length) return [];

    const stm: "w" | "b" = fen.split(" ")[1] === "b" ? "b" : "w";

    // Per-source-square winner (the move that's best from THIS square's POV).
    const bySquare = new Map<
      string,
      { uci: string; cp: number; mateIn: number | null }
    >();
    for (const line of allMoves.data.lines) {
      if (!line.uci || line.uci.length < 4) continue;
      const from = line.uci.slice(0, 4).slice(0, 2);
      const cur = bySquare.get(from);
      const better = cur ? isBetterForSide(line, cur, stm) : true;
      if (better) {
        bySquare.set(from, { uci: line.uci, cp: line.cp, mateIn: line.mateIn });
      }
    }

    // Find global best square → it gets the blue badge.
    let globalBestSquare: string | null = null;
    let globalBest: { cp: number; mateIn: number | null } | null = null;
    for (const [sq, v] of bySquare) {
      if (!globalBest || isBetterForSide(v, globalBest, stm)) {
        globalBest = { cp: v.cp, mateIn: v.mateIn };
        globalBestSquare = sq;
      }
    }

    const out: PerPieceEval[] = [];
    for (const [from, v] of bySquare) {
      out.push({
        square: from,
        bestTo: v.uci.slice(2, 4),
        evalPawns: v.cp / 100,
        mateIn: v.mateIn,
        isBest: from === globalBestSquare,
      });
    }
    return out;
  }, [allMoves.data, fen]);

  const arrows =
    showBestArrow && allMoves.data?.bestMove
      ? [
          {
            orig: allMoves.data.bestMove.slice(0, 2),
            dest: allMoves.data.bestMove.slice(2, 4),
            brush: "blue" as const,
          },
        ]
      : [];

  return (
    <div className="p-4 md:p-6 space-y-3">
      {allMoves.data?.engineMode === "mock" && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          <span className="font-semibold">Heads up:</span> Stockfish binary not
          found — using a positional material fallback. Evals are approximate.
          Set <span className="font-mono">STOCKFISH_PATH</span> in{" "}
          <span className="font-mono">.env</span> to the Stockfish .exe path,
          then restart the server.
        </div>
      )}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 lg:gap-6">
      <div className="flex gap-3">
        <div className="w-6">
          <EvalBar
            cp={allMoves.data?.bestEvaluation ?? 0}
            mateIn={allMoves.data?.lines?.[0]?.mateIn ?? null}
          />
        </div>
        <div className="flex-1 max-w-[640px]">
          <div className="relative">
            <Chessboard
              fen={fen}
              orientation={orientation}
              interactive
              arrows={arrows}
              onMove={onMove}
            />
            {showEvals && (
              <PerPieceEvalOverlay evals={perPieceEvals} orientation={orientation} />
            )}
            {allMoves.isFetching && (
              <div className="absolute top-2 left-2 z-30 flex items-center gap-1 rounded bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goTo(historyIdx - 1)}
              disabled={historyIdx === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goTo(historyIdx + 1)}
              disabled={historyIdx >= history.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
            >
              Flip board
            </Button>
            <Button
              variant={coachOn ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setCoachOn((c) => !c);
                setCoachComment("");
              }}
            >
              <MessageCircle className="w-4 h-4 mr-2" /> {coachOn ? "Coach on" : "Coach off"}
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Ply {historyIdx} / {history.length - 1}
            </span>
          </div>
          {coachOn && (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold mb-1">
                <MessageCircle className="w-3.5 h-3.5" /> Coach
                {coachBusy && <span className="text-muted-foreground">· thinking…</span>}
              </div>
              <div className="whitespace-pre-wrap">
                {coachComment || "Play a move — I'll comment on it."}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Evaluation</span>
              <span className="font-mono font-bold">
                {allMoves.data?.lines?.[0]?.mateIn != null
                  ? `M${Math.abs(allMoves.data.lines[0].mateIn)}`
                  : formatCp(allMoves.data?.bestEvaluation ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Best move</span>
              <span className="font-mono">{allMoves.data?.bestMove ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Depth</span>
              <span className="font-mono">{allMoves.data?.depth ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Engine</span>
              <span className="font-mono text-xs">
                {allMoves.data?.engineMode === "uci"
                  ? "Stockfish UCI"
                  : "Material fallback"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Display</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Per-piece eval badges</span>
              <Switch checked={showEvals} onCheckedChange={setShowEvals} />
            </div>
            <div className="flex items-center justify-between">
              <span>Best-move arrow</span>
              <Switch checked={showBestArrow} onCheckedChange={setShowBestArrow} />
            </div>
            <p className="text-xs text-muted-foreground">
              Blue badge = engine's best move. Green badges = best move available
              from that piece. Numbers are in pawns (white POV).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {!allMoves.data?.lines?.length && (
              <p className="text-xs text-muted-foreground">No lines.</p>
            )}
            {allMoves.data?.lines?.slice(0, 6).map((l, i) => {
              const sanLine = uciLineToSan(fen, l.pv);
              const evalLabel =
                l.mateIn != null
                  ? `${l.mateIn > 0 ? "+" : "−"}M${Math.abs(l.mateIn)}`
                  : formatPawns(l.cp / 100);
              return (
                <div
                  key={l.uci + i}
                  className="flex items-center gap-2 py-0.5 border-b border-border last:border-0"
                >
                  <Badge variant={i === 0 ? "default" : "outline"} className="font-mono w-12 justify-center">
                    {evalLabel}
                  </Badge>
                  <span className="font-mono text-xs truncate">{sanLine}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Position</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <Label htmlFor="fen">FEN</Label>
              <Input
                id="fen"
                value={fen}
                onChange={(e) => {
                  setFen(e.target.value);
                  try {
                    chess.load(e.target.value);
                    setHistory([e.target.value]);
                    setHistoryIdx(0);
                  } catch {
                    // wait until valid
                  }
                }}
                className="font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4" /> Find games
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder='e.g. "blitz games I lost as black"'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) querySearch.mutate(query.trim());
                }}
              />
              <Button onClick={() => query.trim() && querySearch.mutate(query.trim())}>
                Go
              </Button>
            </div>
            {querySearch.data && (
              <div className="space-y-1 text-xs">
                {querySearch.data.results.length === 0 && (
                  <p className="text-muted-foreground">
                    No matching games. Import some first.
                  </p>
                )}
                {querySearch.data.results.slice(0, 8).map((g) => (
                  <a
                    key={g.id}
                    href={`/game-analysis/${g.id}`}
                    className="block hover:underline"
                  >
                    <Badge variant="outline" className="mr-2">
                      {g.result ?? "*"}
                    </Badge>
                    {g.whitePlayer} vs {g.blackPlayer}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

/** True iff `candidate` is better for `stm` (white wants higher cp; black wants lower). */
function isBetterForSide(
  candidate: { cp: number; mateIn: number | null },
  current: { cp: number; mateIn: number | null },
  stm: "w" | "b",
): boolean {
  if (stm === "w") return candidate.cp > current.cp;
  return candidate.cp < current.cp;
}

function formatPawns(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}`;
}

function uciLineToSan(startFen: string, pv: string[]): string {
  if (!pv?.length) return "";
  try {
    const c = new Chess(startFen);
    const out: string[] = [];
    for (const u of pv.slice(0, 8)) {
      if (!u || u.length < 4) break;
      const m = c.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        promotion: u.length > 4 ? u.slice(4, 5) : undefined,
      });
      if (!m) break;
      out.push(m.san);
    }
    return out.join(" ");
  } catch {
    return pv.join(" ");
  }
}
