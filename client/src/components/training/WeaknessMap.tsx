/**
 * Weakness Map hero card.
 *
 * Reads `/api/weaknesses` (joining attempts + motif skill + metrics)
 * and surfaces the top-3 weak motifs with a "Practice now" CTA each.
 *
 * Empty-state: tells brand-new users to start with onboarding.
 */

import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sparkles, AlertTriangle, ChevronRight } from "lucide-react";
import { api } from "@/lib/queryClient";

interface WeaknessRow {
  motifKey: string;
  name: string;
  accuracyPct: number;
  attempts: number;
  rating: number;
  href: string;
}

interface Resp {
  weaknesses: WeaknessRow[];
}

export function WeaknessMap() {
  const q = useQuery<Resp>({
    queryKey: ["weaknesses"],
    queryFn: () => api("/api/weaknesses?limit=3"),
  });

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Your top 3 weak spots
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading && <SkeletonRow />}
        {!q.isLoading && (q.data?.weaknesses ?? []).length === 0 && (
          <div className="rounded-lg bg-card p-3 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div className="text-sm flex-1">
              <div className="font-medium">No weakness profile yet.</div>
              <div className="text-xs text-muted-foreground">
                Take the 10-puzzle calibration to bootstrap your map.
              </div>
            </div>
            <Link href="/onboarding">
              <a>
                <Button size="sm">Start calibration</Button>
              </a>
            </Link>
          </div>
        )}
        {(q.data?.weaknesses ?? []).map((w) => (
          <Link key={w.motifKey} href={w.href}>
            <a className="block">
              <div className="rounded-lg border bg-card hover:bg-accent transition px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {w.accuracyPct}% over {w.attempts} attempts
                  </div>
                </div>
                <Badge variant="outline" className="font-mono">{w.rating}</Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </a>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 animate-pulse text-xs text-muted-foreground">
      Loading your weakness map…
    </div>
  );
}
