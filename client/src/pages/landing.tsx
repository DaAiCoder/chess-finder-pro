import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  Search,
  Compass,
  Crosshair,
  EyeOff,
  Sparkles,
  ArrowRight,
  Crown,
  Flame,
  Trophy,
  Brain,
  Cpu,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Target,
  Gauge,
  Goal,
  Calculator,
  LayoutGrid,
  TrendingUp,
  Timer,
  Shuffle,
  BookOpen,
  RotateCcw,
  Calendar,
  Zap,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PREVIEW_BUDGET } from "@/hooks/usePreviewQuota";
import { api } from "@/lib/queryClient";
import { SiteFooter } from "@/components/SiteFooter";
import { CoachPreview } from "@/components/landing/CoachPreview";
import { AnalysisPreview } from "@/components/landing/AnalysisPreview";
import { BlindTacticsPreview } from "@/components/landing/BlindTacticsPreview";
import { OpponentPreview } from "@/components/landing/OpponentPreview";
import { cn } from "@/lib/utils";

/**
 * Marketing landing page for ChessFinderPro.
 *
 * Layout (top → bottom):
 *   1. Hero — "Get better at chess, fast!" tagline + dual CTAs.
 *   2. Trust strip — quick credibility row.
 *   3. Embedded previews — Coach, Analysis, Blind Tactics, Opponent
 *      (3 free tries each via `usePreviewQuota`).
 *   4. Training Hub grid — every trainer, all open to guests.
 *   5. Why different — 6 differentiator bullets.
 *   6. Pricing teaser (guest only).
 *   7. Final CTA.
 *
 * Full pages `/coach`, `/analysis`, and `/opponent-prep` are behind
 * `RequireAuth`; everything else (training hub, play, openings,
 * discover, etc.) stays open to guests.
 */
