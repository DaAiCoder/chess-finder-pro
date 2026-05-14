import * as React from "react";
import { Chess } from "chess.js";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { WeaknessBanner } from "@/components/training/WeaknessBanner";
import { ProblemSourceBadge } from "@/components/training/ProblemSourceBadge";
import {
  Eye,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { TrainingProblem } from "@shared/schema";
import {
  indexForProblemId,
  readDeckProblemId,
  writeDeckProblemId,
} from "@/lib/trainingDeckCursor";

/** Strip +/#/!/? from SAN so user-played `Ra8` matches stored `Ra8#`. */
function stripDecor(san: string): string {
  return san.replace(/[+#?!]/g, "");
}

type Status = "idle" | "wrong" | "solved";

export default function CheckmatePatterns() {
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "checkmate-patterns"],
    queryFn: () => api(`/api/training/problems?module=checkmate-patterns`),
  });

  const deck = all.data ?? [];

  const [idx, setIdx] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [status, setStatus] = React.useState<Status>("idle");
  // Live FEN that updates after the user plays a move so the mate visibly
  // lands on the board (the original `card.fen` stays the puzzle key).
  const [boardFen, setBoardFen] = React.useState("");
  const [lastMove, setLastMove] = React.useState<[string, string] | undefined>(
    undefined,
  );
  const [startedAt, setStartedAt] = React.useState(Date.now());

  const problemIdsKey = React.useMemo(() => deck.map((p) => p.id).join(","), [deck]);
  const deckRef = React.useRef(deck);
  deckRef.current = deck;

  const DECK_KEY = "checkmate-patterns";

  React.useLayoutEffect(() => {
    if (deck.length === 0) return;
    const saved = readDeckProblemId(DECK_KEY);
    const i = indexForProblemId(deckRef.current, saved);
    setIdx(Math.min(i, Math.max(0, deckRef.current.length - 1)));
  }, [problemIdsKey, deck.length]);

  React.useEffect(() => {
    const list = deckRef.current;
    if (list.length === 0) return;
    const p = list[idx];
    if (p) writeDeckProblemId(DECK_KEY, p.id);
  }, [idx, problemIdsKey]);

  const card = deck[idx];
  const sideToMove = card?.fen.split(" ")[1] === "b" ? "black" : "white";
  const expected = (card?.solution as string[] | undefined)?.[0] ?? "";

  // Reset board state whenever the displayed card changes.
  React.useEffect(() => {
    if (!card) return;
    setBoardFen(card.fen);
    setLastMove(undefined);
    setRevealed(false);
    setStatus("idle");
    setStartedAt(Date.now());
  }, [card]);

  const recordAttempt = useMutation({
    mutationFn: (solved: boolean) =>
      api("/api/training/attempt", {
        method: "POST",
        body: JSON.stringify({
          problemId: card?.id ?? 0,
          solved,
          timeSpent: Math.round((Date.now() - startedAt) / 1000),
        }),
      }),
  });

  function onMove(from: string, to: string, promotion?: string) {
    if (!card || status !== "idle") return;
    const probe = new Chess(boardFen);
    let played: string | null = null;
    let nextFen = boardFen;
    try {
      const m = probe.move({ from, to, promotion });
      played = m?.san ?? null;
      nextFen = probe.fen();
    } catch {
      return;
    }
    if (!played) return;

    const sanMatches = stripDecor(played) === stripDecor(expected);
    const deliversMate = probe.isCheckmate();

    if (sanMatches && deliversMate) {
      setBoardFen(nextFen);
      setLastMove([from, to]);
      setStatus("solved");
      setRevealed(true);
      recordAttempt.mutate(true);
      toast({
        title: "Checkmate!",
        variant: "success",
      });
      window.setTimeout(() => {
        const len = deckRef.current.length;
        if (len === 0) return;
        setIdx((i) => (i + 1) % len);
      }, 750);
    } else if (sanMatches && !deliversMate) {
      setStatus("wrong");
      recordAttempt.mutate(false);
      toast({
        title: "Not checkmate",
        description:
          "That move matches the card but does not deliver mate — report this card.",
        variant: "destructive",
      });
    } else {
      setStatus("wrong");
      recordAttempt.mutate(false);
      toast({
        title: "Not the mate",
        description: `Expected ${expected}.`,
        variant: "destructive",
      });
    }
  }

  function nextCard(solvedOverride?: boolean) {
    if (card && status === "idle" && solvedOverride !== undefined) {
      // Self-rated path (Got it / Need practice) only applies when the user
      // hasn't already played a move (which auto-records the attempt).
      recordAttempt.mutate(solvedOverride);
    }
    setIdx((i) => (deck.length === 0 ? 0 : (i + 1) % deck.length));
  }

  function retry() {
    if (!card) return;
    setBoardFen(card.fen);
    setLastMove(undefined);
    setStatus("idle");
    // Keep `revealed` so the user can see the answer while they replay.
    setStartedAt(Date.now());
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Checkmate Patterns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recognise the motif and deliver the mate. Play the move on the board, or
            click <em>Reveal</em> to flip the card.
          </p>
        </div>
        {deck.length > 0 && (
          <Badge variant="outline" className="font-mono">
            Card {idx + 1} / {deck.length}
          </Badge>
        )}
      </div>

      {all.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : !card ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No checkmate pattern flashcards yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <div className="max-w-[640px]">
            <Chessboard
              fen={boardFen}
              orientation={sideToMove}
              interactive={status === "idle"}
              movableColor={sideToMove}
              onMove={onMove}
              lastMove={lastMove}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center capitalize">
              {sideToMove} to play and mate
            </p>
          </div>
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Pattern</span>
                  <Badge variant="outline">★ {card.difficulty}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ProblemSourceBadge problem={card} />
                {status === "solved" && (
                  <div className="flex items-center text-accent text-xs gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Mate delivered
                  </div>
                )}
                {status === "wrong" && (
                  <div className="flex items-center text-destructive text-xs gap-2">
                    <XCircle className="w-4 h-4" /> Not the mate — expected{" "}
                    <span className="font-mono">{expected}</span>
                  </div>
                )}
                {revealed ? (
                  <>
                    <p className="text-lg font-bold text-primary">
                      {card.tacticType ?? "—"}
                    </p>
                    {card.explanation && (
                      <p className="text-xs text-muted-foreground">
                        {card.explanation}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Key move: <span className="font-mono">{expected || "—"}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Hidden — what's the mating pattern here?
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setRevealed((r) => !r)}
                >
                  {revealed ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" /> Reveal
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                {status === "wrong" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={retry}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" /> Try again
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  After revealing, mark how confident you were:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      status === "idle" ? nextCard(true) : nextCard()
                    }
                    disabled={!revealed && status === "idle"}
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" /> Got it
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      status === "idle" ? nextCard(false) : nextCard()
                    }
                    disabled={!revealed && status === "idle"}
                  >
                    <ThumbsDown className="w-4 h-4 mr-2" /> Need practice
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => nextCard()}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Skip
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
