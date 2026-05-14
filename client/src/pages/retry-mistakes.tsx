import { useQuery } from "@tanstack/react-query";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { WeaknessBanner } from "@/components/training/WeaknessBanner";
import { Calendar, BookOpen } from "lucide-react";
import { Link } from "wouter";
import type { SrsCard, TrainingProblem } from "@shared/schema";

interface SrsResp {
  cards: { card: SrsCard; problem: TrainingProblem }[];
}

/**
 * Daily Review — backed by the SM-2 SRS queue. Falls back to the
 * legacy retry-mistakes endpoint so users with no SRS history yet
 * still see something useful.
 */
export default function RetryMistakes() {
  const due = useQuery<SrsResp>({
    queryKey: ["srs", "due"],
    queryFn: () => api("/api/srs/due?limit=25"),
  });

  const legacy = useQuery<TrainingProblem[]>({
    queryKey: ["training", "retry"],
    queryFn: () => api(`/api/training/retry`),
    enabled: (due.data?.cards.length ?? 0) === 0,
  });

  const queue = due.data?.cards?.length
    ? due.data.cards.map((c) => c.problem)
    : legacy.data ?? [];

  const reviewDeckKey =
    (due.data?.cards?.length ?? 0) > 0 ? "daily-review:srs" : "daily-review:legacy";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> Daily Review
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spaced-repetition queue of puzzles you've seen before — sorted by what's
            due today. Pass three times and a card retires for weeks.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { due.refetch(); legacy.refetch(); }}>
          Refresh
        </Button>
      </div>

      {due.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              All caught up — no cards are due. Solve more puzzles to seed the queue.
            </p>
            <div className="flex justify-center gap-2">
              <Link href="/onboarding">
                <Button size="sm" variant="outline">
                  <BookOpen className="w-4 h-4 mr-2" /> Run 10-puzzle calibration
                </Button>
              </Link>
              <Link href="/training/tactics">
                <Button size="sm">Tactics</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <PuzzlePlayer problems={queue} deckPersistenceKey={reviewDeckKey} />
      )}
    </div>
  );
}
