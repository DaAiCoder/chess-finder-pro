import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { WeaknessBanner } from "@/components/training/WeaknessBanner";
import { WeaknessMap } from "@/components/training/WeaknessMap";
import { LibrarySourcePanel } from "@/components/training/LibrarySourcePanel";
import {
  Brain,
  Calendar,
  Crown,
  Eye,
  Flame,
  Gauge,
  Goal,
  RotateCcw,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Target,
  Timer,
  BarChart3,
} from "lucide-react";
import type { TrainingProblem, TrainingProgress } from "@shared/schema";
import { TrainingLimitBanner } from "@/components/training/TrainingLimitBanner";
import { Lock } from "lucide-react";

const PRO_HREFS = new Set([
  "/training/plan",
  "/training/repertoire",
  "/training/calculation-ladder",
  "/training/time-pressure",
  "/training/pawn-structures",
  "/training/plans",
  "/training/calculation-studio",
]);

const MODULES = [
  { id: "tactics", name: "Tactics", desc: "Find the winning move from your real blunders.", icon: Sparkles, href: "/training/tactics" },
  { id: "blunder-preventer", name: "Blunder Prevention", desc: "Spot which candidate move loses material.", icon: Target, href: "/training/blunder-preventer" },
  { id: "opening-improver", name: "Openings", desc: "Replay your real opening errors with the best move.", icon: Goal, href: "/training/opening-improver" },
  { id: "advantage-capitalization", name: "Advantage", desc: "Convert winning positions cleanly.", icon: Gauge, href: "/training/advantage" },
  { id: "visualization", name: "Visualization", desc: "Calculate, memorise, and visualise.", icon: Eye, href: "/training/visualization" },
  { id: "endgame", name: "Endgame", desc: "Drill technical endgames.", icon: Flame, href: "/training/endgame" },
  { id: "defender", name: "Defender", desc: "Find the only move that holds a balanced position.", icon: ShieldAlert, href: "/training/defender" },
  { id: "intuition", name: "Intuition", desc: "Spot the mistake in a 5-move window.", icon: Brain, href: "/training/intuition" },
  { id: "checkmate-patterns", name: "Checkmate Patterns", desc: "Recognise mate motifs at a glance.", icon: Crown, href: "/training/checkmate-patterns" },
  { id: "tactics-time", name: "Time Pressure", desc: "Solve under a 30-second ticking clock — with the engine's reasoning afterwards.", icon: Timer, href: "/training/time-pressure" },
  { id: "360", name: "360 Trainer", desc: "Mixed deck — tactics, defender, endgame, retry.", icon: Shuffle, href: "/training/360" },
  { id: "retry", name: "Retry Mistakes", desc: "Re-attempt only the problems you got wrong.", icon: RotateCcw, href: "/training/retry" },
];

export default function TrainingDashboard() {
  const progress = useQuery<TrainingProgress[]>({ queryKey: ["progress"], queryFn: () => api("/api/training/progress") });
  const daily = useQuery<{ problem: TrainingProblem } | null>({ queryKey: ["daily"], queryFn: () => api("/api/daily") });

  const byModule = new Map<string, TrainingProgress>();
  for (const p of progress.data ?? []) byModule.set(p.module, p);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <WeaknessBanner />
      <TrainingLimitBanner />
      <div>
        <h1 className="text-2xl font-bold">Training</h1>
        <p className="text-muted-foreground text-sm">
          Free: daily puzzle cap on core trainers. Pro: unlimited + training from your games.
        </p>
      </div>

      <WeaknessMap />

      <LibrarySourcePanel />

      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/training/plan">
          <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary transition-colors cursor-pointer">
            <CardHeader className="flex-row items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Weekly Plan
                  <Badge variant="outline" className="text-[10px]">
                    <Lock className="w-3 h-3 mr-0.5" /> Pro
                  </Badge>
                </CardTitle>
                <CardDescription>7-day schedule built from your weakest skills.</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/statistics">
          <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary transition-colors cursor-pointer">
            <CardHeader className="flex-row items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-base">My Statistics</CardTitle>
                <CardDescription>Streaks, totals, and per-skill sparklines.</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {daily.data?.problem && (
        <Card className="border-accent/40">
          <CardHeader className="flex-row items-center gap-3">
            <Calendar className="w-5 h-5 text-accent" />
            <div>
              <CardTitle className="text-base">Daily Challenge</CardTitle>
              <CardDescription>Solve today's puzzle to keep your streak alive.</CardDescription>
            </div>
            <Link href="/training/tactics" className="ml-auto">
              <Badge>Solve</Badge>
            </Link>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const prog = byModule.get(m.id);
          const Icon = m.icon;
          const isPro = PRO_HREFS.has(m.href);
          return (
            <Link key={m.id} href={m.href}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    {isPro && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        <Lock className="w-3 h-3 mr-0.5" /> Pro
                      </Badge>
                    )}
                    {prog && !isPro && (
                      <Badge variant="outline" className="ml-auto font-mono">
                        {prog.rating}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{m.desc}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {prog
                    ? `${prog.problemsSolved} / ${prog.totalAttempts} solved · ${(prog.accuracy * 100).toFixed(0)}% accuracy`
                    : "Not started"}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
