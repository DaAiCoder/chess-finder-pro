/**
 * Tiny inline badge that surfaces a training problem's provenance:
 *
 *  - source="user-game"      → "From your game" (with player names if known)
 *  - source="champion-game"  → "Champion game" (with player names if known)
 *  - source="lichess-puzzle" → "Lichess puzzle"
 *  - source="seed"           → no badge (seeded content is uninteresting)
 *  - source="derived"        → no badge (synthetic visualization decks)
 *
 * Player names + date are read from `problem.metadata.{whitePlayer,
 * blackPlayer, playedAt}` — the batch analyzer stamps them on every
 * generated problem so we don't have to JOIN the games table on render.
 */

import { Badge } from "@/components/ui/Badge";
import { User, Crown, Globe } from "lucide-react";
import type { TrainingProblem } from "@shared/schema";

interface MetadataShape {
  whitePlayer?: string | null;
  blackPlayer?: string | null;
  playedAt?: string | null;
  eventOrPlatform?: string | null;
  bucket?: string | null;
  puzzleId?: string | null;
}

export function ProblemSourceBadge({ problem }: { problem: TrainingProblem }) {
  const source = problem.source ?? "";
  const meta = (problem.metadata as MetadataShape | null | undefined) ?? {};

  if (source === "seed" || source === "derived" || source === "") {
    return null;
  }

  if (source === "user-game") {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className="text-[10px] border-primary/60 text-primary bg-primary/10 font-semibold"
        >
          <User className="w-2.5 h-2.5 mr-1" /> From your game
        </Badge>
        {(meta.whitePlayer || meta.blackPlayer) && (
          <span className="text-[10px] text-muted-foreground">
            {meta.whitePlayer ?? "?"} vs {meta.blackPlayer ?? "?"}
            {meta.playedAt && ` · ${formatDate(meta.playedAt)}`}
          </span>
        )}
      </div>
    );
  }

  if (source === "champion-game") {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className="text-[10px] border-amber-500/60 text-amber-300 bg-amber-500/10 font-semibold"
        >
          <Crown className="w-2.5 h-2.5 mr-1" /> Champion game
        </Badge>
        {(meta.whitePlayer || meta.blackPlayer) && (
          <span className="text-[10px] text-muted-foreground">
            {meta.whitePlayer ?? "?"} vs {meta.blackPlayer ?? "?"}
            {meta.playedAt && ` · ${formatDate(meta.playedAt)}`}
          </span>
        )}
      </div>
    );
  }

  if (source === "lichess-puzzle") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-cyan-500/60 text-cyan-300 bg-cyan-500/10 font-semibold"
      >
        <Globe className="w-2.5 h-2.5 mr-1" /> Lichess puzzle
        {meta.puzzleId && (
          <span className="ml-1 font-mono opacity-70">#{meta.puzzleId}</span>
        )}
      </Badge>
    );
  }

  // Anything we don't recognise — a human-readable fallback so we can
  // see new source values land in the wild.
  return (
    <Badge variant="outline" className="text-[10px]">
      {source}
    </Badge>
  );
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}
