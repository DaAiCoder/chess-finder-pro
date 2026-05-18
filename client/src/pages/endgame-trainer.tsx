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

export default function EndgameTrainer() {
  const ctx = useAnalyticsContext();
  const prioritize = usePrioritizeQuerySuffix(ctx);
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "endgame", ctx.fromAnalytics, prioritize],
    queryFn: () => api(`/api/training/problems?module=endgame${prioritize}`),
  });
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div>
        <h1 className="text-2xl font-bold">Endgame</h1>
        <p className="text-muted-foreground text-sm">Drill technical endgames with engine-verified solutions.</p>
      </div>
      {all.isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        <PuzzlePlayer problems={all.data ?? []} deckPersistenceKey="endgame" />
      )}
    </div>
  );
}
