import { useQuery } from "@tanstack/react-query";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { Card, CardContent } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import {
  useAnalyticsContext,
  usePrioritizeQuerySuffix,
  WeaknessBanner,
} from "@/components/training/WeaknessBanner";
import type { TrainingProblem } from "@shared/schema";

export default function OpeningImprover() {
  const ctx = useAnalyticsContext();
  const prioritize = usePrioritizeQuerySuffix(ctx);
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "opening-improver", ctx.fromAnalytics, prioritize],
    queryFn: () => api(`/api/training/problems?module=opening-improver${prioritize}`),
  });
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div>
        <h1 className="text-2xl font-bold">Openings</h1>
        <p className="text-muted-foreground text-sm">
          Replay opening positions where you went wrong, with the principled move as solution.
        </p>
      </div>
      {all.isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        <PuzzlePlayer problems={all.data ?? []} deckPersistenceKey="opening-improver" />
      )}
    </div>
  );
}
