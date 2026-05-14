/**
 * /watch/cvc/live/:id — live engine-vs-engine match viewer.
 *
 * Opens an SSE stream to `/api/engines/match/:id/stream` and pushes
 * each move into an `AnimatedBoardPlayer` timeline. The narration is
 * grown move-by-move (one short caption per move) so it feels like a
 * broadcast feed even though the engines are still thinking.
 *
 * Once the match ends, the persisted library game id is surfaced so
 * the user can replay or export to MP4 via `/watch/export`.
 */
import * as React from "react";
import { Link, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  AnimatedBoardPlayer,
  type WatchTimeline,
  type WatchPosition,
  type WatchCaption,
} from "@/components/watch/AnimatedBoardPlayer";
import { ArrowLeft, Clapperboard, Square, StopCircle } from "lucide-react";
import { api } from "@/lib/queryClient";

interface MoveEvent {
  type: "move";
  ply: number;
  san: string;
  uci: string;
  fen: string;
  side: "white" | "black";
  evalCp?: number;
  thinkMs: number;
}
interface EndEvent {
  type: "end";
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  reason: string;
  ply: number;
  pgn: string;
  libraryGameId?: number;
}
interface InfoEvent {
  type: "info";
  message: string;
}

type StreamEvent = MoveEvent | EndEvent | InfoEvent;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function WatchCvcLive() {
  const [, params] = useRoute<{ id: string }>("/watch/cvc/live/:id");
  const matchId = params?.id ?? "";

  const [positions, setPositions] = React.useState<WatchPosition[]>([
    { fen: START_FEN, san: "" },
  ]);
  const [captions, setCaptions] = React.useState<WatchCaption[]>([
    {
      tStart: 0,
      tEnd: 2.5,
      ply: 0,
      kind: "intro",
      text: "Two engines, no humans — let's watch.",
    },
  ]);
  const [info, setInfo] = React.useState<string[]>([]);
  const [ended, setEnded] = React.useState<EndEvent | null>(null);
  const [whiteName, setWhiteName] = React.useState("White");
  const [blackName, setBlackName] = React.useState("Black");

  const introS = 2.5;
  const perMoveS = 1.6;

  React.useEffect(() => {
    if (!matchId) return;
    // Bootstrap with the current state so we don't lose the first moves
    // if the user joined late.
    void api<{ match: { options: { white: { name: string }; black: { name: string } } } }>(
      `/api/engines/match/${matchId}`,
    )
      .then((d) => {
        setWhiteName(d.match.options.white.name);
        setBlackName(d.match.options.black.name);
      })
      .catch(() => undefined);

    const es = new EventSource(`/api/engines/match/${matchId}/stream`);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as StreamEvent;
        handleEvent(data);
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; just surface a notice.
      setInfo((prev) => [...prev.slice(-9), "stream lost — reconnecting…"]);
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const handleEvent = (e: StreamEvent) => {
    if (e.type === "info") {
      setInfo((prev) => [...prev.slice(-9), e.message]);
      return;
    }
    if (e.type === "move") {
      setPositions((prev) => {
        // Idempotent on replay: if we already have a position at this
        // ply with the same FEN, don't duplicate.
        if (prev[e.ply]?.fen === e.fen) return prev;
        const next = prev.slice(0, e.ply);
        next.push({
          fen: e.fen,
          san: e.san,
          uci: e.uci,
          evalCp: typeof e.evalCp === "number" ? e.evalCp : null,
        });
        return next;
      });
      setCaptions((prev) => {
        const tStart = introS + (e.ply - 1) * perMoveS;
        const text =
          typeof e.evalCp === "number"
            ? `${e.san} (${(e.evalCp / 100).toFixed(1)})`
            : e.san;
        // Dedupe in case the SSE replays history.
        if (prev.some((c) => c.ply === e.ply && c.text === text)) return prev;
        return [
          ...prev,
          {
            tStart,
            tEnd: tStart + perMoveS,
            ply: e.ply,
            text,
            kind: "move",
          },
        ];
      });
      return;
    }
    if (e.type === "end") {
      setEnded(e);
      setCaptions((prev) => [
        ...prev,
        {
          tStart: introS + e.ply * perMoveS,
          tEnd: introS + e.ply * perMoveS + 3.5,
          ply: e.ply,
          text: `${e.result} — ${e.reason}.`,
          kind: "outro",
        },
      ]);
    }
  };

  const cancelMatch = async () => {
    try {
      await api(`/api/engines/match/${matchId}/cancel`, { method: "POST" });
    } catch (err) {
      console.warn("cancel failed", err);
    }
  };

  const timeline: WatchTimeline = {
    title: `${whiteName} vs ${blackName}`,
    subtitle: ended
      ? `Result: ${ended.result}`
      : "Live engine match",
    white: whiteName,
    black: blackName,
    result: ended?.result,
    positions,
    captions,
    introHoldS: introS,
    perMoveSecondsAt1x: perMoveS,
    outroHoldS: 3.5,
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/watch/cvc"
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Computer chess
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            {whiteName} <span className="text-muted-foreground">vs</span> {blackName}
          </h1>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {ended ? (
              <>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {ended.result}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {ended.reason}
                </Badge>
              </>
            ) : (
              <Badge className="text-[10px] bg-rose-600 hover:bg-rose-600">LIVE</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {Math.max(0, positions.length - 1)} plies
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {ended?.libraryGameId != null && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/watch/games/${ended.libraryGameId}`}>
                  <Square className="h-4 w-4 mr-2" /> Replay (with narration)
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/watch/export?gameId=${ended.libraryGameId}`}>
                  <Clapperboard className="h-4 w-4 mr-2" /> Export to MP4
                </Link>
              </Button>
            </>
          )}
          {!ended && (
            <Button variant="outline" size="sm" onClick={cancelMatch}>
              <StopCircle className="h-4 w-4 mr-2" /> Stop match
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <Card>
          <CardContent className="p-4">
            <AnimatedBoardPlayer timeline={timeline} autoPlay />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 space-y-2">
            <h3 className="text-sm font-semibold">Engine log</h3>
            <div className="max-h-[380px] overflow-y-auto text-[11px] font-mono space-y-1 text-muted-foreground">
              {info.length === 0 ? (
                <div className="italic">Waiting for engines…</div>
              ) : (
                info.map((line, i) => (
                  <div key={i} className="break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
