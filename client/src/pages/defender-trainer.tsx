import { useQuery } from "@tanstack/react-query";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { Card, CardContent } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import {
  useAnalyticsContext,
  usePrioritizeQuerySuffix,
  WeaknessBanner,
} from "@/components/training/WeaknessBanner";
import { ShieldAlert } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

export default function DefenderTrainer() {
  const ctx = useAnalyticsContext();
  const prioritize = usePrioritizeQuerySuffix(ctx);
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "defender", ctx.fromAnalytics, prioritize],
    queryFn: () => api(`/api/training/problems?module=defender${prioritize}`),
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" /> Defender
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Find the only move that holds. The position was balanced — one slip
          and you're lost.
        </p>
      </div>
      {all.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : (
        <PuzzlePlayer problems={all.data ?? []} deckPersistenceKey="defender" />
      )}
    </div>
  );
}
