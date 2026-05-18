/**
 * Banner shown at the top of every training module when the user
 * arrived from the Analytics page's "PRACTICE" / "Start drill" button.
 *
 * The deep-link convention is `?from=analytics&weakness=tactics&score=1861&delta=-10&username=foo`.
 * If `from` is missing or anything other than "analytics" the component
 * renders nothing, so existing standalone trainer flows are untouched.
 *
 * Companion hook {@link useAnalyticsContext} returns the parsed params
 * so trainer pages can pass `prioritizeUserGames=true&sourceUserId=…`
 * to `/api/training/problems`.
 */

import * as React from "react";
import { Link, useSearch } from "wouter";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ArrowDown, ArrowLeft, ArrowUp, Sparkles } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type WeaknessSlug =
  | "tactics"
  | "opening"
  | "advantage-capitalization"
  | "resourcefulness"
  | "endgame"
  | "time-management";

const WEAKNESS_LABEL: Record<WeaknessSlug, string> = {
  tactics: "Tactics",
  opening: "Opening",
  "advantage-capitalization": "Advantage Capitalization",
  resourcefulness: "Resourcefulness",
  endgame: "Endgame",
  "time-management": "Time Management",
};

export interface AnalyticsContext {
  /** True when the page was loaded from an analytics PRACTICE link. */
  fromAnalytics: boolean;
  weakness: WeaknessSlug | null;
  score: number | null;
  delta: number | null;
  username: string | null;
}

export function useAnalyticsContext(): AnalyticsContext {
  const search = useSearch();
  return React.useMemo(() => parseAnalyticsContext(search), [search]);
}

export function parseAnalyticsContext(search: string): AnalyticsContext {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  if (from !== "analytics") {
    return { fromAnalytics: false, weakness: null, score: null, delta: null, username: null };
  }
  const rawWeakness = params.get("weakness");
  const weakness = isWeaknessSlug(rawWeakness) ? rawWeakness : null;
  const score = numberOrNull(params.get("score"));
  const delta = numberOrNull(params.get("delta"));
  const username = params.get("username")?.trim() || null;
  return { fromAnalytics: true, weakness, score, delta, username };
}

export function WeaknessBanner() {
  const ctx = useAnalyticsContext();
  if (!ctx.fromAnalytics) return null;

  const label = ctx.weakness ? WEAKNESS_LABEL[ctx.weakness] : "this skill";
  const positive = (ctx.delta ?? 0) >= 0;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <div className="p-3 flex flex-wrap items-center gap-3 text-sm">
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold">
            Working on your <span className="text-primary">{label}</span> weakness
            {ctx.username && (
              <span className="text-muted-foreground font-normal"> · {ctx.username}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drilling problems sourced from your imported games first.
          </p>
        </div>
        {ctx.score != null && (
          <Badge variant="outline" className="font-mono">{Math.round(ctx.score)}</Badge>
        )}
        {ctx.delta != null && (
          <Badge variant={positive ? "success" : "destructive"} className="font-mono">
            {positive ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
            {Math.round(ctx.delta)}
          </Badge>
        )}
        <Link
          href={ctx.username ? `/analytics?username=${encodeURIComponent(ctx.username)}` : "/analytics"}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to analytics
        </Link>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isWeaknessSlug(v: string | null): v is WeaknessSlug {
  return (
    v === "tactics" ||
    v === "opening" ||
    v === "advantage-capitalization" ||
    v === "resourcefulness" ||
    v === "endgame" ||
    v === "time-management"
  );
}

function numberOrNull(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Append the standard `prioritizeUserGames` + `sourceUserId` filter to a
 * training-problems query string when the user is in the analytics
 * context. Keeps callers terse:
 *
 *   const ctx = useAnalyticsContext();
 *   useQuery(["training", "tactics", ctx.fromAnalytics],
 *     () => api(`/api/training/problems?module=tactics${prioritizeQuery(ctx)}`));
 */
export function prioritizeQuery(
  ctx: AnalyticsContext,
  sourceUserId = 1,
  /** Pro-only: puzzles from the user's imported games first. */
  allowPersonalized = false,
): string {
  if (!ctx.fromAnalytics || !allowPersonalized) return "";
  return `&prioritizeUserGames=true&sourceUserId=${sourceUserId}`;
}

/** Appends personalized-game filter when analytics deep-link + Pro. */
export function usePrioritizeQuerySuffix(ctx: AnalyticsContext, sourceUserId = 1): string {
  const { user } = useCurrentUser();
  return prioritizeQuery(ctx, sourceUserId, user?.hasProAccess === true);
}
