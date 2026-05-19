import * as React from "react";
import { Chess } from "chess.js";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { APP_NAME } from "@/lib/brand";
import {
  coachStreamHeadersOk,
  sseTailDelta,
  STALE_COACH_SERVER_MSG,
} from "@/lib/coachReplyNormalize";
import { ChevronLeft, ChevronRight, Cpu, Eye, Home, Lightbulb, MessageCircle, RotateCcw, Search } from "lucide-react";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface PlayMoveResponse {
  bestMove: string | null;
  evaluation?: number;
  pv?: string[];
  depth?: number;
  engineMode?: "uci" | "mock";
}

interface EngineInfo {
  mode: "uci" | "mock";
  binary: string | null;
  hint: string | null;
}

/**
 * Reads `?fen=&orientation=&level=` from the URL on first render and validates
 * each value. Falls back to standard start / "white" / 4 when missing or invalid.
 */
function readPlayQuery(): {
  fen: string;
  orientation: "white" | "black";
  level: number;
  fromQuery: boolean;
} {
  if (typeof window === "undefined") {
    return { fen: STARTING_FEN, orientation: "white", level: 4, fromQuery: false };
  }
  const params = new URLSearchParams(window.location.search);
  const rawFen = params.get("fen");
  const rawOrientation = params.get("orientation");
  const rawLevel = params.get("level");

  let fen = STARTING_FEN;
  let fromQuery = false;
  if (rawFen) {
    try {
      const candidate = decodeURIComponent(rawFen);
      // chess.js throws on invalid FEN — keep the start position if so.
      new Chess(candidate);
      fen = candidate;
      fromQuery = true;
    } catch {
      /* invalid FEN — fall through to STARTING_FEN */
    }
  }

  const orientation: "white" | "black" =
    rawOrientation === "black" ? "black" : "white";

  let level = 4;
  if (rawLevel) {
    const n = Number(rawLevel);
    if (Number.isFinite(n)) level = Math.max(1, Math.min(8, Math.round(n)));
  }

  return { fen, orientation, level, fromQuery };
}

