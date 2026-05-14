/**
 * Inline AI coach feedback card.
 *
 * Designed to live under the board in trainer pages. Auto-fetches a
 * one-paragraph rationale whenever it sees a `wrong` status for a
 * specific (fen, userMove) tuple and renders it in a soft amber card.
 *
 * Empty / loading states are deliberately understated so the trainer's
 * primary UX (board + verdict) keeps the visual centre of gravity.
 */

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Lightbulb, Loader2 } from "lucide-react";
import { api } from "@/lib/queryClient";

export interface CoachExplanationProps {
  /** FEN BEFORE the user's wrong move. */
  fen: string;
  /** SAN the user played. Component re-fetches when it changes. */
  userMove: string;
  /** SAN of the right answer if known — improves the explanation. */
  correctMove?: string | null;
  /** Motif tag if the trainer knows it. */
  motif?: string | null;
  /** Set to false to suppress the card (e.g. on the first idle render). */
  visible?: boolean;
}

interface CoachResponse {
  text: string;
  cached: boolean;
  model: string;
}

export function CoachExplanation(props: CoachExplanationProps) {
  const { fen, userMove, correctMove, motif, visible = true } = props;

  const m = useMutation<CoachResponse, Error, void>({
    mutationFn: () =>
      api<CoachResponse>("/api/coach/explain", {
        method: "POST",
        body: JSON.stringify({ fen, userMove, correctMove, motif }),
      }),
  });

  // Auto-fire whenever the wrong move changes.
  React.useEffect(() => {
    if (!visible || !fen || !userMove) return;
    m.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, userMove, visible]);

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm flex items-start gap-2">
      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 leading-snug">
        <div className="font-semibold text-amber-700 dark:text-amber-300">
          Coach
        </div>
        {m.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> thinking…
          </div>
        ) : m.isError ? (
          <div className="text-muted-foreground">
            (Coach unavailable: {m.error.message})
          </div>
        ) : (
          <div className="text-foreground">{m.data?.text}</div>
        )}
      </div>
    </div>
  );
}
