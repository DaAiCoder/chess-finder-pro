import * as React from "react";
import { Link } from "wouter";
import {
  MessageCircle,
  Search,
  Crosshair,
  Lock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export type GatedFeature = "coach" | "analysis" | "opponent";

interface FeatureCopy {
  title: string;
  pitch: string;
  blurb: string;
  bullets: string[];
  icon: React.ComponentType<{ className?: string }>;
  /** Anchor on /welcome where the matching preview lives. */
  previewAnchor: string;
}

const COPY: Record<GatedFeature, FeatureCopy> = {
  coach: {
    title: "Ask Tal — full coach chat",
    pitch: "Multi-turn coaching with the champion of your choice.",
    blurb:
      "The full Coach page keeps a permanent conversation history, deep-links into custom drills, and lets you swap between Tal, Capablanca, and Petrosian on the fly.",
    bullets: [
      "Unlimited messages across as many conversations as you want.",
      "Coach remembers your weak spots and brings them up unprompted.",
      "Open custom drills straight from any reply.",
    ],
    icon: MessageCircle,
    previewAnchor: "/welcome#coach-preview",
  },
  analysis: {
    title: "Best-Move Analysis Board",
    pitch: "Stockfish-grade analysis with coach explanations.",
    blurb:
      "The full analysis board gives you every Stockfish line, full move-by-move evals, deep coach explanations, and a workspace to play out any position against the engine.",
    bullets: [
      "Unlimited engine queries at full depth.",
      "Coach Mode commentary on every move you try.",
      "Load any PGN, FEN, or game from your library.",
    ],
    icon: Search,
    previewAnchor: "/welcome#analysis-preview",
  },
  opponent: {
    title: "Opponent Prep",
    pitch: "Scout any chess.com or lichess player in seconds.",
    blurb:
      "The full Opponent Prep generates a deep scouting report from 50+ recent games, flags blunder patterns and time-trouble tells, and gives you a tailored line to play against them.",
    bullets: [
      "Unlimited scout reports with full game-by-game analysis.",
      "Compare any two players side by side.",
      "Re-run reports on demand as your opponent's form changes.",
    ],
    icon: Crosshair,
    previewAnchor: "/welcome#opponent-preview",
  },
};

/**
 * Page-shaped "sign up to unlock" screen rendered in place of the full
 * page chrome for guests. Has a "Try the preview" button that scrolls
 * the user to the matching widget on /welcome, plus the primary Sign
 * up CTA.
 */
export function SoftGate({ feature }: { feature: GatedFeature }) {
  const copy = COPY[feature];
  const Icon = copy.icon;
  const next = encodeURIComponent(featurePath(feature));
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-2xl p-6 md:p-8 space-y-6 border-emerald-700/40 bg-gradient-to-br from-emerald-950/30 to-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-300">
            <Icon className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <Badge variant="outline" className="mb-1 text-[10px] border-emerald-700/60 text-emerald-200">
              <Lock className="w-3 h-3 mr-1" /> Members only
            </Badge>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{copy.title}</h1>
            <p className="text-sm text-emerald-300/90 leading-snug">{copy.pitch}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{copy.blurb}</p>

        <ul className="space-y-1.5 text-sm">
          {copy.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/90">{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link href={`/signup?next=${next}`} className="flex-1">
            <Button
              className="w-full"
              style={{ backgroundColor: "#769656", color: "white" }}
            >
              Create account
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href={copy.previewAnchor} className="flex-1">
            <Button variant="outline" className="w-full">
              Try the preview
            </Button>
          </Link>
          <Link href={`/login?next=${next}`} className="sm:flex-none">
            <Button variant="ghost" className="w-full sm:w-auto">
              Sign in
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-center text-muted-foreground">
          Create an account for a 3-day Pro trial. After that, a paid yearly plan is
          required. Guests can try limited previews here.
        </p>
      </Card>
    </div>
  );
}

function featurePath(feature: GatedFeature): string {
  switch (feature) {
    case "coach":
      return "/coach";
    case "analysis":
      return "/analysis";
    case "opponent":
      return "/opponent-prep";
  }
}
