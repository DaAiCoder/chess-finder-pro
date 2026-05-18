import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PuzzlePlayer } from "@/components/chess/PuzzlePlayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Card, CardContent } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import {
  useAnalyticsContext,
  usePrioritizeQuerySuffix,
  WeaknessBanner,
} from "@/components/training/WeaknessBanner";
import type { TrainingProblem } from "@shared/schema";

export default function TacticsTrainer() {
  const ctx = useAnalyticsContext();
  const prioritize = usePrioritizeQuerySuffix(ctx);
  const all = useQuery<TrainingProblem[]>({
    queryKey: ["training", "tactics", ctx.fromAnalytics, prioritize],
    queryFn: () => api(`/api/training/problems?module=tactics${prioritize}`),
  });
  const [tacticType, setTacticType] = React.useState<string>("any");

  const types = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of all.data ?? []) if (p.tacticType) set.add(p.tacticType);
    return Array.from(set).sort();
  }, [all.data]);

  const problems = React.useMemo(() => {
    if (!all.data) return [];
    return tacticType === "any" ? all.data : all.data.filter((p) => p.tacticType === tacticType);
  }, [all.data, tacticType]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tactics</h1>
          <p className="text-muted-foreground text-sm">Drill patterns from your real games and our seed library.</p>
        </div>
        <div className="ml-auto w-64">
          <Label>Pattern</Label>
          <Select value={tacticType} onValueChange={setTacticType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any (mixed)</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {all.isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        <PuzzlePlayer problems={problems} deckPersistenceKey={`tactics:${tacticType}`} />
      )}
    </div>
  );
}