export default function Play() {
  const initial = React.useMemo(readPlayQuery, []);
  const [chess] = React.useState(() => new Chess(initial.fen));
  const [fen, setFen] = React.useState(initial.fen);
  const [history, setHistory] = React.useState<string[]>([initial.fen]);
  const [idx, setIdx] = React.useState(0);
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>();
  const [hint, setHint] = React.useState(false);
  const [level, setLevel] = React.useState(initial.level);
  const [orientation, setOrientation] = React.useState<"white" | "black">(initial.orientation);
  const [persona, setPersona] = React.useState<
    "balanced" | "capablanca" | "tal" | "petrosian"
  >("balanced");
  const [coachOn, setCoachOn] = React.useState(false);
  const [coachComment, setCoachComment] = React.useState<string>("");
  const [coachBusy, setCoachBusy] = React.useState(false);

  const askCoach = React.useCallback(
    async (priorFen: string, san: string) => {
      const colorWord = orientation === "white" ? "White" : "Black";
      const message = `Play vs computer. I play ${colorWord}. I just played ${san}.`;

      setCoachBusy(true);
      setCoachComment("Thinking…");
      try {
        const res = await fetch("/api/coach/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            fen: priorFen,
            targetSan: san,
            context: "play",
            playerColor: orientation,
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
    [orientation],
  );

  const engineInfo = useQuery<EngineInfo>({
    queryKey: ["engine"],
    queryFn: () => api("/api/engine"),
  });

  const engineMove = useMutation<PlayMoveResponse, Error, string>({
    mutationFn: (curFen) =>
      api("/api/play/move", {
        method: "POST",
        body: JSON.stringify({ fen: curFen, level, persona }),
      }),
    onSuccess: (data, curFen) => {
      if (!data.bestMove) return;
      try {
        const probe = new Chess(curFen);
        const m = probe.move({
          from: data.bestMove.slice(0, 2),
          to: data.bestMove.slice(2, 4),
          promotion: data.bestMove.length > 4 ? data.bestMove.slice(4) : undefined,
        });
        if (!m) return;
        chess.move({ from: m.from, to: m.to, promotion: m.promotion });
        const next = chess.fen();
        const newHist = [...history.slice(0, idx + 1), next];
        setHistory(newHist);
        setIdx(newHist.length - 1);
        setFen(next);
        setLastMove([m.from, m.to]);
      } catch {
        // ignore
      }
    },
  });

  const onMove = (from: string, to: string, promotion?: string) => {
    try {
      const priorFen = chess.fen();
      const m = chess.move({ from, to, promotion });
      if (!m) return;
      const next = chess.fen();
      const newHist = [...history.slice(0, idx + 1), next];
      setHistory(newHist);
      setIdx(newHist.length - 1);
      setFen(next);
      setLastMove([from, to]);
      if (coachOn) {
        void askCoach(priorFen, m.san);
      }
      setTimeout(() => engineMove.mutate(next), 200);
    } catch {
      // ignore
    }
  };

  const goTo = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= history.length) return;
    setIdx(newIdx);
    chess.load(history[newIdx]);
    setFen(history[newIdx]);
  };

  const reset = () => {
    // When loaded from `?fen=…`, "Reset" returns to that custom starting
    // position rather than the standard opening so the user can replay the
    // champion's spot from scratch.
    chess.load(initial.fen);
    setHistory([initial.fen]);
    setIdx(0);
    setFen(initial.fen);
    setLastMove(undefined);
  };

  const userColor = orientation;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#1a2634" }}>
      <header
        className="flex items-center gap-3 px-4 md:px-6 h-14 border-b border-black/30"
        style={{ backgroundColor: "#243447" }}
      >
        <Link href="/" className="flex items-center gap-2 text-white">
          <Home className="w-4 h-4" />
          <span className="font-semibold">{APP_NAME}</span>
        </Link>
        {initial.fromQuery && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Custom position
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-sm text-white">
          <Cpu className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">
            {engineInfo.data?.mode === "uci" ? "Stockfish UCI" : "Material fallback"}
          </span>
          {engineInfo.data?.mode === "mock" && (
            <span className="text-[10px] text-amber-300/90 max-w-[220px] text-right leading-tight hidden md:inline">
              Install Stockfish → set STOCKFISH_PATH in .env for full strength.
            </span>
          )}
          <select
            value={persona}
            onChange={(e) =>
              setPersona(e.target.value as "balanced" | "capablanca" | "tal" | "petrosian")
            }
            className="bg-transparent border border-white/20 rounded px-2 py-1 text-xs max-w-[140px]"
          >
            <option value="balanced" className="bg-[#243447]">Balanced</option>
            <option value="capablanca" className="bg-[#243447]">Capablanca</option>
            <option value="tal" className="bg-[#243447]">Tal</option>
            <option value="petrosian" className="bg-[#243447]">Petrosian</option>
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="bg-transparent border border-white/20 rounded px-2 py-1 text-xs"
          >
            {Array.from({ length: 8 }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l} className="bg-[#243447]">
                Level {l}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[680px] space-y-3">
          <Chessboard
            fen={fen}
            orientation={orientation}
            theme="wood"
            interactive={!engineMove.isPending}
            movableColor={userColor}
            lastMove={lastMove}
            onMove={onMove}
            arrows={hint && engineMove.data?.bestMove ? [{
              orig: engineMove.data.bestMove.slice(0, 2),
              dest: engineMove.data.bestMove.slice(2, 4),
              brush: "blue",
            }] : []}
          />
          {coachOn && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-white/90">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold mb-1">
                <MessageCircle className="w-3.5 h-3.5" /> Coach
                {coachBusy && <span className="text-white/60">· thinking…</span>}
              </div>
              <div className="whitespace-pre-wrap">
                {coachComment || "Play a move — I'll comment on it."}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer
        className="border-t border-black/30 px-4 md:px-6 py-3 flex items-center gap-2"
        style={{ backgroundColor: "#243447" }}
      >
        <Button variant="ghost" size="sm" className="text-white hover:text-white" onClick={() => engineMove.mutate(fen)}>
          <Search className="w-4 h-4 mr-2" /> Analyze
        </Button>
        <Button variant="ghost" size="sm" className="text-white hover:text-white" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-white hover:text-white" onClick={() => goTo(idx + 1)} disabled={idx >= history.length - 1}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-white hover:text-white" onClick={() => setHint((h) => !h)}>
          <Lightbulb className="w-4 h-4 mr-2" /> {hint ? "Hint on" : "Hint off"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:text-white"
          onClick={() => {
            setCoachOn((c) => !c);
            setCoachComment("");
          }}
        >
          <MessageCircle className="w-4 h-4 mr-2" /> {coachOn ? "Coach on" : "Coach off"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:text-white"
          onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
        >
          <Eye className="w-4 h-4 mr-2" /> Flip
        </Button>
        <Button variant="ghost" size="sm" className="text-white hover:text-white" onClick={reset}>
          <RotateCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
        <span className="ml-auto text-xs text-white/70">
          Move {Math.ceil(idx / 2)} · Ply {idx} / {history.length - 1}
        </span>
      </footer>
    </div>
  );
}