export default function LandingPage() {
  const { user } = useCurrentUser();
  const signedIn = !!user && !user.anonymous;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar signedIn={signedIn} username={user?.username} />

      <main>
        <div className="relative isolate overflow-hidden">
          <HeroBackdrop />
          <div className="relative max-w-6xl mx-auto px-4 md:px-6">
            {signedIn ? (
              <WelcomeBackHero username={user.username} />
            ) : (
              <GuestHero />
            )}
            <TrustStrip />
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 pb-20 space-y-20 pt-16">
          <FeaturePreviews />
          <TrainersGrid />
          <WhyDifferent />
          {!signedIn && <PricingTeaser />}
          <FinalCTA signedIn={signedIn} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Backdrop                                                               */
/* ---------------------------------------------------------------------- */

function HeroBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-[#0e1822] via-[#0f1923]/95 to-background"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-emerald-600/15 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute top-20 -right-32 w-[400px] h-[400px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none"
      />
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Top bar                                                                */
/* ---------------------------------------------------------------------- */

function TopBar({ signedIn, username }: { signedIn: boolean; username?: string }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-background/70 border-b border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded text-white font-bold"
            style={{ backgroundColor: "#769656" }}
          >
            ♞
          </span>
          ChessFinderPro
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-6 text-sm text-muted-foreground">
          <a href="#previews" className="px-3 py-1.5 rounded hover:bg-secondary hover:text-foreground">
            Features
          </a>
          <a href="#training" className="px-3 py-1.5 rounded hover:bg-secondary hover:text-foreground">
            Training hub
          </a>
          <a href="#why" className="px-3 py-1.5 rounded hover:bg-secondary hover:text-foreground">
            Why us
          </a>
          <a href="#pricing" className="px-3 py-1.5 rounded hover:bg-secondary hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <Link href="/analysis">
              <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
                Open app
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
                  Sign up free
                </Button>
              </Link>
            </>
          )}
          {signedIn && username && (
            <span className="hidden sm:inline text-xs text-muted-foreground ml-2">
              @{username}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Heroes                                                                 */
/* ---------------------------------------------------------------------- */

function GuestHero() {
  return (
    <section className="pt-16 md:pt-28 pb-12 md:pb-16 text-center space-y-7">
      <Badge
        variant="outline"
        className="mx-auto inline-flex items-center gap-1.5 border-emerald-700/60 bg-emerald-950/40 text-emerald-200 backdrop-blur-sm"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Your personal chess trainer · powered by Stockfish 17
      </Badge>

      <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.02]">
        Get better at chess,
        <br />
        <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-amber-300 bg-clip-text text-transparent">
          fast.
        </span>
      </h1>

      <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Personal coaching, instant analysis, opening discovery, opponent scouting,
        and a full deck of trainers — all in one app. Train smarter, not longer.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
        <Link href="/signup">
          <Button
            size="lg"
            className="text-base px-7 h-12 shadow-lg shadow-emerald-950/40"
            style={{ backgroundColor: "#769656", color: "white" }}
          >
            <Rocket className="w-5 h-5 mr-2" />
            Start free — no card
          </Button>
        </Link>
        <a href="#previews">
          <Button size="lg" variant="outline" className="text-base px-7 h-12">
            Try it right now
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </a>
      </div>

      <p className="text-xs text-muted-foreground pt-1">
        {PREVIEW_BUDGET} free actions per flagship feature, right here on this page.
      </p>
    </section>
  );
}

function WelcomeBackHero({ username }: { username: string }) {
  return (
    <section className="pt-16 md:pt-20 pb-8 text-center space-y-5">
      <Badge
        variant="outline"
        className="mx-auto inline-flex items-center gap-1.5 border-emerald-700/60 bg-emerald-950/40 text-emerald-200 backdrop-blur-sm"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Welcome back, @{username}
      </Badge>
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
        Get better at chess,
        <br />
        <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-amber-300 bg-clip-text text-transparent">
          fast.
        </span>
      </h1>
      <p className="text-muted-foreground max-w-xl mx-auto">
        Pick up where you left off, or explore a new trainer below.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Link href="/analysis">
          <Button style={{ backgroundColor: "#769656", color: "white" }}>
            Open analysis
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Link href="/training">
          <Button variant="outline">Training hub</Button>
        </Link>
        <Link href="/coach">
          <Button variant="outline">Coach</Button>
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Trust strip                                                            */
/* ---------------------------------------------------------------------- */

function TrustStrip() {
  const items: { icon: LucideIcon; label: string }[] = [
    { icon: Cpu, label: "Stockfish 17" },
    { icon: Brain, label: "AI coach modes" },
    { icon: BookOpen, label: "2,000+ master games" },
    { icon: Trophy, label: "Persona-bot tournaments" },
    { icon: Zap, label: "Spaced repetition" },
  ];
  return (
    <div className="border-y border-border/60 bg-card/40 backdrop-blur-sm rounded-xl my-2 md:my-6">
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 text-[12px] md:text-xs text-muted-foreground">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Embedded feature previews                                              */
/* ---------------------------------------------------------------------- */

type PreviewCardSpec = {
  id: string;
  anchor: string;
  badge: string;
  title: string;
  pitch: string;
  blurb: string;
  href: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
  Preview: React.ComponentType;
};

const PREVIEWS: PreviewCardSpec[] = [
  {
    id: "coach",
    anchor: "coach-preview",
    badge: "AI Coach",
    title: "Ask Tal",
    pitch: "Coach in the voice of any world champion.",
    blurb:
      "Pick a personality — Tal's tactics, Capablanca's clarity, Petrosian's defense — and chat about any position. Try a sample question or ask your own.",
    href: "/coach",
    accent: "from-purple-600/20 to-fuchsia-600/10",
    icon: MessageCircle,
    Preview: CoachPreview,
  },
  {
    id: "analysis",
    anchor: "analysis-preview",
    badge: "Analysis",
    title: "Best-Move Board",
    pitch: "Stockfish-grade analysis, one click deep.",
    blurb:
      "Play a move on the board and watch Stockfish's best reply, eval, and full principal variation appear. The full board accepts any FEN, PGN, or library game.",
    href: "/analysis",
    accent: "from-emerald-600/20 to-teal-600/10",
    icon: Search,
    Preview: AnalysisPreview,
  },
  {
    id: "blind",
    anchor: "blind-preview",
    badge: "Visualization",
    title: "Blind Tactics",
    pitch: "Calculate without seeing the moves.",
    blurb:
      "The board never updates. Play the listed moves in your head, then find the winning tactic in the position you visualize — the way grandmasters actually calculate.",
    href: "/training/visualization",
    accent: "from-indigo-600/20 to-violet-600/10",
    icon: EyeOff,
    Preview: BlindTacticsPreview,
  },
  {
    id: "opponent",
    anchor: "opponent-preview",
    badge: "Pre-game",
    title: "Opponent Prep",
    pitch: "Walk into your next game with a plan.",
    blurb:
      "Drop a chess.com or Lichess handle to see win-rate, pet openings, and recent form. The full report digs into blunder patterns, time-trouble tells, and exact lines to play against them.",
    href: "/opponent-prep",
    accent: "from-rose-600/20 to-red-600/10",
    icon: Crosshair,
    Preview: OpponentPreview,
  },
];

function FeaturePreviews() {
  return (
    <section id="previews" className="space-y-8 scroll-mt-20">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 font-semibold">
          Try before you sign up
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Four flagship features — live, right here
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          {PREVIEW_BUDGET} free actions per widget. Sign up to unlock unlimited use
          across the full app — plus history, ratings, and cross-device sync.
        </p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {PREVIEWS.map((p) => (
          <PreviewCard key={p.id} spec={p} />
        ))}
      </div>
    </section>
  );
}

function PreviewCard({ spec }: { spec: PreviewCardSpec }) {
  const { icon: Icon, accent, title, pitch, blurb, href, badge, anchor, Preview } = spec;
  return (
    <Card
      id={anchor}
      className="relative overflow-hidden p-5 md:p-6 flex flex-col gap-4 scroll-mt-20 hover:border-emerald-700/60 transition-colors"
    >
      <div
        className={cn(
          "absolute inset-0 opacity-40 pointer-events-none bg-gradient-to-br",
          accent,
        )}
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-background/80 border border-border text-emerald-400 shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Badge variant="secondary" className="mb-1 text-[10px]">
            {badge}
          </Badge>
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          <p className="text-sm text-emerald-300/90 leading-snug">{pitch}</p>
        </div>
      </div>
      <p className="relative text-sm text-muted-foreground leading-relaxed">{blurb}</p>
      <div className="relative pt-1">
        <Preview />
      </div>
      <div className="relative pt-1">
        <Link href={`/signup?next=${encodeURIComponent(href)}`}>
          <Button variant="outline" size="sm">
            Open full {title.toLowerCase()}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Training Hub grid                                                      */
/* ---------------------------------------------------------------------- */

type TrainerSpec = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  accent: string; // tailwind color token used for the icon halo + ring
  featured?: boolean;
};

const TRAINERS: TrainerSpec[] = [
  {
    href: "/training/360",
    label: "360 Trainer",
    desc: "Mixed deck — tactics, defender, endgame, retry. Best place to start.",
    icon: Shuffle,
    accent: "emerald",
    featured: true,
  },
  {
    href: "/training/tactics",
    label: "Tactics",
    desc: "Find the winning move from real-game blunders, rated to your edge.",
    icon: Sparkles,
    accent: "amber",
    featured: true,
  },
  {
    href: "/training/blunder-preventer",
    label: "Blunder Prevention",
    desc: "Spot which candidate move loses material before you play it.",
    icon: Target,
    accent: "rose",
  },
  {
    href: "/training/checkmate-patterns",
    label: "Checkmate Patterns",
    desc: "Recognize back-rank, smothered, ladder, and 30+ mating motifs at a glance.",
    icon: Crown,
    accent: "yellow",
    featured: true,
  },
  {
    href: "/training/visualization",
    label: "Visualization",
    desc: "Calculate, memorize, and visualize lines without moving the pieces.",
    icon: Eye,
    accent: "purple",
  },
  {
    href: "/training/calculation-studio",
    label: "Calculation Studio",
    desc: "4–8 move forcing lines, blindfold — the way grandmasters actually calculate.",
    icon: Calculator,
    accent: "indigo",
    featured: true,
  },
  {
    href: "/training/calculation-ladder",
    label: "Calculation Ladder",
    desc: "Step-by-step depth ladder: 2 moves, then 3, then 4 — build calc muscle.",
    icon: TrendingUp,
    accent: "sky",
  },
  {
    href: "/training/intuition",
    label: "Intuition",
    desc: "Spot the mistake hidden in a 5-move window. Sharpen pattern recognition.",
    icon: Brain,
    accent: "fuchsia",
  },
  {
    href: "/training/time-pressure",
    label: "Time Pressure",
    desc: "Solve under a 30-second ticking clock — with engine reasoning afterwards.",
    icon: Timer,
    accent: "red",
  },
  {
    href: "/training/defender",
    label: "Defender",
    desc: "Find the only move that holds in balanced or worse positions.",
    icon: ShieldAlert,
    accent: "slate",
  },
  {
    href: "/training/advantage",
    label: "Advantage Conversion",
    desc: "Drill the technique of converting winning positions cleanly.",
    icon: Gauge,
    accent: "teal",
  },
  {
    href: "/training/endgame",
    label: "Endgame",
    desc: "K+P, R+K, opposite-color bishops — the technical positions every player meets.",
    icon: Flame,
    accent: "orange",
  },
  {
    href: "/training/pawn-structures",
    label: "Pawn Structures",
    desc: "Overview → quiz → drills for IQP, Stonewall, Maroczy, hedgehog, and more.",
    icon: LayoutGrid,
    accent: "lime",
  },
  {
    href: "/training/plans",
    label: "Plan Finder",
    desc: "Pick the right strategic plan for the position, then play it out.",
    icon: Compass,
    accent: "cyan",
  },
  {
    href: "/training/repertoire",
    label: "Repertoire Trainer",
    desc: "Drill your own opening tree from any PGN — variations and all.",
    icon: BookOpen,
    accent: "blue",
  },
  {
    href: "/training/opening-improver",
    label: "Opening Improver",
    desc: "Replay your own opening mistakes with the engine's best move.",
    icon: Goal,
    accent: "violet",
  },
  {
    href: "/training/retry",
    label: "Daily Review",
    desc: "FSRS-scheduled review of every problem you've missed — your daily dose.",
    icon: RotateCcw,
    accent: "pink",
  },
  {
    href: "/training/plan",
    label: "Weekly Plan",
    desc: "Auto-built 7-day schedule from your weakest skills.",
    icon: Calendar,
    accent: "emerald",
  },
];

const ACCENT_CLASSES: Record<string, { halo: string; icon: string; ring: string }> = {
  emerald: { halo: "bg-emerald-500/15", icon: "text-emerald-400", ring: "hover:border-emerald-700/60" },
  amber: { halo: "bg-amber-500/15", icon: "text-amber-300", ring: "hover:border-amber-700/60" },
  rose: { halo: "bg-rose-500/15", icon: "text-rose-300", ring: "hover:border-rose-700/60" },
  yellow: { halo: "bg-yellow-500/15", icon: "text-yellow-300", ring: "hover:border-yellow-700/60" },
  purple: { halo: "bg-purple-500/15", icon: "text-purple-300", ring: "hover:border-purple-700/60" },
  indigo: { halo: "bg-indigo-500/15", icon: "text-indigo-300", ring: "hover:border-indigo-700/60" },
  sky: { halo: "bg-sky-500/15", icon: "text-sky-300", ring: "hover:border-sky-700/60" },
  fuchsia: { halo: "bg-fuchsia-500/15", icon: "text-fuchsia-300", ring: "hover:border-fuchsia-700/60" },
  red: { halo: "bg-red-500/15", icon: "text-red-300", ring: "hover:border-red-700/60" },
  slate: { halo: "bg-slate-500/15", icon: "text-slate-300", ring: "hover:border-slate-600/60" },
  teal: { halo: "bg-teal-500/15", icon: "text-teal-300", ring: "hover:border-teal-700/60" },
  orange: { halo: "bg-orange-500/15", icon: "text-orange-300", ring: "hover:border-orange-700/60" },
  lime: { halo: "bg-lime-500/15", icon: "text-lime-300", ring: "hover:border-lime-700/60" },
  cyan: { halo: "bg-cyan-500/15", icon: "text-cyan-300", ring: "hover:border-cyan-700/60" },
  blue: { halo: "bg-blue-500/15", icon: "text-blue-300", ring: "hover:border-blue-700/60" },
  violet: { halo: "bg-violet-500/15", icon: "text-violet-300", ring: "hover:border-violet-700/60" },
  pink: { halo: "bg-pink-500/15", icon: "text-pink-300", ring: "hover:border-pink-700/60" },
};

function TrainersGrid() {
  return (
    <section id="training" className="space-y-8 scroll-mt-20">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 font-semibold">
          Training hub
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          18 trainers. One adaptive engine.
        </h2>
        <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
          Every module rates you on the motif level and serves problems right at your
          edge. All trainers are <span className="text-foreground/90">open for guests</span> —
          sign up to keep your ratings and history.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {TRAINERS.map((t) => (
          <TrainerCard key={t.href} spec={t} />
        ))}
      </div>
      <div className="flex justify-center pt-2">
        <Link href="/training">
          <Button variant="outline" size="lg">
            Open the full training hub
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

function TrainerCard({ spec }: { spec: TrainerSpec }) {
  const { href, label, desc, icon: Icon, accent, featured } = spec;
  const cls = ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.emerald;
  return (
    <Link href={href}>
      <Card
        className={cn(
          "relative overflow-hidden h-full p-4 flex flex-col gap-2 cursor-pointer transition-all",
          "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/30",
          cls.ring,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
              cls.halo,
              cls.icon,
            )}
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold leading-tight">{label}</h3>
              {featured && (
                <Badge
                  variant="outline"
                  className="text-[9px] border-emerald-700/60 text-emerald-300 px-1 py-0 leading-none h-4"
                >
                  popular
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Why different                                                          */
/* ---------------------------------------------------------------------- */

const BULLETS = [
  {
    icon: Brain,
    title: "Adaptive difficulty",
    body: "Every puzzle tracks your motif rating and serves the next problem right at your edge — no more grinding what's too easy or impossibly hard.",
  },
  {
    icon: Flame,
    title: "Spaced repetition",
    body: "Every mistake becomes a flashcard. FSRS schedules the review right before you're about to forget — the same algorithm Anki upgraded to.",
  },
  {
    icon: Trophy,
    title: "Persona bots & tournaments",
    body: "Play Capablanca, Tal, Petrosian, or a 1200 club player. Or join a 5-round Swiss against rotating personalities for tournament reps.",
  },
  {
    icon: Eye,
    title: "Blind calculation",
    body: "Train pure visualization with 4–8 move forcing lines. No board updates — only the squares in your head. The way grandmasters calculate.",
  },
  {
    icon: Cpu,
    title: "Your own engine",
    body: "Stockfish 17 runs locally — fast, private, and free. Plug in your own GPU server later for even deeper search.",
  },
  {
    icon: ShieldCheck,
    title: "Your data, your machine",
    body: "Self-host the whole stack on your laptop. Your games and your ratings never leave your hardware unless you opt into cross-device sync.",
  },
];

function WhyDifferent() {
  return (
    <section id="why" className="space-y-8 scroll-mt-20">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 font-semibold">
          Why ChessFinderPro
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Built for the way humans actually improve
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Most apps gamify puzzle solving. We rebuilt the entire training loop —
          calibration, repetition, prep, play.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BULLETS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-border bg-card/60 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-emerald-600/15 text-emerald-400">
                <Icon className="w-4 h-4" />
              </span>
              <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Pricing teaser                                                         */
/* ---------------------------------------------------------------------- */

function PricingTeaser() {
  const { data: pricing } = useQuery({
    queryKey: ["/api/pricing"],
    queryFn: () =>
      api<{
        monthlyUsd: number;
        yearlyUsd: number;
        currency: string;
      }>("/api/pricing"),
    staleTime: 60_000,
  });

  const cur = pricing?.currency ?? "USD";
  const monthly = pricing?.monthlyUsd ?? 12.99;
  const yearly = pricing?.yearlyUsd ?? 79;
  const yearlyMonthly = yearly / 12;
  const fmt = React.useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [cur],
  );

  return (
    <section id="pricing" className="space-y-6 scroll-mt-20">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 font-semibold">
          Pricing
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          3-day trial, then Pro
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          New accounts get full Pro for 3 days. Subscribe on the yearly plan to keep Ask Tal,
          Analysis, Blind Tactics, and Opponent Prep. Monthly billing is waitlisted.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <PlanCard
          title="Trial"
          tag="New accounts"
          price="Free"
          priceNote="3 days full Pro"
          features={[
            "Unlimited Coach, Analysis, Blind Tactics, and Opponent Prep during trial",
            "Every training-hub trainer unlocked",
            "Play vs Stockfish and persona bots",
            `Guests: ${PREVIEW_BUDGET} preview tries per feature on this page only`,
          ]}
          cta={{ label: "Create account", href: "/signup?mode=register", primary: false }}
          outline
        />
        <PlanCard
          title="Pro"
          tag="Yearly"
          price={fmt.format(yearlyMonthly)}
          priceNote={`per month · ${fmt.format(yearly)} billed yearly`}
          features={[
            "Unlimited Ask Tal, Analysis, Blind Tactics, Opponent Prep",
            "Cross-device sync for ratings, history, and saved positions",
            "Priority Stockfish depth and faster coach responses",
            "Secure checkout via Stripe · cancel anytime from Account",
          ]}
          cta={{ label: "Subscribe yearly", href: "/pricing?plan=yearly", primary: true }}
          accent
        />
      </div>
    </section>
  );
}

function PlanCard({
  title,
  tag,
  price,
  priceNote,
  features,
  cta,
  accent,
  outline,
}: {
  title: string;
  tag: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: { label: string; href: string; primary: boolean };
  accent?: boolean;
  outline?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-6 space-y-4 flex flex-col",
        accent && "border-emerald-700/60 bg-gradient-to-br from-emerald-950/40 to-card",
        outline && "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
        <Badge variant="outline" className="text-[10px]">
          {tag}
        </Badge>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-xs text-muted-foreground">/ {priceNote}</span>
      </div>
      <ul className="space-y-2 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>
      <Link href={cta.href}>
        <Button
          className="w-full"
          variant={cta.primary ? "default" : "outline"}
          style={cta.primary ? { backgroundColor: "#769656", color: "white" } : undefined}
        >
          {cta.label}
        </Button>
      </Link>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Final CTA                                                              */
/* ---------------------------------------------------------------------- */

function FinalCTA({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <section className="text-center space-y-3">
        <Crown className="w-8 h-8 text-amber-400 mx-auto" />
        <h2 className="text-2xl md:text-3xl font-bold">Ready to climb?</h2>
        <p className="text-sm text-muted-foreground">
          Your weekly plan is waiting in the training hub.
        </p>
        <Link href="/training">
          <Button size="lg" style={{ backgroundColor: "#769656", color: "white" }}>
            Open training hub
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </section>
    );
  }
  return (
    <section className="text-center space-y-5">
      <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
        Stop drifting.{" "}
        <span className="bg-gradient-to-r from-emerald-300 to-amber-300 bg-clip-text text-transparent">
          Start climbing.
        </span>
      </h2>
      <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
        Make a free account and we&apos;ll calibrate your strengths in five minutes,
        then build your weekly plan automatically.
      </p>
      <div className="flex justify-center gap-3 pt-1">
        <Link href="/signup">
          <Button
            size="lg"
            className="text-base px-7 h-12 shadow-lg shadow-emerald-950/40"
            style={{ backgroundColor: "#769656", color: "white" }}
          >
            <Rocket className="w-5 h-5 mr-2" />
            Get better, fast
          </Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline" className="text-base px-7 h-12">
            Sign in
          </Button>
        </Link>
      </div>
    </section>
  );
}
