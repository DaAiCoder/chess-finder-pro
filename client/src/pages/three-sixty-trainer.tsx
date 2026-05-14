import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import {
  indexForProblemId,
  readDeckProblemId,
  writeDeckProblemId,
} from "@/lib/trainingDeckCursor";
import { WeaknessBanner } from "@/components/training/WeaknessBanner";
import { Shuffle, RefreshCw } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const BUCKET_LABEL: Record<string, string> = {
  tactics: "Tactics",
  defender: "Defender",
  endgame: "Endgame",
  "advantage-capitalization": "Advantage",
  retry: "Retry",
};

const BUCKET_COLOR: Record<string, string> = {
  tactics: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  defender: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  endgame: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "advantage-capitalization": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  retry: "bg-red-500/20 text-red-300 border-red-500/40",
};

interface BucketProblem extends TrainingProblem {
  metadata: { bucket?: string } & Record<string, unknown>;
}

export default function ThreeSixtyTrainer() {
  const { userId } = useCurrentUser();
  const stream = useQuery<BucketProblem[]>({
    queryKey: ["training", "360", userId],
    enabled: userId != null,
    queryFn: () => api(`/api/training/360?userId=${userId}`),
  });

  const [idx, setIdx] = React.useState(0);
  const problems = stream.data ?? [];
  const cur = problems[idx];
  const bucket = (cur?.metadata as { bucket?: string } | null)?.bucket;

  const problemIdsKey = React.useMemo(
    () => problems.map((p) => p.id).join(","),
    [problems],
  );
  const problemsRef = React.useRef(problems);
  problemsRef.current = problems;

  const deckKey =
    userId != null ? `360:user:${userId}` : "360:anon";

  React.useLayoutEffect(() => {
    if (problems.length === 0) return;
    const saved = readDeckProblemId(deckKey);
    const i = indexForProblemId(problemsRef.current, saved);
    setIdx(Math.min(i, problemsRef.current.length - 1));
  }, [deckKey, problemIdsKey, problems.length]);

  React.useEffect(() => {
    const list = problemsRef.current;
    if (list.length === 0) return;
    const p = list[idx];
    if (p) writeDeckProblemId(deckKey, p.id);
  }, [deckKey, idx, problemIdsKey]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shuffle className="w-6 h-6 text-primary" /> 360 Trainer
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mixed deck — tactics, defender, endgame, advantage and your retry queue
            interleaved so every position is a different kind of question.
          </p>
        </div>
        <div className="flex gap-2">
          {bucket && (
            <Badge
              variant="outline"
              className={`font-mono ${BUCKET_COLOR[bucket] ?? ""}`}
            >
              Mode: {BUCKET_LABEL[bucket] ?? bucket}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => stream.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reshuffle
          </Button>
        </div>
      </div>

      {stream.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : problems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No problems available yet — analyze some games first to build out the
            defender / retry buckets.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Problem {idx + 1} of {problems.length}
          </p>
          {/* PuzzlePlayer cycles internally on Next; we slice to the current
              problem so the bucket badge above stays in sync. The reshuffle
              button regenerates the deck server-side. */}
          <PuzzlePlayer
            problems={[cur]}
            showNext={false}
            autoAdvanceOnSolve={false}
            onSolved={() =>
              setTimeout(() => setIdx((i) => Math.min(i + 1, problems.length - 1)), 800)
            }
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIdx((i) => Math.min(i + 1, problems.length - 1))}
              disabled={idx >= problems.length - 1}
            >
              Skip to next →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
